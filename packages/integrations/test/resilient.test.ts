import { beforeEach, describe, expect, it } from 'vitest'

import { parseCaixaPayload } from '../src/caixa/parse'
import type { LotteryResultProvider } from '../src/caixa/provider'
import {
  AllProvidersFailedError,
  ResilientResultProvider,
  type ResilientEvent,
} from '../src/caixa/resilient'
import type { ContestResult, LotterySlug } from '@lotopro/core'
import { loadFixture } from './load-fixture'

const CONTEST = parseCaixaPayload(loadFixture('megasena-3038'), 'megasena')

/** Provider falso, sem rede: programável para falhar ou responder. */
class FakeProvider implements LotteryResultProvider {
  healthy = true
  calls = 0
  constructor(readonly name: string) {}

  async fetchLatest(_slug: LotterySlug): Promise<ContestResult> {
    return this.respond()
  }

  async fetchByNumber(_slug: LotterySlug, _n: number): Promise<ContestResult> {
    return this.respond()
  }

  private respond(): ContestResult {
    this.calls += 1
    if (!this.healthy) throw new Error(`${this.name} indisponível`)
    return { ...CONTEST, raw: { servedBy: this.name } }
  }
}

/** Relógio manual — o breaker é testado sem esperar 60s de verdade. */
function fakeClock(start = 1_000_000) {
  let current = start
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe('ResilientResultProvider — encadeamento de fallbacks', () => {
  let primary: FakeProvider
  let fallback1: FakeProvider
  let fallback2: FakeProvider
  let events: ResilientEvent[]

  beforeEach(() => {
    primary = new FakeProvider('caixa-oficial')
    fallback1 = new FakeProvider('mirror-self-hosted')
    fallback2 = new FakeProvider('apiloterias')
    events = []
  })

  function build(clock = fakeClock()) {
    return new ResilientResultProvider(primary, [fallback1, fallback2], {
      now: clock.now,
      logger: (event) => events.push(event),
    })
  }

  it('usa o primário quando ele está saudável e registra quem serviu', async () => {
    const result = await build().fetchLatest('megasena')

    expect(result.raw).toEqual({ servedBy: 'caixa-oficial' })
    expect(fallback1.calls).toBe(0)
    const served = events.find((e) => e.type === 'served')
    expect(served).toMatchObject({
      type: 'served',
      provider: 'caixa-oficial',
      operation: 'fetchLatest',
      slug: 'megasena',
      providersTried: 1,
    })
  })

  it('cai para o fallback quando o primário falha', async () => {
    primary.healthy = false
    const result = await build().fetchByNumber('megasena', 3038)

    expect(result.raw).toEqual({ servedBy: 'mirror-self-hosted' })
    expect(events.filter((e) => e.type === 'provider_failed')).toHaveLength(1)
    expect(events.find((e) => e.type === 'served')).toMatchObject({
      provider: 'mirror-self-hosted',
      operation: 'fetchByNumber',
      contestNumber: 3038,
      providersTried: 2,
    })
  })

  it('vai até o segundo fallback', async () => {
    primary.healthy = false
    fallback1.healthy = false

    const result = await build().fetchLatest('megasena')

    expect(result.raw).toEqual({ servedBy: 'apiloterias' })
    expect(fallback2.calls).toBe(1)
  })

  it('lança AllProvidersFailedError com o erro de cada provider', async () => {
    primary.healthy = false
    fallback1.healthy = false
    fallback2.healthy = false

    const error = await build()
      .fetchLatest('megasena')
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AllProvidersFailedError)
    const failures = (error as AllProvidersFailedError).failures
    expect(failures.map((f) => f.provider)).toEqual([
      'caixa-oficial',
      'mirror-self-hosted',
      'apiloterias',
    ])
    expect((error as Error).message).toContain('caixa-oficial')
  })
})

describe('ResilientResultProvider — circuit breaker', () => {
  it('abre o circuito após 5 falhas consecutivas e para de chamar o provider', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const clock = fakeClock()
    const events: ResilientEvent[] = []
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: clock.now,
      logger: (e) => events.push(e),
    })

    primary.healthy = false
    for (let i = 0; i < 5; i += 1) {
      await resilient.fetchLatest('megasena')
    }

    expect(primary.calls).toBe(5)
    expect(resilient.circuits()[0]).toMatchObject({
      provider: 'caixa-oficial',
      state: 'open',
      consecutiveFailures: 5,
    })
    expect(events.some((e) => e.type === 'circuit_opened')).toBe(true)

    // 6ª chamada: primário pulado, fallback serve direto.
    const result = await resilient.fetchLatest('megasena')
    expect(primary.calls).toBe(5)
    expect(result.raw).toEqual({ servedBy: 'mirror' })
    expect(events.some((e) => e.type === 'circuit_skipped')).toBe(true)
  })

  it('não abre o circuito com falhas intercaladas por sucesso', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: fakeClock().now,
      logger: () => {},
    })

    // Alterna falha/sucesso 12 vezes, terminando em sucesso.
    for (let i = 0; i < 12; i += 1) {
      primary.healthy = i % 2 === 1
      await resilient.fetchLatest('megasena')
    }

    expect(resilient.circuits()[0]?.state).toBe('closed')
    expect(resilient.circuits()[0]?.consecutiveFailures).toBe(0)
  })

  it('entra em half-open após 60s e fecha o circuito quando a sonda passa', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const clock = fakeClock()
    const events: ResilientEvent[] = []
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: clock.now,
      logger: (e) => events.push(e),
    })

    primary.healthy = false
    for (let i = 0; i < 5; i += 1) await resilient.fetchLatest('megasena')
    expect(resilient.circuits()[0]?.state).toBe('open')

    // 59,9s: ainda aberto.
    clock.advance(59_900)
    await resilient.fetchLatest('megasena')
    expect(primary.calls).toBe(5)

    // 60s: uma sonda é liberada. O provider voltou.
    clock.advance(100)
    primary.healthy = true
    const result = await resilient.fetchLatest('megasena')

    expect(primary.calls).toBe(6)
    expect(result.raw).toEqual({ servedBy: 'caixa-oficial' })
    expect(resilient.circuits()[0]).toMatchObject({ state: 'closed', consecutiveFailures: 0 })
    expect(events.some((e) => e.type === 'circuit_half_open')).toBe(true)
    expect(events.some((e) => e.type === 'circuit_closed')).toBe(true)
  })

  it('reabre imediatamente se a sonda de half-open falhar', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const clock = fakeClock()
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: clock.now,
      logger: () => {},
    })

    primary.healthy = false
    for (let i = 0; i < 5; i += 1) await resilient.fetchLatest('megasena')

    clock.advance(60_000)
    await resilient.fetchLatest('megasena') // sonda falha
    expect(primary.calls).toBe(6)
    expect(resilient.circuits()[0]?.state).toBe('open')

    // A janela de 60s recomeça: nova chamada não sonda de novo.
    clock.advance(1_000)
    await resilient.fetchLatest('megasena')
    expect(primary.calls).toBe(6)
  })

  it('respeita limiar e janela customizados', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const clock = fakeClock()
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: clock.now,
      logger: () => {},
      failureThreshold: 2,
      resetTimeoutMs: 5_000,
    })

    primary.healthy = false
    await resilient.fetchLatest('megasena')
    await resilient.fetchLatest('megasena')
    expect(resilient.circuits()[0]?.state).toBe('open')

    clock.advance(5_000)
    primary.healthy = true
    await resilient.fetchLatest('megasena')
    expect(resilient.circuits()[0]?.state).toBe('closed')
  })

  it('falha rápido quando todos os circuitos estão abertos', async () => {
    const primary = new FakeProvider('caixa-oficial')
    const fallback = new FakeProvider('mirror')
    const clock = fakeClock()
    const resilient = new ResilientResultProvider(primary, [fallback], {
      now: clock.now,
      logger: () => {},
      failureThreshold: 1,
    })

    primary.healthy = false
    fallback.healthy = false
    await expect(resilient.fetchLatest('megasena')).rejects.toBeInstanceOf(AllProvidersFailedError)

    const callsBefore = primary.calls + fallback.calls
    await expect(resilient.fetchLatest('megasena')).rejects.toBeInstanceOf(AllProvidersFailedError)
    expect(primary.calls + fallback.calls).toBe(callsBefore)
  })

  it('mantém circuitos separados para providers de mesmo nome', async () => {
    const a = new FakeProvider('mirror')
    const b = new FakeProvider('mirror')
    const resilient = new ResilientResultProvider(a, [b], {
      now: fakeClock().now,
      logger: () => {},
      failureThreshold: 1,
    })

    a.healthy = false
    await resilient.fetchLatest('megasena')

    expect(resilient.circuits().map((c) => c.state)).toEqual(['open', 'closed'])
  })
})

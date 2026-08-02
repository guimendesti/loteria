/**
 * Orquestração de providers com circuit breaker.
 *
 * doc 01 §1.4 e doc 06 §6.6: a Caixa é a fonte canônica, mas não tem SLA. Mantemos
 * fallbacks (mirror self-hospedado, API de terceiro) e um breaker por provider para não
 * insistir numa fonte já derrubada.
 */

import type { ContestResult, LotterySlug } from '@lotopro/core'
import type { LotteryResultProvider } from './provider'

export type CircuitState = 'closed' | 'open' | 'half-open'

export type ProviderOperation = 'fetchLatest' | 'fetchByNumber'

export type ResilientEvent =
  /** Sucesso — registra QUAL provider serviu a requisição. */
  | {
      type: 'served'
      provider: string
      operation: ProviderOperation
      slug: LotterySlug
      contestNumber: number | null
      /** Quantos providers foram tentados até este (1 = o primário serviu). */
      providersTried: number
      durationMs: number
    }
  | {
      type: 'provider_failed'
      provider: string
      operation: ProviderOperation
      slug: LotterySlug
      contestNumber: number | null
      consecutiveFailures: number
      error: unknown
    }
  | { type: 'circuit_opened'; provider: string; consecutiveFailures: number }
  | { type: 'circuit_half_open'; provider: string }
  | { type: 'circuit_closed'; provider: string }
  | { type: 'circuit_skipped'; provider: string; msUntilRetry: number }

export type ResilientLogger = (event: ResilientEvent) => void

const defaultLogger: ResilientLogger = (event) => {
  if (event.type === 'served') {
    console.info(
      `[lottery-results] ${event.operation}(${event.slug}) servido por "${event.provider}" ` +
        `em ${event.durationMs}ms (providers tentados: ${event.providersTried})`,
    )
    return
  }
  if (event.type === 'provider_failed') {
    console.warn(
      `[lottery-results] provider "${event.provider}" falhou em ${event.operation}(${event.slug}): ` +
        `${describeError(event.error)} (falhas consecutivas: ${event.consecutiveFailures})`,
    )
    return
  }
  console.warn(`[lottery-results] ${event.type} — provider "${event.provider}"`)
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/** Nenhum provider conseguiu responder. Carrega a falha de cada um para diagnóstico. */
export class AllProvidersFailedError extends Error {
  readonly failures: ReadonlyArray<{ provider: string; error: unknown }>
  constructor(
    operation: ProviderOperation,
    slug: LotterySlug,
    failures: ReadonlyArray<{ provider: string; error: unknown }>,
  ) {
    const detail = failures.map((f) => `${f.provider} (${describeError(f.error)})`).join('; ')
    super(`nenhum provider respondeu ${operation}("${slug}") — ${detail || 'sem providers'}`)
    this.name = 'AllProvidersFailedError'
    this.failures = failures
  }
}

export interface ResilientResultProviderOptions {
  /** Falhas consecutivas que abrem o circuito. Padrão: 5. */
  failureThreshold?: number
  /** Tempo em aberto antes de permitir uma sonda (half-open). Padrão: 60s. */
  resetTimeoutMs?: number
  /** Relógio injetável — os testes não dependem de timers reais. */
  now?: () => number
  logger?: ResilientLogger
  name?: string
}

export interface CircuitSnapshot {
  provider: string
  state: CircuitState
  consecutiveFailures: number
  openedAt: number | null
}

interface CircuitEntry {
  provider: LotteryResultProvider
  key: string
  state: CircuitState
  consecutiveFailures: number
  openedAt: number
  probeInFlight: boolean
}

export const DEFAULT_FAILURE_THRESHOLD = 5
export const DEFAULT_RESET_TIMEOUT_MS = 60_000

/**
 * Tenta o primário e, a cada falha, o próximo fallback. Cada provider tem seu próprio
 * circuito:
 *
 * - `closed`   → tentativas normais;
 * - `open`     → pulado até passar `resetTimeoutMs` (abre após N falhas consecutivas);
 * - `half-open`→ permite UMA sonda; sucesso fecha o circuito, falha reabre.
 */
export class ResilientResultProvider implements LotteryResultProvider {
  readonly name: string
  private readonly entries: CircuitEntry[]
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly now: () => number
  private readonly logger: ResilientLogger

  constructor(
    primary: LotteryResultProvider,
    fallbacks: ReadonlyArray<LotteryResultProvider> = [],
    options: ResilientResultProviderOptions = {},
  ) {
    this.name = options.name ?? 'resilient'
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.resetTimeoutMs = options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS
    this.now = options.now ?? Date.now
    this.logger = options.logger ?? defaultLogger
    this.entries = [primary, ...fallbacks].map((provider, index) => ({
      provider,
      // Índice no prefixo: nomes duplicados não podem compartilhar circuito.
      key: `${index}:${provider.name}`,
      state: 'closed' as CircuitState,
      consecutiveFailures: 0,
      openedAt: 0,
      probeInFlight: false,
    }))
  }

  async fetchLatest(slug: LotterySlug): Promise<ContestResult> {
    return this.run('fetchLatest', slug, null, (provider) => provider.fetchLatest(slug))
  }

  async fetchByNumber(slug: LotterySlug, contestNumber: number): Promise<ContestResult> {
    return this.run('fetchByNumber', slug, contestNumber, (provider) =>
      provider.fetchByNumber(slug, contestNumber),
    )
  }

  /** Estado atual dos circuitos — para health check e testes. */
  circuits(): CircuitSnapshot[] {
    return this.entries.map((entry) => ({
      provider: entry.provider.name,
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      openedAt: entry.state === 'closed' ? null : entry.openedAt,
    }))
  }

  private async run(
    operation: ProviderOperation,
    slug: LotterySlug,
    contestNumber: number | null,
    exec: (provider: LotteryResultProvider) => Promise<ContestResult>,
  ): Promise<ContestResult> {
    const failures: Array<{ provider: string; error: unknown }> = []
    let providersTried = 0

    for (const entry of this.entries) {
      if (!this.allowAttempt(entry)) {
        failures.push({
          provider: entry.provider.name,
          error: new Error('circuito aberto — provider pulado'),
        })
        continue
      }

      providersTried += 1
      const startedAt = this.now()
      try {
        const result = await exec(entry.provider)
        this.onSuccess(entry)
        this.logger({
          type: 'served',
          provider: entry.provider.name,
          operation,
          slug,
          contestNumber,
          providersTried,
          durationMs: Math.max(0, this.now() - startedAt),
        })
        return result
      } catch (error) {
        this.onFailure(entry)
        this.logger({
          type: 'provider_failed',
          provider: entry.provider.name,
          operation,
          slug,
          contestNumber,
          consecutiveFailures: entry.consecutiveFailures,
          error,
        })
        failures.push({ provider: entry.provider.name, error })
      }
    }

    throw new AllProvidersFailedError(operation, slug, failures)
  }

  private allowAttempt(entry: CircuitEntry): boolean {
    if (entry.state === 'closed') return true

    if (entry.state === 'open') {
      const elapsed = this.now() - entry.openedAt
      if (elapsed < this.resetTimeoutMs) {
        this.logger({
          type: 'circuit_skipped',
          provider: entry.provider.name,
          msUntilRetry: this.resetTimeoutMs - elapsed,
        })
        return false
      }
      entry.state = 'half-open'
      entry.probeInFlight = true
      this.logger({ type: 'circuit_half_open', provider: entry.provider.name })
      return true
    }

    // half-open: só uma sonda por vez.
    if (entry.probeInFlight) {
      this.logger({ type: 'circuit_skipped', provider: entry.provider.name, msUntilRetry: 0 })
      return false
    }
    entry.probeInFlight = true
    return true
  }

  private onSuccess(entry: CircuitEntry): void {
    const wasOpen = entry.state !== 'closed'
    entry.state = 'closed'
    entry.consecutiveFailures = 0
    entry.probeInFlight = false
    entry.openedAt = 0
    if (wasOpen) this.logger({ type: 'circuit_closed', provider: entry.provider.name })
  }

  private onFailure(entry: CircuitEntry): void {
    const wasHalfOpen = entry.state === 'half-open'
    entry.consecutiveFailures += 1
    entry.probeInFlight = false

    if (wasHalfOpen || entry.consecutiveFailures >= this.failureThreshold) {
      const alreadyOpen = entry.state === 'open'
      entry.state = 'open'
      entry.openedAt = this.now()
      if (!alreadyOpen) {
        this.logger({
          type: 'circuit_opened',
          provider: entry.provider.name,
          consecutiveFailures: entry.consecutiveFailures,
        })
      }
    }
  }
}

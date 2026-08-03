import { describe, expect, it } from 'vitest'
import {
  ENTITLEMENTS,
  canAddPoolParticipant,
  canCreateBet,
  canCreatePool,
  canEnableAutoCheck,
  canQueryHistory,
  canUseAi,
  canUseClosure,
  canUseOcr,
  currentPeriod,
  getEntitlements,
  hasChannel,
  hasFeature,
  historyCutoff,
  isPlanSlug,
  isUsageMetric,
  isUsagePeriod,
  maxClosureAllowed,
  parseEntitlements,
  remaining,
  safeParseEntitlements,
  serializeEntitlements,
  usageCounterKey,
  USAGE_METRICS,
  type Entitlements,
  type PlanSlug,
} from '@lotopro/core'
// Leitura do JSON REAL que o seed grava em `plans.entitlements`.
import { plans as seedPlans } from '../src/seed-data/plans'

const free = ENTITLEMENTS.free
const premium = ENTITLEMENTS.premium
const pro = ENTITLEMENTS.pro

const MS_PER_DAY = 86_400_000
const NOW = new Date('2026-08-02T12:00:00.000Z')

// ─── §5.2 — a tabela ─────────────────────────────────────────────────────────

describe('ENTITLEMENTS (docs/05 §5.2)', () => {
  it('Free — 20 jogos, 2 modalidades, 90 dias, 1 bolão/5 participantes, 3 OCR, 0 IA, ≤16 dezenas, e-mail', () => {
    expect(free).toEqual({
      maxActiveBets: 20,
      maxAutoCheckLotteries: 2,
      historyDays: 90,
      maxPools: 1,
      maxPoolParticipants: 5,
      ocrScansPerMonth: 3,
      aiMessagesPerMonth: 0,
      maxClosureNumbers: 16,
      channels: ['email'],
      features: new Set(),
    } satisfies Entitlements)
  })

  it('Premium — jogos/modalidades/histórico sem teto, 5 bolões/30, 30 OCR, ≤20 dezenas, e-mail+push', () => {
    expect(premium).toEqual({
      maxActiveBets: 'unlimited',
      maxAutoCheckLotteries: 'unlimited',
      historyDays: 'unlimited',
      maxPools: 5,
      maxPoolParticipants: 30,
      ocrScansPerMonth: 30,
      aiMessagesPerMonth: 0,
      maxClosureNumbers: 20,
      channels: ['email', 'push'],
      features: new Set(['export', 'pool_receipt']),
    } satisfies Entitlements)
  })

  it('Pro — tudo sem teto, OCR fair use 300, 150 mensagens de IA, e-mail+push+whatsapp', () => {
    expect(pro).toEqual({
      maxActiveBets: 'unlimited',
      maxAutoCheckLotteries: 'unlimited',
      historyDays: 'unlimited',
      maxPools: 'unlimited',
      maxPoolParticipants: 'unlimited',
      ocrScansPerMonth: 300,
      aiMessagesPerMonth: 150,
      maxClosureNumbers: 'unlimited',
      channels: ['email', 'push', 'whatsapp'],
      features: new Set(['backtesting', 'ai_assistant', 'api_access', 'export', 'pool_receipt']),
    } satisfies Entitlements)
  })

  it('White-label entrega tudo do Pro, sem compartilhar as mesmas instâncias', () => {
    expect(ENTITLEMENTS.whitelabel).toEqual(pro)
    expect(ENTITLEMENTS.whitelabel.features).not.toBe(pro.features)
    expect(ENTITLEMENTS.whitelabel.channels).not.toBe(pro.channels)
  })

  it('getEntitlements devolve cópia — mutar o resultado não contamina a tabela', () => {
    const copy = getEntitlements('free')
    ;(copy.features as Set<'export'>).add('export')
    ;(copy.channels as string[]).push('push')
    expect(free.features.size).toBe(0)
    expect(free.channels).toEqual(['email'])
  })

  it('isPlanSlug reconhece os 4 slugs', () => {
    for (const slug of ['free', 'premium', 'pro', 'whitelabel'] satisfies PlanSlug[]) {
      expect(isPlanSlug(slug)).toBe(true)
    }
    expect(isPlanSlug('enterprise')).toBe(false)
    expect(isPlanSlug(null)).toBe(false)
  })
})

// ─── §5.4 — gatilhos nos limites exatos ──────────────────────────────────────

describe('G1 — canCreateBet', () => {
  it('Free permite o 20º jogo e bloqueia o 21º', () => {
    expect(canCreateBet(free, 0)).toEqual({ allowed: true, limit: 20, current: 0 })
    expect(canCreateBet(free, 19)).toEqual({ allowed: true, limit: 20, current: 19 })
    expect(canCreateBet(free, 20)).toEqual({
      allowed: false,
      gate: 'G1',
      limit: 20,
      current: 20,
    })
  })

  it('avisa "último jogo" antes de o usuário perder trabalho (regra de UX §5.4)', () => {
    expect(remaining(canCreateBet(free, 19))).toBe(1)
    expect(remaining(canCreateBet(free, 20))).toBe(0)
    expect(remaining(canCreateBet(premium, 19))).toBeNull()
  })

  it('Premium e Pro não têm teto', () => {
    expect(canCreateBet(premium, 10_000)).toEqual({ allowed: true, current: 10_000 })
    expect(canCreateBet(pro, 10_000).allowed).toBe(true)
  })
})

describe('G2 — canEnableAutoCheck', () => {
  it('Free permite a 2ª modalidade e bloqueia a 3ª', () => {
    expect(canEnableAutoCheck(free, 1)).toEqual({ allowed: true, limit: 2, current: 1 })
    expect(canEnableAutoCheck(free, 2)).toEqual({
      allowed: false,
      gate: 'G2',
      limit: 2,
      current: 2,
    })
  })

  it('Premium libera todas as modalidades', () => {
    expect(canEnableAutoCheck(premium, 11).allowed).toBe(true)
  })
})

describe('G4/G9 — canCreatePool', () => {
  it('Free permite o 1º bolão e bloqueia o 2º (G4 → Premium)', () => {
    expect(canCreatePool(free, 0)).toEqual({ allowed: true, limit: 1, current: 0 })
    expect(canCreatePool(free, 1)).toEqual({ allowed: false, gate: 'G4', limit: 1, current: 1 })
  })

  it('Premium permite o 5º bolão e bloqueia o 6º (G9 → Pro)', () => {
    expect(canCreatePool(premium, 4)).toEqual({ allowed: true, limit: 5, current: 4 })
    expect(canCreatePool(premium, 5)).toEqual({
      allowed: false,
      gate: 'G9',
      limit: 5,
      current: 5,
    })
  })

  it('Pro não tem teto de bolões', () => {
    expect(canCreatePool(pro, 500)).toEqual({ allowed: true, current: 500 })
  })
})

describe('G3/G9 — canAddPoolParticipant', () => {
  it('Free permite o 5º participante e bloqueia o 6º (G3)', () => {
    expect(canAddPoolParticipant(free, 4)).toEqual({ allowed: true, limit: 5, current: 4 })
    expect(canAddPoolParticipant(free, 5)).toEqual({
      allowed: false,
      gate: 'G3',
      limit: 5,
      current: 5,
    })
  })

  it('Premium permite o 30º e bloqueia o 31º (G9 → Pro)', () => {
    expect(canAddPoolParticipant(premium, 29)).toEqual({ allowed: true, limit: 30, current: 29 })
    expect(canAddPoolParticipant(premium, 30)).toEqual({
      allowed: false,
      gate: 'G9',
      limit: 30,
      current: 30,
    })
  })

  it('Pro não tem teto de participantes', () => {
    expect(canAddPoolParticipant(pro, 1_000).allowed).toBe(true)
  })
})

describe('G5 — canUseOcr', () => {
  it('Free: 3 scans/mês', () => {
    expect(canUseOcr(free, 2)).toEqual({ allowed: true, limit: 3, current: 2 })
    expect(canUseOcr(free, 3)).toEqual({ allowed: false, gate: 'G5', limit: 3, current: 3 })
  })

  it('Premium: 30 scans/mês', () => {
    expect(canUseOcr(premium, 29).allowed).toBe(true)
    expect(canUseOcr(premium, 30)).toEqual({
      allowed: false,
      gate: 'G5',
      limit: 30,
      current: 30,
    })
  })

  it('Pro: fair use de 300 é teto real', () => {
    expect(canUseOcr(pro, 299).allowed).toBe(true)
    expect(canUseOcr(pro, 300)).toEqual({
      allowed: false,
      gate: 'G5',
      limit: 300,
      current: 300,
    })
  })
})

describe('canUseAi', () => {
  it('Free e Premium não têm assistente (cota 0)', () => {
    expect(canUseAi(free, 0)).toEqual({ allowed: false, limit: 0, current: 0 })
    expect(canUseAi(premium, 0).allowed).toBe(false)
  })

  it('Pro: 150 mensagens/mês', () => {
    expect(canUseAi(pro, 149)).toEqual({ allowed: true, limit: 150, current: 149 })
    expect(canUseAi(pro, 150)).toEqual({ allowed: false, limit: 150, current: 150 })
  })

  it('§5.4 não define gatilho para IA — o bloqueio volta sem gate', () => {
    expect(canUseAi(pro, 150).gate).toBeUndefined()
  })
})

describe('G6 — fechamentos', () => {
  it('maxClosureAllowed reflete §5.2', () => {
    expect(maxClosureAllowed(free)).toBe(16)
    expect(maxClosureAllowed(premium)).toBe(20)
    expect(maxClosureAllowed(pro)).toBe('unlimited')
  })

  it('Free vai até 16 dezenas; a 17ª dispara G6', () => {
    expect(canUseClosure(free, 16)).toEqual({ allowed: true, limit: 16, current: 16 })
    expect(canUseClosure(free, 17)).toEqual({
      allowed: false,
      gate: 'G6',
      limit: 16,
      current: 17,
    })
  })

  it('Premium vai até 20 dezenas; a 21ª dispara G6', () => {
    expect(canUseClosure(premium, 20).allowed).toBe(true)
    expect(canUseClosure(premium, 21)).toEqual({
      allowed: false,
      gate: 'G6',
      limit: 20,
      current: 21,
    })
  })

  it('Pro: biblioteca completa + custom', () => {
    expect(canUseClosure(pro, 25)).toEqual({ allowed: true, current: 25 })
  })
})

describe('G7 — histórico', () => {
  it('historyCutoff: Free = 90 dias; Premium e Pro = null', () => {
    const cutoff = historyCutoff(free, NOW)
    expect(cutoff).not.toBeNull()
    expect(cutoff?.getTime()).toBe(NOW.getTime() - 90 * MS_PER_DAY)
    expect(historyCutoff(premium, NOW)).toBeNull()
    expect(historyCutoff(pro, NOW)).toBeNull()
  })

  it('canQueryHistory bloqueia consulta além de 90 dias no Free', () => {
    const within = new Date(NOW.getTime() - 89 * MS_PER_DAY)
    const beyond = new Date(NOW.getTime() - 91 * MS_PER_DAY)
    expect(canQueryHistory(free, within, NOW)).toEqual({
      allowed: true,
      limit: 90,
      current: 89,
    })
    expect(canQueryHistory(free, beyond, NOW)).toEqual({
      allowed: false,
      gate: 'G7',
      limit: 90,
      current: 91,
    })
  })

  it('exatamente no corte ainda é permitido', () => {
    const edge = new Date(NOW.getTime() - 90 * MS_PER_DAY)
    expect(canQueryHistory(free, edge, NOW).allowed).toBe(true)
  })

  it('Premium consulta qualquer janela', () => {
    const old = new Date(NOW.getTime() - 3_650 * MS_PER_DAY)
    expect(canQueryHistory(premium, old, NOW)).toEqual({ allowed: true, current: 3_650 })
  })
})

describe('G8/G10 — features e canais', () => {
  it('backtesting é exclusivo do Pro e dispara G8', () => {
    expect(hasFeature(free, 'backtesting')).toEqual({ allowed: false, gate: 'G8' })
    expect(hasFeature(premium, 'backtesting')).toEqual({ allowed: false, gate: 'G8' })
    expect(hasFeature(pro, 'backtesting')).toEqual({ allowed: true })
  })

  it('recibo de bolão e exportação plena começam no Premium', () => {
    expect(hasFeature(free, 'pool_receipt')).toEqual({ allowed: false })
    expect(hasFeature(premium, 'pool_receipt').allowed).toBe(true)
    expect(hasFeature(free, 'export').allowed).toBe(false)
    expect(hasFeature(premium, 'export').allowed).toBe(true)
  })

  it('IA e API são Pro', () => {
    expect(hasFeature(premium, 'ai_assistant').allowed).toBe(false)
    expect(hasFeature(premium, 'api_access').allowed).toBe(false)
    expect(hasFeature(pro, 'ai_assistant').allowed).toBe(true)
    expect(hasFeature(pro, 'api_access').allowed).toBe(true)
  })

  it('WhatsApp é Pro e dispara G10', () => {
    expect(hasChannel(free, 'whatsapp')).toEqual({ allowed: false, gate: 'G10' })
    expect(hasChannel(premium, 'whatsapp')).toEqual({ allowed: false, gate: 'G10' })
    expect(hasChannel(pro, 'whatsapp')).toEqual({ allowed: true })
  })

  it('e-mail em todos; push a partir do Premium (sem gate no §5.4)', () => {
    expect(hasChannel(free, 'email').allowed).toBe(true)
    expect(hasChannel(free, 'push')).toEqual({ allowed: false })
    expect(hasChannel(premium, 'push').allowed).toBe(true)
  })
})

// ─── parse / serialize ───────────────────────────────────────────────────────

describe('parseEntitlements — JSON do seed real (packages/db/src/seed-data/plans.ts)', () => {
  it('cobre os 4 planos do seed', () => {
    expect(seedPlans.map((plan) => plan.slug)).toEqual(['free', 'premium', 'pro', 'whitelabel'])
  })

  for (const plan of seedPlans) {
    it(`${plan.slug}: o JSON do seed normaliza para a tabela de §5.2`, () => {
      // JSON.parse/stringify simula a ida e volta pela coluna Json do Postgres.
      const fromDb: unknown = JSON.parse(JSON.stringify(plan.entitlements))
      expect(parseEntitlements(fromDb)).toEqual(ENTITLEMENTS[plan.slug])
    })
  }

  it('null do seed vira o literal "unlimited"', () => {
    const proSeed = seedPlans.find((plan) => plan.slug === 'pro')
    expect(proSeed).toBeDefined()
    const parsed = parseEntitlements(proSeed?.entitlements)
    expect(parsed.maxActiveBets).toBe('unlimited')
    expect(parsed.maxPools).toBe('unlimited')
    expect(parsed.maxClosureNumbers).toBe('unlimited')
    // "Ilimitado (fair use 300/mês)": o fair use vira o teto contabilizável.
    expect(parsed.ocrScansPerMonth).toBe(300)
  })
})

describe('parseEntitlements — shape canônico (docs/06 §6.9)', () => {
  const canonical = {
    maxActiveBets: 'unlimited',
    maxAutoCheckLotteries: 'unlimited',
    historyDays: 90,
    maxPools: 5,
    maxPoolParticipants: 30,
    ocrScansPerMonth: 30,
    aiMessagesPerMonth: 0,
    maxClosureNumbers: 20,
    channels: ['email', 'push'],
    features: ['export', 'pool_receipt'],
  }

  it('aceita "unlimited" e devolve features como Set', () => {
    const parsed = parseEntitlements(canonical)
    expect(parsed.maxActiveBets).toBe('unlimited')
    expect(parsed.historyDays).toBe(90)
    expect(parsed.features).toEqual(new Set(['export', 'pool_receipt']))
    expect(parsed.features.has('backtesting')).toBe(false)
  })

  it('round-trip parse(serialize(x)) === x para todos os planos', () => {
    for (const slug of Object.keys(ENTITLEMENTS) as PlanSlug[]) {
      const serialized: unknown = JSON.parse(JSON.stringify(serializeEntitlements(ENTITLEMENTS[slug])))
      expect(parseEntitlements(serialized)).toEqual(ENTITLEMENTS[slug])
    }
  })

  it('serializeEntitlements emite features ordenadas e JSON puro', () => {
    const json = serializeEntitlements(pro)
    expect(json.features).toEqual([
      'ai_assistant',
      'api_access',
      'backtesting',
      'export',
      'pool_receipt',
    ])
    expect(Array.isArray(json.channels)).toBe(true)
    expect(() => JSON.stringify(json)).not.toThrow()
  })

  it('rejeita JSON inválido', () => {
    expect(() => parseEntitlements(null)).toThrow()
    expect(() => parseEntitlements({})).toThrow()
    expect(() => parseEntitlements({ ...canonical, maxActiveBets: 'infinite' })).toThrow()
    expect(() => parseEntitlements({ ...canonical, channels: ['sms'] })).toThrow()
    expect(() => parseEntitlements({ ...canonical, ocrScansPerMonth: -1 })).toThrow()
    expect(() => parseEntitlements({ ...canonical, features: ['telepatia'] })).toThrow()
  })

  it('safeParseEntitlements não lança', () => {
    const bad = safeParseEntitlements({ maxActiveBets: 'infinite' })
    expect(bad.ok).toBe(false)
    const good = safeParseEntitlements(canonical)
    expect(good.ok).toBe(true)
  })
})

// ─── usage ───────────────────────────────────────────────────────────────────

describe('currentPeriod (America/Sao_Paulo)', () => {
  it('formata AAAA-MM', () => {
    expect(currentPeriod(NOW)).toBe('2026-08')
    expect(currentPeriod(new Date('2026-01-15T12:00:00.000Z'))).toBe('2026-01')
  })

  it('usa o fuso de Brasília, não UTC, na virada do mês', () => {
    // 01/08 00:59 UTC = 31/07 21:59 em São Paulo → ainda é julho.
    expect(currentPeriod(new Date('2026-08-01T00:59:00.000Z'))).toBe('2026-07')
    // 01/08 03:00 UTC = 01/08 00:00 em São Paulo → agosto.
    expect(currentPeriod(new Date('2026-08-01T03:00:00.000Z'))).toBe('2026-08')
  })

  it('usa o fuso de Brasília na virada do ano', () => {
    expect(currentPeriod(new Date('2027-01-01T02:00:00.000Z'))).toBe('2026-12')
    expect(currentPeriod(new Date('2027-01-01T03:00:00.000Z'))).toBe('2027-01')
  })

  it('rejeita Date inválida', () => {
    expect(() => currentPeriod(new Date('não é data'))).toThrow(RangeError)
  })
})

describe('contadores de consumo', () => {
  it('métricas batem com usage_counters (docs/07 §7.4)', () => {
    expect([...USAGE_METRICS]).toEqual(['ocr_scans', 'ai_messages', 'backtests'])
    expect(isUsageMetric('ocr_scans')).toBe(true)
    expect(isUsageMetric('ocr')).toBe(false)
  })

  it('usageCounterKey monta a chave única', () => {
    expect(usageCounterKey('usr_1', 'ai_messages', NOW)).toEqual({
      userId: 'usr_1',
      metric: 'ai_messages',
      period: '2026-08',
    })
  })

  it('isUsagePeriod valida o formato do período', () => {
    expect(isUsagePeriod('2026-08')).toBe(true)
    expect(isUsagePeriod('2026-13')).toBe(false)
    expect(isUsagePeriod('2026-8')).toBe(false)
    expect(isUsagePeriod(202608)).toBe(false)
  })
})

/**
 * Testes de `server/lib/entitlements.ts` + do plumbing de paywall em
 * `server/trpc.ts` (`guardOrThrow`, `toPaywallData`).
 *
 * `resolveEntitlements`/`incrementUsage` usam um fake mínimo de Prisma (só os
 * métodos realmente chamados — `subscription.findFirst`, `usageCounter.upsert`)
 * tipado via `as unknown as PrismaClient`, mesmo padrão de
 * `packages/db/src/seed.ts`. Sem banco real: tudo síncrono/determinístico.
 */
import { describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  currentPeriod,
  getEntitlements,
  serializeEntitlements,
  type UsageMetric,
} from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { applyHistoryCutoff, incrementUsage, resolveEntitlements } from '@/server/lib/entitlements'
import { guardOrThrow, toPaywallData } from '@/server/trpc'
import { PaywallError } from '@/server/errors'

// ─── resolveEntitlements ─────────────────────────────────────────────────────

describe('resolveEntitlements', () => {
  it('sem Subscription ACTIVE/TRIALING → plano Free', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const prisma = { subscription: { findFirst } } as unknown as PrismaClient

    const ent = await resolveEntitlements(prisma, 'user-1')

    expect(ent).toEqual(getEntitlements('free'))
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: { in: ['ACTIVE', 'TRIALING'] } },
      include: { plan: true },
    })
  })

  it('com Subscription ACTIVE (plano premium) → entitlements do Plan.entitlements normalizados', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      plan: {
        id: 'plan-premium',
        slug: 'premium',
        entitlements: serializeEntitlements(getEntitlements('premium')),
      },
    })
    const prisma = { subscription: { findFirst } } as unknown as PrismaClient

    const ent = await resolveEntitlements(prisma, 'user-2')

    expect(ent).toEqual(getEntitlements('premium'))
  })

  it('Plan.entitlements ilegível no banco → cai para a tabela estática do slug e loga o erro', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      plan: { id: 'plan-broken', slug: 'premium', entitlements: { nonsense: true } },
    })
    const prisma = { subscription: { findFirst } } as unknown as PrismaClient
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const ent = await resolveEntitlements(prisma, 'user-3')

    expect(ent).toEqual(getEntitlements('premium'))
    expect(errorSpy).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })

  it('Plan.entitlements ilegível e slug desconhecido → cai para Free', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      plan: { id: 'plan-broken', slug: 'nao-existe', entitlements: { nonsense: true } },
    })
    const prisma = { subscription: { findFirst } } as unknown as PrismaClient
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const ent = await resolveEntitlements(prisma, 'user-4')

    expect(ent).toEqual(getEntitlements('free'))
    errorSpy.mockRestore()
  })
})

// ─── applyHistoryCutoff (G7) — usada por bets.list para montar o `where` ────

describe('applyHistoryCutoff', () => {
  const NOW = new Date('2026-08-02T12:00:00.000Z')

  it('Free (90 dias) → filtra createdAt >= corte e sinaliza historyLimited', () => {
    const result = applyHistoryCutoff(getEntitlements('free'), NOW)

    expect(result.historyLimited).toBe(true)
    expect(result.createdAt).toEqual({ gte: new Date(NOW.getTime() - 90 * 86_400_000) })
  })

  it('Premium (histórico completo) → sem filtro nenhum, historyLimited falso', () => {
    const result = applyHistoryCutoff(getEntitlements('premium'), NOW)

    expect(result.historyLimited).toBe(false)
    // `exactOptionalPropertyTypes`: a chave não deve nem existir, não só ser `undefined`.
    expect('createdAt' in result).toBe(false)
  })
})

// ─── incrementUsage (usage_counters, docs/07 §7.4) ──────────────────────────

describe('incrementUsage', () => {
  it('faz upsert atômico na chave (userId, metric, period) e devolve o consumo atualizado', async () => {
    const upsert = vi.fn().mockResolvedValue({ used: 4 })
    const prisma = { usageCounter: { upsert } } as unknown as PrismaClient
    const now = new Date('2026-08-02T12:00:00.000Z')

    const used = await incrementUsage(prisma, 'user-1', 'ocr_scans', now)

    expect(used).toBe(4)
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_metric_period: { userId: 'user-1', metric: 'ocr_scans', period: currentPeriod(now) } },
      create: { userId: 'user-1', metric: 'ocr_scans', period: currentPeriod(now), used: 1 },
      update: { used: { increment: 1 } },
    })
  })

  it('rejeita métrica desconhecida sem chamar o Prisma', async () => {
    const upsert = vi.fn()
    const prisma = { usageCounter: { upsert } } as unknown as PrismaClient

    await expect(incrementUsage(prisma, 'user-1', 'bogus' as UsageMetric, new Date())).rejects.toThrow(RangeError)
    expect(upsert).not.toHaveBeenCalled()
  })
})

// ─── guardOrThrow / toPaywallData (paywall no errorFormatter tRPC) ──────────

describe('guardOrThrow', () => {
  it('não lança quando o guard permite', () => {
    expect(() => guardOrThrow({ allowed: true, limit: 20, current: 5 })).not.toThrow()
  })

  it('lança TRPCError FORBIDDEN com PaywallError como cause quando o guard bloqueia', () => {
    const result = { allowed: false, gate: 'G1', limit: 20, current: 20 } as const

    try {
      guardOrThrow(result)
      expect.unreachable('guardOrThrow deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      const trpcError = error as TRPCError
      expect(trpcError.code).toBe('FORBIDDEN')
      expect(trpcError.cause).toBeInstanceOf(PaywallError)
      expect((trpcError.cause as PaywallError).result).toEqual(result)
    }
  })
})

describe('toPaywallData', () => {
  it('mantém apenas gate/limit/current — nunca inclui `allowed`', () => {
    expect(toPaywallData({ allowed: false, gate: 'G7', limit: 90, current: 120 })).toEqual({
      gate: 'G7',
      limit: 90,
      current: 120,
    })
  })

  it('omite (não inclui como `undefined`) as chaves ausentes no GuardResult', () => {
    const data = toPaywallData({ allowed: false })
    expect(data).toEqual({})
    expect('gate' in data).toBe(false)
    expect('limit' in data).toBe(false)
    expect('current' in data).toBe(false)
  })
})

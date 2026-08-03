/**
 * Router `wallet` — Carteira (docs/08 §C.7, CL-90..95): gasto, prêmio e ROI
 * por período/modalidade, e série mensal para o gráfico de evolução (CL-93).
 *
 * Sem regra de domínio nova: soma agregados de `Bet.costCents` (gasto,
 * `createdAt` no período) e `BetCheck.prizeCents` (prêmio, `checkedAt` no
 * período) — os mesmos campos que `bets.summary` já usa para o card mensal
 * do dashboard. O cálculo de período/agrupamento mensal (fuso
 * America/Sao_Paulo) fica em `server/lib/wallet-period.ts` (puro, testado em
 * `__tests__/wallet-period.test.ts`), seguindo o padrão de `bet-cost.ts`.
 *
 * Escopo desta tarefa (ver relatório do orquestrador): filtro por
 * `lotterySlug` + período — CL-90 também cita "por... estratégia"
 * (`Strategy`), que fica como pendência (não implementado aqui).
 *
 * Este router ainda não está registrado em `_app.ts` (território de outro
 * agente nesta onda — evita conflito de merge). Ver
 * `server/routers/_wallet-register.md` para a linha exata de registro e o
 * relatório para a validação de typecheck feita com o registro aplicado
 * temporariamente.
 */
import { z } from 'zod'
import type { Prisma } from '@lotopro/db'
import { protectedProcedure, router } from '@/server/trpc'
import { lotterySlugSchema } from '@/server/lib/lottery-schema'
import { calculateRoiPct, lastMonthKeys, monthKey, periodRange } from '@/server/lib/wallet-period'

const overviewInput = z.object({
  period: z.enum(['month', 'year', 'all']).default('month'),
  lotterySlug: lotterySlugSchema.optional(),
})

const monthlyInput = z.object({
  months: z.number().int().min(1).max(24).default(12),
})

export const walletRouter = router({
  /** CL-90/CL-91/CL-92 — cards de gasto, prêmio e ROI honesto do período. */
  overview: protectedProcedure.input(overviewInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const { gte, lt } = periodRange(input.period)
    const dateFilter: Prisma.DateTimeFilter | undefined =
      gte || lt ? { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } : undefined

    const betWhere: Prisma.BetWhereInput = {
      userId,
      deletedAt: null,
      ...(input.lotterySlug ? { lottery: { slug: input.lotterySlug } } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    }
    const checkWhere: Prisma.BetCheckWhereInput = {
      bet: {
        userId,
        ...(input.lotterySlug ? { lottery: { slug: input.lotterySlug } } : {}),
      },
      ...(dateFilter ? { checkedAt: dateFilter } : {}),
    }

    const [betAgg, checkAgg, prizedCount] = await Promise.all([
      ctx.prisma.bet.aggregate({ where: betWhere, _sum: { costCents: true }, _count: { _all: true } }),
      ctx.prisma.betCheck.aggregate({ where: checkWhere, _sum: { prizeCents: true } }),
      ctx.prisma.betCheck.count({ where: { ...checkWhere, prizeCents: { gt: 0n } } }),
    ])

    const spentCents = betAgg._sum.costCents ?? 0n
    const prizeCents = checkAgg._sum.prizeCents ?? 0n

    return {
      spentCents,
      prizeCents,
      // Honesto/negativo (docs/08 CL-92, docs/04 D6): `null` só quando não
      // houve gasto no período (ROI indefinido) — nunca escondido quando é
      // negativo. Ver `calculateRoiPct` (bigint até o fim, number só no %).
      roiPct: calculateRoiPct(spentCents, prizeCents),
      betCount: betAgg._count._all,
      prizedCount,
    }
  }),

  /**
   * CL-93 — série mensal para o gráfico de evolução. `Recharts` não está
   * instalado (docs/09 §9.3 C8 pede um wrapper Recharts, mas a dep não
   * existe no `package.json` do app — pendência anotada no relatório); o
   * cliente desenha isso com SVG/CSS simples a partir deste array.
   */
  monthly: protectedProcedure.input(monthlyInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    const months = lastMonthKeys(now, input.months)

    // Janela de busca com 1 mês de folga: cobre a borda entre o fuso do
    // Postgres (UTC) e o de agrupamento (America/Sao_Paulo). O mês real de
    // cada linha é sempre decidido por `monthKey` abaixo, nunca por este filtro.
    const searchSince = new Date(now)
    searchSince.setUTCMonth(searchSince.getUTCMonth() - input.months - 1)

    const [bets, checks] = await Promise.all([
      ctx.prisma.bet.findMany({
        where: { userId, deletedAt: null, createdAt: { gte: searchSince } },
        select: { costCents: true, createdAt: true },
      }),
      ctx.prisma.betCheck.findMany({
        where: { bet: { userId }, checkedAt: { gte: searchSince } },
        select: { prizeCents: true, checkedAt: true },
      }),
    ])

    const byMonth = new Map<string, { spentCents: bigint; prizeCents: bigint }>(
      months.map((month) => [month, { spentCents: 0n, prizeCents: 0n }]),
    )

    for (const bet of bets) {
      const entry = byMonth.get(monthKey(bet.createdAt))
      if (entry) entry.spentCents += bet.costCents
    }
    for (const check of checks) {
      const entry = byMonth.get(monthKey(check.checkedAt))
      if (entry) entry.prizeCents += check.prizeCents
    }

    return months.map((month) => {
      const entry = byMonth.get(month) ?? { spentCents: 0n, prizeCents: 0n }
      return { month, spentCents: entry.spentCents, prizeCents: entry.prizeCents }
    })
  }),

  // CL-94 — Exportação CSV (Pro). `Feature` já lista `'export'`
  // (packages/core/src/entitlements/types.ts) mas sem gatilho mapeado em
  // `FEATURE_GATES` (packages/core/src/entitlements/guard.ts — pendência:
  // não existe um "G-export" em docs/05 §5.4). Fora do escopo/território
  // desta tarefa (packages/core é read-only aqui, e o wiring de entitlements
  // é a onda P5 da ORQUESTRACAO.md, agente separado). Não implementado —
  // pendência reportada ao orquestrador.
  // TODO(G-export): export: protectedProcedure.input(...).query(...)
})

export type WalletRouter = typeof walletRouter

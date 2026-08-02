/**
 * Router `contests` — leitura pública de concursos (tabela `Contest`, docs/07 §7.3).
 * Sem regra de domínio aqui (isso é `packages/core/checking`, consumido pelo worker
 * que popula `BetCheck` — fora do escopo deste router). Público porque também
 * alimenta a landing (`(marketing)`, "Resultados ao vivo" — docs/08 §A.3.6).
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Prisma } from '@lotopro/db'
import { publicProcedure, router } from '@/server/trpc'
import { lotterySlugSchema } from '@/server/lib/lottery-schema'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

const contestSelect = {
  id: true,
  number: true,
  drawDate: true,
  numbers: true,
  numbersDrawOrder: true,
  secondaryNumbers: true,
  extraResult: true,
  isAccumulated: true,
  isSpecial: true,
  collectedCents: true,
  accumulatedNextCents: true,
  estimatedNextCents: true,
  prizes: {
    select: { id: true, tier: true, label: true, winnersCount: true, prizeCents: true },
  },
} satisfies Prisma.ContestSelect

export const contestsRouter = router({
  /**
   * Últimos N concursos. Com `lotterySlug`: só daquela modalidade (uso: detalhe/
   * histórico). Sem `lotterySlug`: os últimos N de CADA modalidade ativa (uso:
   * feed "Últimos resultados" da landing/dashboard, docs/08 CL-02).
   */
  latest: publicProcedure
    .input(
      z.object({
        lotterySlug: lotterySlugSchema.optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.lotterySlug) {
        const lottery = await ctx.prisma.lottery.findUnique({
          where: { slug: input.lotterySlug },
          select: { slug: true, name: true, id: true },
        })
        if (!lottery) return []

        const contests = await ctx.prisma.contest.findMany({
          where: { lotteryId: lottery.id },
          orderBy: { number: 'desc' },
          take: input.limit,
          select: contestSelect,
        })
        return [{ lotterySlug: lottery.slug, lotteryName: lottery.name, contests }]
      }

      const lotteries = await ctx.prisma.lottery.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, slug: true, name: true },
      })

      return Promise.all(
        lotteries.map(async (lottery) => {
          const contests = await ctx.prisma.contest.findMany({
            where: { lotteryId: lottery.id },
            orderBy: { number: 'desc' },
            take: input.limit,
            select: contestSelect,
          })
          return { lotterySlug: lottery.slug, lotteryName: lottery.name, contests }
        }),
      )
    }),

  /** Detalhe de um concurso específico de uma modalidade. */
  byNumber: publicProcedure
    .input(z.object({ lotterySlug: lotterySlugSchema, number: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const lottery = await ctx.prisma.lottery.findUnique({
        where: { slug: input.lotterySlug },
        select: { id: true, slug: true, name: true },
      })
      if (!lottery) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Modalidade "${input.lotterySlug}" não encontrada.` })
      }

      const contest = await ctx.prisma.contest.findUnique({
        where: { lotteryId_number: { lotteryId: lottery.id, number: input.number } },
        select: contestSelect,
      })
      if (!contest) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Concurso ${input.number} de ${lottery.name} não encontrado.`,
        })
      }

      return { lotterySlug: lottery.slug, lotteryName: lottery.name, contest }
    }),
})

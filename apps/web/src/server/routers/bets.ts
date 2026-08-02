/**
 * Router `bets` — CRUD de apostas do usuário (docs/08 §C.2, CL-10..CL-21).
 *
 * Todo cálculo de domínio (validação de dezenas/campo extra, preço) vem de
 * `@lotopro/core` (`validateBet`, `priceBet`, `getLotteryConfig`/`findLotteryConfig`)
 * — este router só resolve identidades (slug → Lottery.id), ownership e persistência.
 * Nenhum `if (slug === ...)` aqui (CLAUDE.md §6).
 *
 * `costCents`/`prizeCents` são `BigInt` (CLAUDE.md §5) — o superjson registrado em
 * `server/trpc.ts` serializa `bigint` em qualquer profundidade da resposta, então
 * basta devolver os valores como `bigint` (ver `bet-json.ts` para os campos que
 * chegam do banco como `Json`/string e precisam ser reconvertidos).
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { findLotteryConfig, getLotteryConfig, validateBet, type ExtraPicks } from '@lotopro/core'
import { Prisma, type PrismaClient } from '@lotopro/db'
import { protectedProcedure, router } from '@/server/trpc'
import { BetValidationError } from '@/server/errors'
import { columnsSchema, extraPicksSchema, lotterySlugSchema, numbersSchema } from '@/server/lib/lottery-schema'
import { assertValidContestRange, buildBetInput, calculateBetCostCents } from '@/server/lib/bet-cost'
import { parseColumns, parseExtraPicks, parseTierCounts } from '@/server/lib/bet-json'

const betIdInput = z.object({ id: z.string().min(1) })

const contestRangeFields = {
  contestFrom: z.number().int().positive(),
  contestTo: z.number().int().positive(),
}

const createInput = z.object({
  lotterySlug: lotterySlugSchema,
  numbers: numbersSchema.default([]),
  extra: extraPicksSchema.optional(),
  columns: columnsSchema.optional(),
  notes: z.string().max(500).optional(),
  ...contestRangeFields,
})

const listInput = z.object({
  lotterySlug: lotterySlugSchema.optional(),
  status: z.enum(['active', 'finished']).optional(),
  prized: z.boolean().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

const updateInput = z.object({
  id: z.string().min(1),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  numbers: numbersSchema.optional(),
  extra: extraPicksSchema.optional(),
  columns: columnsSchema.optional(),
})

const duplicateInput = z.object({
  id: z.string().min(1),
  ...contestRangeFields,
})

const betInclude = {
  lottery: { select: { slug: true, name: true } },
} satisfies Prisma.BetInclude

const checkSelect = {
  id: true,
  contestId: true,
  hits: true,
  extraHits: true,
  prizeTier: true,
  prizeCents: true,
  tierCounts: true,
  drawIndex: true,
  checkedAt: true,
  contest: { select: { number: true, drawDate: true } },
} satisfies Prisma.BetCheckSelect

function mapCheck(check: {
  id: string
  contestId: string
  hits: number
  extraHits: number | null
  prizeTier: number | null
  prizeCents: bigint
  tierCounts: Prisma.JsonValue | null
  drawIndex: number | null
  checkedAt: Date
  contest: { number: number; drawDate: Date }
}) {
  return {
    id: check.id,
    contestId: check.contestId,
    contestNumber: check.contest.number,
    drawDate: check.contest.drawDate,
    hits: check.hits,
    extraHits: check.extraHits,
    prizeTier: check.prizeTier,
    prizeCents: check.prizeCents,
    tierCounts: parseTierCounts(check.tierCounts),
    drawIndex: check.drawIndex,
    checkedAt: check.checkedAt,
  }
}

/**
 * `status: 'active' | 'finished'` (CL-10) — aproximação análoga à de `update`
 * ("sem checks" = "ainda não sorteado"): um jogo está `finished` quando o último
 * concurso do seu intervalo (`contestTo`) já foi apurado (existe `Contest` com
 * `number >= contestTo` para a modalidade); `active` no caso contrário, e sempre
 * `active` para modalidades sem nenhum concurso apurado ainda. Não depende de
 * `Bet.isActive` (esse é o arquivamento manual do usuário, CL-16 — filtro
 * ortogonal, não exposto aqui para manter o filtro `status` fiel a "encerrado
 * pelo sorteio").
 */
async function buildStatusWhere(
  prisma: PrismaClient,
  status: 'active' | 'finished',
): Promise<Prisma.BetWhereInput> {
  const maxByLottery = await prisma.contest.groupBy({
    by: ['lotteryId'],
    _max: { number: true },
  })

  if (status === 'finished') {
    if (maxByLottery.length === 0) return { id: '__no-contest-settled-yet__' }
    return {
      OR: maxByLottery.map((entry) => ({
        lotteryId: entry.lotteryId,
        contestTo: { lte: entry._max.number ?? 0 },
      })),
    }
  }

  const lotteryIdsWithContests = maxByLottery.map((entry) => entry.lotteryId)
  return {
    OR: [
      { lotteryId: { notIn: lotteryIdsWithContests } },
      ...maxByLottery.map((entry) => ({
        lotteryId: entry.lotteryId,
        contestTo: { gt: entry._max.number ?? 0 },
      })),
    ],
  }
}

export const betsRouter = router({
  /** docs/08 CL-12/CL-13/CL-14 — cadastro manual, multi-concurso, custo calculado no servidor. */
  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertValidContestRange(input.contestFrom, input.contestTo)

    const config = getLotteryConfig(input.lotterySlug)
    const betInput = buildBetInput(input.lotterySlug, input.numbers, input.extra, input.columns)

    const validation = validateBet(config, betInput)
    if (!validation.ok) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: validation.errors.map((error) => error.message).join(' '),
        cause: new BetValidationError(validation.errors),
      })
    }

    const lottery = await ctx.prisma.lottery.findUnique({
      where: { slug: input.lotterySlug },
      select: { id: true },
    })
    if (!lottery) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Modalidade "${input.lotterySlug}" não encontrada.` })
    }

    const costCents = calculateBetCostCents(config, betInput, input.contestFrom, input.contestTo)

    const data: Prisma.BetUncheckedCreateInput = {
      tenantId: ctx.session.user.tenantId,
      userId: ctx.session.user.id,
      lotteryId: lottery.id,
      numbers: input.numbers,
      costCents,
      contestFrom: input.contestFrom,
      contestTo: input.contestTo,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.extra !== undefined ? { extraPicks: input.extra } : {}),
      ...(input.columns !== undefined ? { columns: input.columns } : {}),
    }

    return ctx.prisma.bet.create({ data, include: betInclude })
  }),

  /** docs/08 CL-10/CL-11 — listagem paginada; agrupamento por concurso fica no cliente. */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const and: Prisma.BetWhereInput[] = []

    if (input.lotterySlug) and.push({ lottery: { slug: input.lotterySlug } })
    if (input.prized === true) and.push({ checks: { some: { prizeCents: { gt: 0n } } } })
    if (input.prized === false) and.push({ checks: { none: { prizeCents: { gt: 0n } } } })
    if (input.status) and.push(await buildStatusWhere(ctx.prisma, input.status))

    const where: Prisma.BetWhereInput = {
      userId,
      deletedAt: null,
      ...(and.length > 0 ? { AND: and } : {}),
    }

    const rows = await ctx.prisma.bet.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        ...betInclude,
        checks: { select: checkSelect },
      },
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) {
      const extra = rows.pop()
      nextCursor = extra?.id
    }

    const items = rows.map((bet) => {
      const checks = bet.checks.map(mapCheck)
      const totalPrizeCents = checks.reduce((sum, check) => sum + check.prizeCents, 0n)
      return {
        ...bet,
        checks,
        totalPrizeCents,
        isPrized: totalPrizeCents > 0n,
      }
    })

    return { items, nextCursor }
  }),

  /** docs/08 CL-21/CL-22 — detalhe com histórico de conferências por concurso. */
  byId: protectedProcedure.input(betIdInput).query(async ({ ctx, input }) => {
    const bet = await ctx.prisma.bet.findUnique({
      where: { id: input.id },
      include: {
        ...betInclude,
        checks: {
          select: checkSelect,
          orderBy: { contest: { number: 'asc' } },
        },
      },
    })

    if (!bet || bet.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
    }

    const checks = bet.checks.map(mapCheck)
    const totalPrizeCents = checks.reduce((sum, check) => sum + check.prizeCents, 0n)

    return { ...bet, checks, totalPrizeCents, isPrized: totalPrizeCents > 0n }
  }),

  /**
   * docs/08 CL-15 — `notes`/`isActive` sempre editáveis; dezenas/extra/colunas só
   * se `checks.length === 0` (aproximação combinada de "nenhum check existe" com
   * "contestFrom ainda não sorteado" — o worker de conferência que popularia
   * `BetCheck` ainda não existe nesta onda).
   */
  update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.bet.findUnique({
      where: { id: input.id },
      include: { lottery: { select: { slug: true } }, _count: { select: { checks: true } } },
    })
    if (!existing || existing.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
    }

    const editingNumbers = input.numbers !== undefined || input.extra !== undefined || input.columns !== undefined

    let numbersUpdate: { numbers: number[]; costCents: bigint; extra: ExtraPicks | undefined; columns: number[][] | undefined } | null = null

    if (editingNumbers) {
      if (existing._count.checks > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Este jogo já foi conferido em ao menos um concurso; as dezenas não podem mais ser editadas.',
        })
      }

      const config = findLotteryConfig(existing.lottery.slug)
      if (!config) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Modalidade desconhecida no catálogo do core.' })
      }

      const numbers = input.numbers ?? (existing.numbers as number[])
      const extra = input.extra !== undefined ? input.extra : parseExtraPicks(existing.extraPicks)
      const columns = input.columns ?? parseColumns(existing.columns)

      const betInput = buildBetInput(config.slug, numbers, extra, columns)
      const validation = validateBet(config, betInput)
      if (!validation.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.errors.map((error) => error.message).join(' '),
          cause: new BetValidationError(validation.errors),
        })
      }

      const costCents = calculateBetCostCents(config, betInput, existing.contestFrom, existing.contestTo)
      numbersUpdate = { numbers, costCents, extra, columns }
    }

    const data: Prisma.BetUncheckedUpdateInput = {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(numbersUpdate
        ? {
            numbers: numbersUpdate.numbers,
            costCents: numbersUpdate.costCents,
            ...(numbersUpdate.extra !== undefined ? { extraPicks: numbersUpdate.extra } : {}),
            ...(numbersUpdate.columns !== undefined ? { columns: numbersUpdate.columns } : {}),
          }
        : {}),
    }

    return ctx.prisma.bet.update({ where: { id: input.id }, data, include: betInclude })
  }),

  /** docs/08 CL-16 — arquivamento (soft delete): nunca remove a linha. */
  archive: protectedProcedure.input(betIdInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.bet.findUnique({ where: { id: input.id }, select: { userId: true } })
    if (!existing || existing.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
    }
    return ctx.prisma.bet.update({
      where: { id: input.id },
      data: { isActive: false },
      include: betInclude,
    })
  }),

  /** docs/08 CL-17 — duplicar para novo intervalo de concursos (mesmas dezenas/extra/colunas). */
  duplicate: protectedProcedure.input(duplicateInput).mutation(async ({ ctx, input }) => {
    assertValidContestRange(input.contestFrom, input.contestTo)

    const existing = await ctx.prisma.bet.findUnique({
      where: { id: input.id },
      include: { lottery: { select: { slug: true } } },
    })
    if (!existing || existing.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
    }

    const config = findLotteryConfig(existing.lottery.slug)
    if (!config) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Modalidade desconhecida no catálogo do core.' })
    }

    const extra = parseExtraPicks(existing.extraPicks)
    const columns = parseColumns(existing.columns)
    const betInput = buildBetInput(config.slug, existing.numbers as number[], extra, columns)

    const costCents = calculateBetCostCents(config, betInput, input.contestFrom, input.contestTo)

    const data: Prisma.BetUncheckedCreateInput = {
      tenantId: existing.tenantId,
      userId: existing.userId,
      lotteryId: existing.lotteryId,
      numbers: existing.numbers,
      costCents,
      contestFrom: input.contestFrom,
      contestTo: input.contestTo,
      source: existing.source,
      ...(existing.notes !== null ? { notes: existing.notes } : {}),
      ...(extra !== undefined ? { extraPicks: extra } : {}),
      ...(columns !== undefined ? { columns } : {}),
    }

    return ctx.prisma.bet.create({ data, include: betInclude })
  }),

  /** docs/08 CL-01 — cards de resumo do dashboard. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [activeBetsCount, monthSpend, monthPrizes, activeBets] = await Promise.all([
      ctx.prisma.bet.count({ where: { userId, isActive: true, deletedAt: null } }),
      ctx.prisma.bet.aggregate({
        where: { userId, deletedAt: null, createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { costCents: true },
      }),
      ctx.prisma.betCheck.aggregate({
        where: { bet: { userId }, checkedAt: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { prizeCents: true },
      }),
      ctx.prisma.bet.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: { lotteryId: true, contestTo: true, lottery: { select: { slug: true, name: true } } },
      }),
    ])

    const byLottery = new Map<string, { slug: string; name: string; maxContestTo: number }>()
    for (const bet of activeBets) {
      const current = byLottery.get(bet.lotteryId)
      if (!current || bet.contestTo > current.maxContestTo) {
        byLottery.set(bet.lotteryId, {
          slug: bet.lottery.slug,
          name: bet.lottery.name,
          maxContestTo: bet.contestTo,
        })
      }
    }

    const lotteryIdsWithActiveBets = [...byLottery.keys()]
    const maxByLottery =
      lotteryIdsWithActiveBets.length > 0
        ? await ctx.prisma.contest.groupBy({
            by: ['lotteryId'],
            where: { lotteryId: { in: lotteryIdsWithActiveBets } },
            _max: { number: true },
          })
        : []
    const latestContestByLottery = new Map(maxByLottery.map((entry) => [entry.lotteryId, entry._max.number ?? 0]))

    const nextContestsByLottery = [...byLottery.entries()]
      .map(([lotteryId, info]) => {
        const nextContestNumber = (latestContestByLottery.get(lotteryId) ?? 0) + 1
        if (info.maxContestTo < nextContestNumber) return null
        return {
          lotterySlug: info.slug,
          lotteryName: info.name,
          nextContestNumber,
        }
      })
      .filter((entry): entry is { lotterySlug: string; lotteryName: string; nextContestNumber: number } => entry !== null)

    return {
      activeBetsCount,
      monthSpendCents: monthSpend._sum.costCents ?? 0n,
      monthPrizeCents: monthPrizes._sum.prizeCents ?? 0n,
      nextContestsByLottery,
    }
  }),
})

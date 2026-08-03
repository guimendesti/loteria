/**
 * Router `admin.bets` — docs/08 §D.4 (BO-20 listagem global, BO-21 reprocessamento).
 *
 * `list` é a visão operacional de TODAS as apostas da plataforma (qualquer usuário/tenant),
 * com os filtros que o time de suporte/operação usa para investigar um caso: modalidade,
 * usuário, concurso, premiado, origem. `reprocessChecks` é a ferramenta de correção BO-21 —
 * usada quando um bug de conferência é corrigido e os `BetCheck` já gravados precisam ser
 * recalculados, ou quando um concurso é corrigido manualmente (`admin.config.fixContest`
 * chama a mesma função de reprocessamento por concurso).
 *
 * ── Duplicação conhecida (pendência) ────────────────────────────────────────────────────
 *
 * A reconstrução de `ContestResult` a partir das colunas cruas do banco (`reconstructContestResult`
 * abaixo) é uma cópia ENXUTA da lógica equivalente em `apps/worker/src/jobs/check-bets.ts`
 * (mesmo nome de função, de propósito, para facilitar comparação lado a lado). Não dava para
 * importar de `apps/worker` — é outro app do monorepo, não um pacote publicável — e o
 * escopo desta tarefa pediu explicitamente para replicar o mínimo aqui em vez de recriar o
 * job inteiro. A reconstrução do lado da APOSTA (`extraPicks`/`columns`/`matchPicks`) não
 * precisou ser duplicada: reaproveita `parseExtraPicks`/`parseColumns` de
 * `@/server/lib/bet-json.ts`, que já existem para o router `bets` do cliente.
 *
 * PRÓXIMO PASSO recomendado: mover `reconstructContestResult`/`reconstructPrizes`/
 * `reconstructExtraResult` para `packages/core` (ou um pacote `@lotopro/db`-adjacent
 * compartilhado) como uma função pura `contestRowToResult(row, config)`, e fazer tanto
 * `apps/worker/src/jobs/check-bets.ts` quanto este router importarem dali. Hoje, qualquer
 * correção nessa lógica precisa ser replicada nos dois lugares manualmente.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  check,
  getLotteryConfig,
  type BetInput,
  type ContestPrizeData,
  type ContestResult,
  type ExtraFieldConfig,
  type ExtraResult,
  type LotteryConfig,
  type LotterySlug,
} from '@lotopro/core'
import { BetSource, Prisma, UserRole, type PrismaClient } from '@lotopro/db'
import { router } from '@/server/trpc'
import { lotterySlugSchema } from '@/server/lib/lottery-schema'
import { parseColumns, parseExtraPicks, parseTierCounts } from '@/server/lib/bet-json'
import { adminProcedure } from '@/server/lib/admin/rbac'
import { writeAudit } from '@/server/lib/admin/audit'

// ─── Reconstrução de ContestResult a partir do banco (ver cabeçalho — duplicação conhecida) ──

interface ContestPrizeRow {
  tier: number
  label: string
  winnersCount: number
  prizeCents: bigint
}

/** Campos de `Contest` necessários para reconstruir um `ContestResult` do core. */
export interface ContestRow {
  id: string
  number: number
  drawDate: Date
  numbers: number[]
  numbersDrawOrder: number[]
  secondaryNumbers: number[]
  extraResult: Prisma.JsonValue | null
  isAccumulated: boolean
  collectedCents: bigint | null
  accumulatedNextCents: bigint | null
  estimatedNextCents: bigint | null
  rawPayload: Prisma.JsonValue
  prizes: ContestPrizeRow[]
}

const cloverJsonSchema = z.object({ clovers: z.array(z.number()) })
const monthJsonSchema = z.object({ month: z.number() })
const teamJsonSchema = z.object({ team: z.string() })

function reconstructExtraResult(raw: unknown, extraField: ExtraFieldConfig | null): ExtraResult | null {
  if (extraField === null || raw === null || raw === undefined) return null
  if (extraField.kind === 'CLOVER') {
    const parsed = cloverJsonSchema.safeParse(raw)
    return parsed.success ? { kind: 'CLOVER', clovers: parsed.data.clovers } : null
  }
  if (extraField.kind === 'MONTH') {
    const parsed = monthJsonSchema.safeParse(raw)
    return parsed.success ? { kind: 'MONTH', month: parsed.data.month } : null
  }
  const parsed = teamJsonSchema.safeParse(raw)
  return parsed.success ? { kind: 'TEAM', teamName: parsed.data.team } : null
}

/** Mesma renumeração de faixas por sorteio que `apps/worker/src/jobs/check-bets.ts` — ver cabeçalho. */
function reconstructPrizes(rows: readonly ContestPrizeRow[], drawsPerContest: number): ContestPrizeData[] {
  const sorted = [...rows].sort((a, b) => a.tier - b.tier)
  if (drawsPerContest <= 1) {
    return sorted.map((row) => ({ ...row, drawIndex: null }))
  }
  const groupSize = Math.max(1, Math.ceil(sorted.length / drawsPerContest))
  return sorted.map((row, index) => ({
    tier: (index % groupSize) + 1,
    label: row.label,
    winnersCount: row.winnersCount,
    prizeCents: row.prizeCents,
    drawIndex: Math.floor(index / groupSize) + 1,
  }))
}

export function reconstructContestResult(contest: ContestRow, config: LotteryConfig): ContestResult {
  return {
    lottery: config.slug,
    contestNumber: contest.number,
    drawDate: contest.drawDate.toISOString().slice(0, 10),
    numbers: contest.numbers,
    numbersDrawOrder: contest.numbersDrawOrder,
    secondaryNumbers: contest.secondaryNumbers,
    extraResult: reconstructExtraResult(contest.extraResult, config.extraField),
    isAccumulated: contest.isAccumulated,
    prizes: reconstructPrizes(contest.prizes, config.drawsPerContest),
    collectedCents: contest.collectedCents,
    accumulatedNextCents: contest.accumulatedNextCents,
    estimatedNextCents: contest.estimatedNextCents,
    nextContestNumber: null,
    raw: contest.rawPayload,
  }
}

export interface BetRow {
  id: string
  numbers: number[]
  extraPicks: Prisma.JsonValue | null
  columns: Prisma.JsonValue | null
  matchPicks: Prisma.JsonValue | null
}

export function reconstructBetInput(bet: BetRow, config: LotteryConfig): BetInput {
  const extra = parseExtraPicks(bet.extraPicks)
  const columnsSource = config.format === 'MATCH_LIST' ? bet.matchPicks : config.format === 'COLUMNS' ? bet.columns : null
  const columns = columnsSource === null ? undefined : parseColumns(columnsSource)

  return {
    lottery: config.slug,
    numbers: bet.numbers,
    ...(extra !== undefined ? { extra } : {}),
    ...(columns !== undefined ? { columns } : {}),
  }
}

// ─── Porta mínima de Prisma para o reprocessamento (testável com duplo em memória) ────────

export interface AdminReprocessBetSummary extends BetRow {
  lotteryId: string
  contestFrom: number
  contestTo: number
}

export interface AdminReprocessPrisma {
  contest: {
    findMany(args: {
      where: { lotteryId: string; number: { gte: number; lte: number } }
      include: { prizes: true }
      orderBy: { number: 'asc' }
    }): Promise<ContestRow[]>
  }
  bet: {
    findMany(args: {
      where: {
        lotteryId: string
        isActive: boolean
        contestFrom: { lte: number }
        contestTo: { gte: number }
        id?: { gt: string }
      }
      orderBy: { id: 'asc' }
      take: number
    }): Promise<BetRow[]>
  }
  betCheck: {
    deleteMany(args: { where: { contestId: string } | { betId: string } }): Promise<{ count: number }>
    create(args: {
      data: {
        betId: string
        contestId: string
        drawIndex: number
        hits: number
        hitNumbers: number[]
        extraHits: number | null
        prizeTier: number | null
        prizeCents: bigint
        tierCounts: unknown
      }
    }): Promise<unknown>
  }
}

export const REPROCESS_BATCH_SIZE = 500

function drawToBetCheckData(betId: string, contestId: string, draw: ReturnType<typeof check>['draws'][number]) {
  return {
    betId,
    contestId,
    drawIndex: draw.drawIndex,
    hits: draw.hits,
    hitNumbers: draw.hitNumbers,
    extraHits: draw.extraHits,
    prizeTier: draw.prizeTier,
    prizeCents: draw.prizeCents,
    tierCounts: draw.tierCounts.map((entry) => ({
      tier: entry.tier,
      count: entry.count,
      prizeCents: entry.prizeCents.toString(),
    })),
  }
}

export interface ReprocessSummary {
  deletedChecks: number
  recreatedChecks: number
  processedBets: number
  prizedBets: number
}

/**
 * BO-21 — escopo "concurso": apaga TODOS os `BetCheck` daquele concurso e refaz a
 * conferência para as apostas atualmente ATIVAS que cobrem esse concurso (mesmo filtro de
 * `apps/worker/src/jobs/check-bets.ts`: `isActive && contestFrom <= N <= contestTo`).
 * Idempotente por construção — deletar e recriar duas vezes seguidas produz o mesmo estado
 * final. Usada por `reprocessChecks` (input `{lotterySlug, contestNumber}`) e por
 * `admin.config.fixContest` (após corrigir as dezenas de um concurso).
 */
export async function reprocessContestScope(
  prisma: AdminReprocessPrisma,
  lotteryId: string,
  contest: ContestRow,
  config: LotteryConfig,
): Promise<ReprocessSummary> {
  const contestResult = reconstructContestResult(contest, config)

  const deleted = await prisma.betCheck.deleteMany({ where: { contestId: contest.id } })

  let processedBets = 0
  let prizedBets = 0
  let recreatedChecks = 0
  let cursorId: string | undefined

  for (;;) {
    const batch = await prisma.bet.findMany({
      where: {
        lotteryId,
        isActive: true,
        contestFrom: { lte: contest.number },
        contestTo: { gte: contest.number },
        ...(cursorId !== undefined ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: REPROCESS_BATCH_SIZE,
    })
    if (batch.length === 0) break

    for (const bet of batch) {
      const betInput = reconstructBetInput(bet, config)
      const outcome = check(config, betInput, contestResult)
      for (const draw of outcome.draws) {
        await prisma.betCheck.create({ data: drawToBetCheckData(bet.id, contest.id, draw) })
        recreatedChecks += 1
      }
      processedBets += 1
      if (outcome.totalPrizeCents > 0n) prizedBets += 1
    }

    const last = batch[batch.length - 1]
    cursorId = last?.id
    if (batch.length < REPROCESS_BATCH_SIZE) break
  }

  return { deletedChecks: deleted.count, recreatedChecks, processedBets, prizedBets }
}

/**
 * BO-21 — escopo "aposta": apaga TODOS os `BetCheck` desta aposta (em qualquer concurso) e
 * refaz a conferência contra todo `Contest` já persistido dentro de `[contestFrom, contestTo]`
 * da modalidade. Diferente do escopo "concurso", aqui a aposta é reprocessada mesmo que hoje
 * esteja arquivada (`isActive: false`) — o operador escolheu ESSA aposta especificamente, não
 * uma varredura em lote.
 */
export async function reprocessBetScope(
  prisma: AdminReprocessPrisma,
  bet: AdminReprocessBetSummary,
  config: LotteryConfig,
): Promise<ReprocessSummary> {
  const contests = await prisma.contest.findMany({
    where: { lotteryId: bet.lotteryId, number: { gte: bet.contestFrom, lte: bet.contestTo } },
    include: { prizes: true },
    orderBy: { number: 'asc' },
  })

  const deleted = await prisma.betCheck.deleteMany({ where: { betId: bet.id } })

  let recreatedChecks = 0
  let prized = false
  for (const contest of contests) {
    const contestResult = reconstructContestResult(contest, config)
    const betInput = reconstructBetInput(bet, config)
    const outcome = check(config, betInput, contestResult)
    for (const draw of outcome.draws) {
      await prisma.betCheck.create({ data: drawToBetCheckData(bet.id, contest.id, draw) })
      recreatedChecks += 1
    }
    if (outcome.totalPrizeCents > 0n) prized = true
  }

  return {
    deletedChecks: deleted.count,
    recreatedChecks,
    processedBets: contests.length,
    prizedBets: prized ? 1 : 0,
  }
}

/** Adapta o `PrismaClient` real para `AdminReprocessPrisma` — só este ponto conhece o Prisma de verdade. */
export function createAdminReprocessPrismaAdapter(prisma: PrismaClient): AdminReprocessPrisma {
  return {
    contest: {
      findMany: ({ where, include, orderBy }) =>
        prisma.contest.findMany({
          where: { lotteryId: where.lotteryId, number: where.number },
          include,
          orderBy,
        }),
    },
    bet: {
      findMany: ({ where, orderBy, take }) =>
        prisma.bet.findMany({
          where,
          orderBy,
          take,
          select: { id: true, numbers: true, extraPicks: true, columns: true, matchPicks: true },
        }),
    },
    betCheck: {
      deleteMany: ({ where }) => prisma.betCheck.deleteMany({ where }),
      create: ({ data }) =>
        prisma.betCheck.create({
          data: { ...data, tierCounts: data.tierCounts as Prisma.InputJsonValue },
        }),
    },
  }
}

// ─── Router ────────────────────────────────────────────────────────────────────────────

const listInput = z.object({
  lotterySlug: lotterySlugSchema.optional(),
  userId: z.string().min(1).optional(),
  contestNumber: z.number().int().positive().optional(),
  prized: z.boolean().optional(),
  source: z.nativeEnum(BetSource).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

const betInclude = {
  lottery: { select: { slug: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  checks: {
    select: {
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
    },
  },
} satisfies Prisma.BetInclude

const reprocessInput = z.union([
  z.object({ lotterySlug: lotterySlugSchema, contestNumber: z.number().int().positive() }),
  z.object({ betId: z.string().min(1) }),
])

export const adminBetsRouter = router({
  /** BO-20 — listagem global de apostas (todos os usuários/tenants), com filtros operacionais. */
  list: adminProcedure(UserRole.VIEWER).input(listInput).query(async ({ ctx, input }) => {
    const and: Prisma.BetWhereInput[] = []
    if (input.lotterySlug) and.push({ lottery: { slug: input.lotterySlug } })
    if (input.userId) and.push({ userId: input.userId })
    if (input.contestNumber !== undefined) {
      and.push({ contestFrom: { lte: input.contestNumber }, contestTo: { gte: input.contestNumber } })
    }
    if (input.prized === true) and.push({ checks: { some: { prizeCents: { gt: 0n } } } })
    if (input.prized === false) and.push({ checks: { none: { prizeCents: { gt: 0n } } } })
    if (input.source) and.push({ source: input.source })

    const where: Prisma.BetWhereInput = {
      deletedAt: null,
      ...(and.length > 0 ? { AND: and } : {}),
    }

    const rows = await ctx.prisma.bet.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: betInclude,
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) {
      const extra = rows.pop()
      nextCursor = extra?.id
    }

    const items = rows.map((bet) => {
      const checks = bet.checks.map((check) => ({ ...check, tierCounts: parseTierCounts(check.tierCounts) }))
      const totalPrizeCents = checks.reduce((sum, item) => sum + item.prizeCents, 0n)
      return { ...bet, checks, totalPrizeCents, isPrized: totalPrizeCents > 0n }
    })

    return { items, nextCursor }
  }),

  /**
   * BO-21 — ferramenta de correção: apaga e refaz a conferência de um escopo (concurso ou
   * aposta). SUPPORT é o papel mínimo (docs/08 §D.1: "reprocessar conferência" está listado
   * explicitamente nas permissões de SUPPORT). Grava `AuditLog` sempre.
   */
  reprocessChecks: adminProcedure(UserRole.SUPPORT).input(reprocessInput).mutation(async ({ ctx, input }) => {
    const actor = ctx.session.user
    const prisma = createAdminReprocessPrismaAdapter(ctx.prisma)

    if ('betId' in input) {
      const bet = await ctx.prisma.bet.findUnique({
        where: { id: input.betId },
        select: {
          id: true,
          numbers: true,
          extraPicks: true,
          columns: true,
          matchPicks: true,
          lotteryId: true,
          contestFrom: true,
          contestTo: true,
          lottery: { select: { slug: true } },
        },
      })
      if (!bet) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aposta não encontrada.' })

      const config = getLotteryConfig(bet.lottery.slug as LotterySlug)
      const summary = await reprocessBetScope(prisma, bet, config)

      await writeAudit(ctx.prisma, {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'admin.bet_check.reprocessed',
        entityType: 'Bet',
        entityId: bet.id,
        before: { deletedChecks: summary.deletedChecks },
        after: {
          scope: 'bet',
          recreatedChecks: summary.recreatedChecks,
          contestsProcessed: summary.processedBets,
        },
      })

      return { scope: 'bet' as const, betId: bet.id, ...summary }
    }

    const lottery = await ctx.prisma.lottery.findUnique({ where: { slug: input.lotterySlug }, select: { id: true } })
    if (!lottery) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Modalidade "${input.lotterySlug}" não encontrada.` })
    }

    const contest = await ctx.prisma.contest.findUnique({
      where: { lotteryId_number: { lotteryId: lottery.id, number: input.contestNumber } },
      include: { prizes: { select: { tier: true, label: true, winnersCount: true, prizeCents: true } } },
    })
    if (!contest) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Concurso ${input.contestNumber} de "${input.lotterySlug}" não encontrado.`,
      })
    }

    const config = getLotteryConfig(input.lotterySlug)
    const summary = await reprocessContestScope(prisma, lottery.id, contest, config)

    await writeAudit(ctx.prisma, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin.bet_check.reprocessed',
      entityType: 'Contest',
      entityId: contest.id,
      before: { deletedChecks: summary.deletedChecks },
      after: {
        scope: 'contest',
        recreatedChecks: summary.recreatedChecks,
        processedBets: summary.processedBets,
        prizedBets: summary.prizedBets,
      },
    })

    return {
      scope: 'contest' as const,
      contestId: contest.id,
      lotterySlug: input.lotterySlug,
      contestNumber: input.contestNumber,
      ...summary,
    }
  }),
})

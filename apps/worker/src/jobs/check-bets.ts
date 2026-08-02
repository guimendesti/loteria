/**
 * SY-03 — check-bets: confere, em lotes, todas as apostas ativas de uma modalidade contra
 * um concurso recém-persistido (docs/06 §6.7). Disparado por `sync-results` com
 * `{ lotterySlug, contestNumber }`.
 *
 * Fluxo por lote de `BATCH_SIZE` apostas:
 *   1. reconstrói `BetInput` a partir das colunas cruas do banco (`numbers`/`extraPicks`/
 *      `columns`/`matchPicks`);
 *   2. chama `check()` do core com a `LotteryConfig` da modalidade e o `ContestResult`
 *      reconstruído do concurso;
 *   3. grava um `BetCheck` por sorteio do concurso (`upsert` na unique `(betId, contestId,
 *      drawIndex)` — idempotente: reprocessar o mesmo concurso atualiza em vez de duplicar).
 *
 * Ao final: marca `Contest.settledAt` e enfileira UM job `notify` por usuário que teve pelo
 * menos uma aposta conferida neste concurso (premiado ou não — o payload carrega os dois casos,
 * `notify.ts` decide o texto).
 *
 * ⚠️ DECISÃO TEMPORÁRIA (pedida no escopo): `prizeTiers`/`priceTiers` da `LotteryConfig` vêm
 * de `getLotteryConfig()` do core (fonte estática, `packages/core/src/lottery/configs.ts`),
 * NÃO da tabela `prize_tiers`/`price_tiers` do banco. Motivo: o motor de "modalidade é dado"
 * versionado por banco (docs/07) ainda não tem um caminho de leitura implementado neste
 * pacote; o catálogo estático é a fonte de verdade dos testes de `packages/core` hoje. Trocar
 * quando o carregamento de config por banco existir — nesse ponto, `check-bets.ts` passa a
 * receber a config já resolvida em vez de chamar `getLotteryConfig` diretamente.
 *
 * Padrão function-factory + DI: `createCheckBetsJob(deps)` recebe uma interface MÍNIMA de
 * Prisma — só os métodos usados aqui — para permitir teste com um duplo em memória (ver
 * `test/check-bets.test.ts`), sem subir Postgres.
 */
import { z } from 'zod'
import {
  check,
  getLotteryConfig,
  type BetInput,
  type ContestPrizeData,
  type ContestResult,
  type DrawCheck,
  type ExtraFieldConfig,
  type ExtraPicks,
  type ExtraResult,
  type LotteryConfig,
  type LotterySlug,
} from '@lotopro/core'
import type { NotifyJobData } from '../queues'
import { formatIsoDateInSaoPaulo } from '../lib/timezone'
import { centsToBRL } from '../lib/money'
import type { Logger } from '../lib/logger'

export const BATCH_SIZE = 500

// ─── Interface mínima de Prisma ───────────────────────────────────────────────

export interface CheckBetsPrismaLottery {
  id: string
  slug: string
}

export interface CheckBetsPrismaPrizeRow {
  tier: number
  label: string
  winnersCount: number
  prizeCents: bigint
}

export interface CheckBetsPrismaContest {
  id: string
  number: number
  drawDate: Date
  numbers: number[]
  numbersDrawOrder: number[]
  secondaryNumbers: number[]
  extraResult: unknown
  isAccumulated: boolean
  collectedCents: bigint | null
  accumulatedNextCents: bigint | null
  estimatedNextCents: bigint | null
  rawPayload: unknown
  prizes: CheckBetsPrismaPrizeRow[]
}

export interface CheckBetsPrismaBet {
  id: string
  userId: string
  numbers: number[]
  extraPicks: unknown
  columns: unknown
  matchPicks: unknown
}

export interface CheckBetsPrisma {
  lottery: {
    findUnique(args: { where: { slug: string } }): Promise<CheckBetsPrismaLottery | null>
  }
  contest: {
    findUnique(args: {
      where: { lotteryId_number: { lotteryId: string; number: number } }
      include: { prizes: true }
    }): Promise<CheckBetsPrismaContest | null>
    update(args: { where: { id: string }; data: { settledAt: Date } }): Promise<unknown>
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
    }): Promise<CheckBetsPrismaBet[]>
  }
  betCheck: {
    /**
     * `DrawCheck.drawIndex` (saída de `check()` do core) é sempre um número 1-based — 1 para
     * modalidades de sorteio único, 1 ou 2 na Dupla Sena (packages/core/src/types.ts: "1-based",
     * nunca `null`). `BetCheck.drawIndex` é `Int?` no schema (nullable só para modalidades que
     * viessem a não ter nenhum sorteio identificável), mas como sempre gravamos um valor
     * concreto aqui, o atalho de chave composta do Prisma funciona sem o problema de "unique
     * composta com membro nulo" — daí `upsert` puro, atômico, sem `updateMany`+`create`.
     */
    upsert(args: {
      where: { betId_contestId_drawIndex: { betId: string; contestId: string; drawIndex: number } }
      create: BetCheckWriteData & { betId: string; contestId: string; drawIndex: number }
      update: BetCheckWriteData
    }): Promise<unknown>
  }
}

interface BetCheckWriteData {
  hits: number
  hitNumbers: number[]
  extraHits: number | null
  prizeTier: number | null
  prizeCents: bigint
}

export interface CheckBetsNotifyQueue {
  add(name: string, data: NotifyJobData): Promise<unknown>
}

export interface CheckBetsDeps {
  prisma: CheckBetsPrisma
  notifyQueue: CheckBetsNotifyQueue
  logger?: Logger
}

// ─── Payload ───────────────────────────────────────────────────────────────

export const checkBetsPayloadSchema = z.object({
  lotterySlug: z.string(),
  contestNumber: z.number().int().positive(),
})
export type CheckBetsPayload = z.infer<typeof checkBetsPayloadSchema>

export interface CheckBetsResult {
  processedBets: number
  prizedBets: number
  notifiedUsers: number
}

export function createCheckBetsJob(deps: CheckBetsDeps) {
  const logger = deps.logger

  return async function checkBets(data: CheckBetsPayload): Promise<CheckBetsResult> {
    const { lotterySlug, contestNumber } = checkBetsPayloadSchema.parse(data)
    const config = getLotteryConfig(lotterySlug as LotterySlug)

    const lottery = await deps.prisma.lottery.findUnique({ where: { slug: lotterySlug } })
    if (!lottery) {
      throw new Error(`check-bets: modalidade "${lotterySlug}" não encontrada no banco`)
    }

    const contest = await deps.prisma.contest.findUnique({
      where: { lotteryId_number: { lotteryId: lottery.id, number: contestNumber } },
      include: { prizes: true },
    })
    if (!contest) {
      throw new Error(
        `check-bets: concurso ${contestNumber} de "${lotterySlug}" não encontrado — ` +
          'sync-results deveria ter persistido antes de enfileirar check-bets',
      )
    }

    const contestResult = reconstructContestResult(contest, config)

    const userAggregates = new Map<string, UserAggregate>()
    let processedBets = 0
    let prizedBets = 0
    let cursorId: string | undefined

    for (;;) {
      const batch = await deps.prisma.bet.findMany({
        where: {
          lotteryId: lottery.id,
          isActive: true,
          contestFrom: { lte: contestNumber },
          contestTo: { gte: contestNumber },
          ...(cursorId !== undefined ? { id: { gt: cursorId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      if (batch.length === 0) break

      await Promise.all(
        batch.map(async (bet) => {
          const betInput = reconstructBetInput(bet, config)
          const outcome = check(config, betInput, contestResult)

          await Promise.all(outcome.draws.map((draw) => upsertBetCheck(deps.prisma, bet.id, contest.id, draw)))

          // Ponto síncrono (sem `await` até o fim) — seguro mesmo com vários bets do
          // mesmo usuário rodando em paralelo via `Promise.all` (JS não interrompe um
          // trecho síncrono no meio).
          processedBets += 1
          const prized = outcome.totalPrizeCents > 0n
          if (prized) prizedBets += 1
          const agg = userAggregates.get(bet.userId) ?? { totalPrizeCents: 0n, betCount: 0, prizedBetCount: 0 }
          agg.betCount += 1
          agg.totalPrizeCents += outcome.totalPrizeCents
          if (prized) agg.prizedBetCount += 1
          userAggregates.set(bet.userId, agg)
        }),
      )

      const lastBet = batch[batch.length - 1]
      cursorId = lastBet?.id
      if (batch.length < BATCH_SIZE) break
    }

    await deps.prisma.contest.update({ where: { id: contest.id }, data: { settledAt: new Date() } })

    for (const [userId, agg] of userAggregates) {
      await deps.notifyQueue.add('notify', buildNotifyPayload(userId, config, contestNumber, agg))
    }

    logger?.info('check-bets.done', {
      lotterySlug,
      contestNumber,
      processedBets,
      prizedBets,
      notifiedUsers: userAggregates.size,
    })

    return { processedBets, prizedBets, notifiedUsers: userAggregates.size }
  }
}

async function upsertBetCheck(
  prisma: CheckBetsPrisma,
  betId: string,
  contestId: string,
  draw: DrawCheck,
): Promise<void> {
  const data: BetCheckWriteData = {
    hits: draw.hits,
    hitNumbers: draw.hitNumbers,
    extraHits: draw.extraHits,
    prizeTier: draw.prizeTier,
    prizeCents: draw.prizeCents,
  }
  await prisma.betCheck.upsert({
    where: { betId_contestId_drawIndex: { betId, contestId, drawIndex: draw.drawIndex } },
    create: { betId, contestId, drawIndex: draw.drawIndex, ...data },
    update: data,
  })
}

interface UserAggregate {
  totalPrizeCents: bigint
  betCount: number
  prizedBetCount: number
}

function buildNotifyPayload(
  userId: string,
  config: LotteryConfig,
  contestNumber: number,
  agg: UserAggregate,
): NotifyJobData {
  const prized = agg.prizedBetCount > 0
  return {
    userId,
    type: prized ? 'bet.prized' : 'bet.checked',
    title: prized
      ? `Você foi premiado no concurso ${contestNumber} da ${config.name}!`
      : `Concurso ${contestNumber} da ${config.name} conferido`,
    body: prized
      ? `Prêmio total: ${centsToBRL(agg.totalPrizeCents)} em ${agg.prizedBetCount} aposta(s).`
      : `${agg.betCount} aposta(s) conferida(s) — sem premiação desta vez.`,
    payload: {
      lotterySlug: config.slug,
      contestNumber,
      totalPrizeCents: agg.totalPrizeCents.toString(),
      betCount: agg.betCount,
      prizedBetCount: agg.prizedBetCount,
    },
  }
}

// ─── Reconstrução de ContestResult a partir do banco ──────────────────────────

/**
 * A Caixa numera faixas de forma CONTÍNUA através dos sorteios da Dupla Sena (1..4 = 1º
 * sorteio, 5..8 = 2º — ver packages/integrations/src/caixa/parse.ts `drawIndexFor`), mas o
 * `LotteryConfig.prizeTiers` do core reinicia o `tier` em cada sorteio (1..4 duas vezes,
 * desambiguado por `drawIndex` — ver packages/core/src/checking/check.ts `prizeForTier`).
 * `ContestPrize` (schema Prisma) não guarda `drawIndex`, só `tier` — então, para concursos
 * com mais de um sorteio, dividimos a lista (ordenada por `tier`, que preserva a ordem
 * original da Caixa) em `drawsPerContest` grupos e renumeramos `tier` a partir de 1 dentro de
 * cada grupo. Isso reproduz exatamente a numeração que `check()` espera. Para modalidades de
 * sorteio único (a maioria), não há o que ajustar.
 */
function reconstructPrizes(
  rows: readonly CheckBetsPrismaPrizeRow[],
  drawsPerContest: number,
): ContestPrizeData[] {
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

const cloverJsonSchema = z.object({ clovers: z.array(z.number()) })
const monthJsonSchema = z.object({ month: z.number() })
const teamJsonSchema = z.object({ team: z.string() })

/** Espelha o formato salvo em `Contest.extraResult` (comentário no schema.prisma). */
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

export function reconstructContestResult(
  contest: CheckBetsPrismaContest,
  config: LotteryConfig,
): ContestResult {
  return {
    lottery: config.slug,
    contestNumber: contest.number,
    drawDate: formatIsoDateInSaoPaulo(contest.drawDate),
    numbers: contest.numbers,
    numbersDrawOrder: contest.numbersDrawOrder,
    secondaryNumbers: contest.secondaryNumbers,
    extraResult: reconstructExtraResult(contest.extraResult, config.extraField),
    isAccumulated: contest.isAccumulated,
    prizes: reconstructPrizes(contest.prizes, config.drawsPerContest),
    collectedCents: contest.collectedCents,
    accumulatedNextCents: contest.accumulatedNextCents,
    estimatedNextCents: contest.estimatedNextCents,
    // Não persistido em `Contest` — não usado por `check()`.
    nextContestNumber: null,
    raw: contest.rawPayload,
  }
}

// ─── Reconstrução de BetInput a partir do banco ───────────────────────────────

/** Espelha o formato salvo em `Bet.extraPicks` (comentário no schema.prisma). */
function reconstructExtraPicks(raw: unknown, extraField: ExtraFieldConfig | null): ExtraPicks | undefined {
  if (extraField === null || raw === null || raw === undefined) return undefined
  if (extraField.kind === 'CLOVER') {
    const parsed = cloverJsonSchema.safeParse(raw)
    return parsed.success ? { kind: 'CLOVER', clovers: parsed.data.clovers } : undefined
  }
  if (extraField.kind === 'MONTH') {
    const parsed = monthJsonSchema.safeParse(raw)
    return parsed.success ? { kind: 'MONTH', month: parsed.data.month } : undefined
  }
  const parsed = teamJsonSchema.safeParse(raw)
  return parsed.success ? { kind: 'TEAM', teamId: parsed.data.team } : undefined
}

const columnsJsonSchema = z.array(z.array(z.number()))

export function reconstructBetInput(bet: CheckBetsPrismaBet, config: LotteryConfig): BetInput {
  const extra = reconstructExtraPicks(bet.extraPicks, config.extraField)

  const columnsSource =
    config.format === 'MATCH_LIST' ? bet.matchPicks : config.format === 'COLUMNS' ? bet.columns : null
  const parsedColumns = columnsSource === null ? undefined : columnsJsonSchema.safeParse(columnsSource)
  const columns = parsedColumns?.success ? parsedColumns.data : undefined

  return {
    lottery: config.slug,
    numbers: bet.numbers,
    ...(extra !== undefined ? { extra } : {}),
    ...(columns !== undefined ? { columns } : {}),
  }
}

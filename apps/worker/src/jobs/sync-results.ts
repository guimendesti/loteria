/**
 * SY-01 — sync-results: busca o concurso mais recente de cada modalidade ativa na Caixa
 * (via `ResilientResultProvider`, primária `CaixaOfficialProvider` — docs/06 §6.6) e persiste
 * o que for novo.
 *
 * Padrão function-factory: `createSyncResultsJob(deps)` recebe uma interface MÍNIMA de
 * Prisma (só os métodos realmente usados aqui), não o `PrismaClient` inteiro — isso permite
 * testar a lógica de "é concurso novo? enfileira check-bets?" com um duplo em memória, sem
 * subir Postgres (ver `test/sync-results.test.ts` e a decisão de DI no relatório da tarefa).
 *
 * Idempotência: a chave é `(lotteryId, number)` — `Contest.number` — via `upsert`. Mesmo que
 * o job rode duas vezes para o mesmo concurso (retry, dois ticks próximos), o resultado final
 * é o mesmo registro, não duplicado. Só entramos no upsert quando `contestNumber` é MAIOR que
 * o último persistido, então reprocessar um concurso já visto não gera nenhuma escrita.
 */
import { ALL_LOTTERIES, type ContestResult, type LotteryConfig, type LotterySlug } from '@lotopro/core'
import { Prisma } from '@lotopro/db'
import type { CheckBetsJobData } from '../queues'
import { saoPauloDateToUtc } from '../lib/timezone'
import type { Logger } from '../lib/logger'

// ─── Interface mínima de Prisma ───────────────────────────────────────────────

export interface SyncResultsPrismaLottery {
  id: string
  slug: string
}

interface ContestWriteData {
  lotteryId: string
  number: number
  drawDate: Date
  numbers: number[]
  numbersDrawOrder: number[]
  secondaryNumbers: number[]
  extraResult: Prisma.InputJsonValue | typeof Prisma.JsonNull
  isAccumulated: boolean
  collectedCents: bigint | null
  accumulatedNextCents: bigint | null
  estimatedNextCents: bigint | null
  rawPayload: Prisma.InputJsonValue
}

export interface SyncResultsPrisma {
  lottery: {
    findMany(args: { where: { isActive: boolean } }): Promise<SyncResultsPrismaLottery[]>
  }
  contest: {
    findFirst(args: {
      where: { lotteryId: string }
      orderBy: { number: 'desc' }
    }): Promise<{ number: number } | null>
    upsert(args: {
      where: { lotteryId_number: { lotteryId: string; number: number } }
      create: ContestWriteData
      update: ContestWriteData
    }): Promise<{ id: string }>
  }
  contestPrize: {
    upsert(args: {
      where: { contestId_tier: { contestId: string; tier: number } }
      create: { contestId: string; tier: number; label: string; winnersCount: number; prizeCents: bigint }
      update: { label: string; winnersCount: number; prizeCents: bigint }
    }): Promise<unknown>
  }
}

export interface SyncResultsProvider {
  fetchLatest(slug: LotterySlug): Promise<ContestResult>
}

export interface SyncResultsCheckBetsQueue {
  add(name: string, data: CheckBetsJobData): Promise<unknown>
}

export interface SyncResultsDeps {
  prisma: SyncResultsPrisma
  provider: SyncResultsProvider
  checkBetsQueue: SyncResultsCheckBetsQueue
  logger?: Logger
  /**
   * ⚠️ Decisão temporária: a lista/calendário de modalidades vem do catálogo ESTÁTICO de
   * `@lotopro/core` (`ALL_LOTTERIES`), não do banco. Em produção `lotteries` já vive no
   * Postgres (docs/07) e deveria ser a fonte de verdade; por ora usamos a config estática
   * porque é a mesma fonte usada por `check-bets.ts` para `prizeTiers`/`priceTiers`
   * (ver decisão lá) — trocar as duas juntas quando o motor de modalidades for para o banco.
   */
  lotteries?: readonly LotteryConfig[]
}

const CHECK_BETS_JOB_NAME = 'check-bets'

export interface SyncResultsSummary {
  attempted: LotterySlug[]
  newContests: Array<{ lotterySlug: LotterySlug; contestNumber: number }>
  unchanged: LotterySlug[]
  errors: Array<{ lotterySlug: LotterySlug; error: string }>
}

/**
 * `onlySlugs`, quando fornecido, restringe a corrida a essas modalidades (usado pelo gate de
 * janela do scheduler). Sem argumento, sincroniza TODAS as modalidades ativas — uso manual.
 */
export type RunSyncResults = (onlySlugs?: readonly LotterySlug[]) => Promise<SyncResultsSummary>

export function createSyncResultsJob(deps: SyncResultsDeps): RunSyncResults {
  const lotteries = deps.lotteries ?? ALL_LOTTERIES
  const logger = deps.logger

  return async function runSyncResults(onlySlugs): Promise<SyncResultsSummary> {
    const activeRows = await deps.prisma.lottery.findMany({ where: { isActive: true } })
    const activeBySlug = new Map(activeRows.map((row) => [row.slug, row]))

    const candidateSlugs = onlySlugs ?? lotteries.map((config) => config.slug)
    const targets = candidateSlugs.filter((slug) => activeBySlug.has(slug))

    const summary: SyncResultsSummary = { attempted: [], newContests: [], unchanged: [], errors: [] }

    for (const slug of targets) {
      const lotteryRow = activeBySlug.get(slug)
      if (!lotteryRow) continue // já filtrado acima — guarda de tipo

      summary.attempted.push(slug)
      try {
        const result = await deps.provider.fetchLatest(slug)
        if (result.lottery !== slug) {
          throw new Error(
            `provider devolveu resultado de "${result.lottery}" ao pedir "${slug}" — descartado`,
          )
        }

        const isNew = await isNewContest(deps.prisma, lotteryRow.id, result.contestNumber)
        if (!isNew) {
          summary.unchanged.push(slug)
          continue
        }

        await persistContest(deps.prisma, lotteryRow.id, result)
        summary.newContests.push({ lotterySlug: slug, contestNumber: result.contestNumber })
        await deps.checkBetsQueue.add(CHECK_BETS_JOB_NAME, {
          lotterySlug: slug,
          contestNumber: result.contestNumber,
        })
        logger?.info('sync-results.new-contest', { lotterySlug: slug, contestNumber: result.contestNumber })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summary.errors.push({ lotterySlug: slug, error: message })
        logger?.error('sync-results.failed', { lotterySlug: slug, error: message })
      }
    }

    return summary
  }
}

async function isNewContest(
  prisma: SyncResultsPrisma,
  lotteryId: string,
  contestNumber: number,
): Promise<boolean> {
  const latest = await prisma.contest.findFirst({ where: { lotteryId }, orderBy: { number: 'desc' } })
  return latest === null || contestNumber > latest.number
}

/**
 * Upsert idempotente por `(lotteryId, number)` — mesmo que dois ticks concorrentes cheguem
 * aqui para o mesmo concurso novo, o resultado é um único registro com os mesmos dados
 * (resultado apurado é imutável, doc 06 nota A3).
 */
async function persistContest(
  prisma: SyncResultsPrisma,
  lotteryId: string,
  result: ContestResult,
): Promise<void> {
  const writeData: ContestWriteData = {
    lotteryId,
    number: result.contestNumber,
    drawDate: saoPauloDateToUtc(result.drawDate),
    numbers: result.numbers,
    numbersDrawOrder: result.numbersDrawOrder,
    secondaryNumbers: result.secondaryNumbers,
    extraResult: extraResultToJson(result.extraResult),
    isAccumulated: result.isAccumulated,
    collectedCents: result.collectedCents,
    accumulatedNextCents: result.accumulatedNextCents,
    estimatedNextCents: result.estimatedNextCents,
    // `raw` é sempre o retorno de `response.json()` na borda (packages/integrations) — JSON válido.
    rawPayload: result.raw as Prisma.InputJsonValue,
  }

  const contest = await prisma.contest.upsert({
    where: { lotteryId_number: { lotteryId, number: result.contestNumber } },
    create: writeData,
    update: writeData,
  })

  await Promise.all(
    result.prizes.map((prize) =>
      prisma.contestPrize.upsert({
        where: { contestId_tier: { contestId: contest.id, tier: prize.tier } },
        create: {
          contestId: contest.id,
          tier: prize.tier,
          label: prize.label,
          winnersCount: prize.winnersCount,
          prizeCents: prize.prizeCents,
        },
        update: { label: prize.label, winnersCount: prize.winnersCount, prizeCents: prize.prizeCents },
      }),
    ),
  )
}

function extraResultToJson(extra: ContestResult['extraResult']): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (extra === null) return Prisma.JsonNull
  if (extra.kind === 'CLOVER') return { clovers: extra.clovers }
  if (extra.kind === 'MONTH') return { month: extra.month }
  return { team: extra.teamName }
}

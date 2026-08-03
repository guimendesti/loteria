/**
 * LP-07 — carregamento de dados das páginas de resultados públicas.
 *
 * "Dados DIRETO do prisma" (escopo desta tarefa): os routers tRPC de `contests`
 * já existem (`apps/web/src/server/routers/contests.ts`) e cobrem um caso parecido,
 * mas para um Server Component ler o próprio banco via `@lotopro/db` é mais direto
 * e menos acoplado do que ir e voltar por HTTP — mesma decisão tomada em
 * `components/LiveResults.tsx` (home).
 *
 * `cache()` do React deduplica a consulta entre `generateMetadata` e o corpo da
 * página — ambos chamam `getResultsPageData` para o mesmo `modalidade` dentro da
 * mesma renderização.
 */
import { cache } from 'react'
import { prisma, type Prisma } from '@lotopro/db'
import { findLotteryConfig, type LotteryConfig, type LotterySlug } from '@lotopro/core'

const RECENT_TAKE = 10
/** Janela para a estatística "dezenas mais/menos sorteadas" (docs/08 §A.4). */
const STATS_WINDOW = 50
/** Só computamos a estatística para universos pequenos o bastante (PICK_N "normal") — exclui a
 * Federal (universo de 100.000 "bilhetes"), onde a noção de "dezena" não se aplica. */
const STATS_MAX_UNIVERSE = 200

const resultsContestSelect = {
  number: true,
  drawDate: true,
  numbers: true,
  secondaryNumbers: true,
  isAccumulated: true,
  isSpecial: true,
  collectedCents: true,
  accumulatedNextCents: true,
  estimatedNextCents: true,
  extraResult: true,
  prizes: {
    orderBy: { tier: 'asc' },
    select: { tier: true, label: true, winnersCount: true, prizeCents: true },
  },
} satisfies Prisma.ContestSelect

export type ResultsContestRow = Prisma.ContestGetPayload<{ select: typeof resultsContestSelect }>

export interface NumberFrequency {
  number: number
  count: number
}

export interface ResultsPageData {
  config: LotteryConfig
  lotteryName: string
  /** Mais recente primeiro. Vazio se a modalidade ainda não tem concurso sincronizado. */
  recent: ResultsContestRow[]
  /** Top 5 mais e menos sorteadas na janela de `STATS_WINDOW` concursos — vazio fora do PICK_N. */
  mostDrawn: NumberFrequency[]
  leastDrawn: NumberFrequency[]
}

/**
 * ⚠️ Tolerante a banco indisponível POR DESIGN — o `next build` roda dentro da
 * imagem Docker, sem banco. Retornando `null` a página é gerada com o estado
 * "sem resultados" e o ISR (`revalidate = 300`) a preenche em produção.
 */
export const getResultsPageData = cache(async function getResultsPageData(
  slugParam: string,
): Promise<ResultsPageData | null> {
  try {
    return await queryResultsPageData(slugParam)
  } catch {
    return null
  }
})

async function queryResultsPageData(slugParam: string): Promise<ResultsPageData | null> {
  const config = findLotteryConfig(slugParam)
  if (!config) return null

  const lottery = await prisma.lottery.findUnique({
    where: { slug: config.slug },
    select: { id: true, name: true },
  })
  if (!lottery) return null

  const recent = await prisma.contest.findMany({
    where: { lotteryId: lottery.id },
    orderBy: { number: 'desc' },
    take: RECENT_TAKE,
    select: resultsContestSelect,
  })

  const { mostDrawn, leastDrawn } = await computeFrequencyStats(lottery.id, config)

  return {
    config,
    lotteryName: lottery.name,
    recent,
    mostDrawn,
    leastDrawn,
  }
}

async function computeFrequencyStats(
  lotteryId: string,
  config: LotteryConfig,
): Promise<{ mostDrawn: NumberFrequency[]; leastDrawn: NumberFrequency[] }> {
  const universeSize = config.universeMax - config.universeMin + 1
  if (config.format !== 'PICK_N' || universeSize <= 0 || universeSize > STATS_MAX_UNIVERSE) {
    return { mostDrawn: [], leastDrawn: [] }
  }

  const statsRows = await prisma.contest.findMany({
    where: { lotteryId },
    orderBy: { number: 'desc' },
    take: STATS_WINDOW,
    select: { numbers: true },
  })
  if (statsRows.length === 0) return { mostDrawn: [], leastDrawn: [] }

  const freq = new Map<number, number>()
  for (let n = config.universeMin; n <= config.universeMax; n++) freq.set(n, 0)
  for (const row of statsRows) {
    for (const n of row.numbers) freq.set(n, (freq.get(n) ?? 0) + 1)
  }

  const entries: NumberFrequency[] = [...freq.entries()].map(([number, count]) => ({ number, count }))
  const mostDrawn = [...entries].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, 5)
  const leastDrawn = [...entries].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, 5)
  return { mostDrawn, leastDrawn }
}

export type { LotterySlug }

/**
 * LP-08 — carregamento de dados do conferidor público.
 *
 * Só o suficiente para o `check()` do core rodar CLIENT-SIDE contra o resultado
 * embutido (sem API, sem login — ver `PublicChecker.tsx`): dezenas, sorteio
 * secundário (Dupla Sena) e faixas de premiação dos últimos concursos. Nada de
 * `extraResult` aqui de propósito — o conferidor público não avalia campo extra
 * (trevos/mês/time), ver disclaimer em `PublicChecker.tsx`.
 */
import { cache } from 'react'
import { prisma, type Prisma } from '@lotopro/db'
import { findLotteryConfig, type LotteryConfig } from '@lotopro/core'

const CHECKER_TAKE = 10

const checkerContestSelect = {
  id: true,
  number: true,
  drawDate: true,
  numbers: true,
  numbersDrawOrder: true,
  secondaryNumbers: true,
  prizes: {
    orderBy: { tier: 'asc' },
    select: { tier: true, label: true, winnersCount: true, prizeCents: true },
  },
} satisfies Prisma.ContestSelect

export type CheckerContestRow = Prisma.ContestGetPayload<{ select: typeof checkerContestSelect }>

export interface CheckerPageData {
  config: LotteryConfig
  lotteryName: string
  /** Mais recente primeiro. */
  contests: CheckerContestRow[]
}

export const getCheckerPageData = cache(async function getCheckerPageData(
  slugParam: string,
): Promise<CheckerPageData | null> {
  const config = findLotteryConfig(slugParam)
  if (!config) return null

  const lottery = await prisma.lottery.findUnique({
    where: { slug: config.slug },
    select: { id: true, name: true },
  })
  if (!lottery) return null

  const contests = await prisma.contest.findMany({
    where: { lotteryId: lottery.id },
    orderBy: { number: 'desc' },
    take: CHECKER_TAKE,
    select: checkerContestSelect,
  })

  return { config, lotteryName: lottery.name, contests }
})

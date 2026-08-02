/** Fábricas de fixture compartilhadas pelos testes. Não é um arquivo de teste. */

import type {
  ContestPrizeData,
  ContestResult,
  LotterySlug,
  ValidationError,
  ValidationResult,
} from '../src/index'

export function makeResult(
  over: Partial<ContestResult> & Pick<ContestResult, 'lottery'>,
): ContestResult {
  return {
    contestNumber: 1,
    drawDate: '2026-08-01',
    numbers: [],
    numbersDrawOrder: [],
    secondaryNumbers: [],
    extraResult: null,
    isAccumulated: false,
    prizes: [],
    collectedCents: null,
    accumulatedNextCents: null,
    estimatedNextCents: null,
    nextContestNumber: null,
    raw: null,
    ...over,
  }
}

export function prize(
  tier: number,
  prizeCents: bigint,
  drawIndex: number | null = null,
): ContestPrizeData {
  return { tier, label: `faixa ${tier}`, winnersCount: 1, prizeCents, drawIndex }
}

/** Códigos de erro devolvidos, para asserção legível. */
export function codesOf(result: ValidationResult): Array<ValidationError['code']> {
  return result.ok ? [] : result.errors.map((error) => error.code)
}

/** Sequência 1..n (ou start..start+n-1). */
export function range(n: number, start = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i)
}

export const SLUGS: LotterySlug[] = [
  'megasena',
  'lotofacil',
  'quina',
  'lotomania',
  'duplasena',
  'timemania',
  'diadesorte',
  'supersete',
  'maismilionaria',
  'loteca',
  'federal',
]

/**
 * Helpers puros de custo/intervalo de concursos de uma aposta — extraídos do
 * router `bets` para serem testáveis sem Prisma/tRPC (ver
 * `src/server/routers/__tests__/bet-cost.test.ts`).
 *
 * Regra de negócio (docs/08 §C.2, CL-13/CL-14): uma aposta multi-concurso custa
 * `priceBet(config, bet) × nº de concursos cobertos`. `priceBet` já devolve
 * centavos inteiros em `bigint` (CLAUDE.md §5) — nunca introduzir `number` aqui.
 */
import { TRPCError } from '@trpc/server'
import { priceBet, type BetInput, type ExtraPicks, type LotteryConfig, type LotterySlug } from '@lotopro/core'

/** docs/08 §C.2 CL-13 — limite superior de concursos por jogo (aprovado no planejamento). */
export const MAX_CONTESTS_PER_BET = 24

/** Quantos concursos o intervalo [contestFrom, contestTo] cobre (inclusive nas duas pontas). */
export function contestCount(contestFrom: number, contestTo: number): number {
  return contestTo - contestFrom + 1
}

/**
 * Valida o intervalo de concursos de uma aposta. Lança `TRPCError('BAD_REQUEST')`
 * — chamar antes de qualquer cálculo de custo ou escrita no banco.
 */
export function assertValidContestRange(contestFrom: number, contestTo: number): void {
  if (contestTo < contestFrom) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'O concurso final deve ser maior ou igual ao concurso inicial.',
    })
  }
  if (contestCount(contestFrom, contestTo) > MAX_CONTESTS_PER_BET) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Um jogo vale para no máximo ${MAX_CONTESTS_PER_BET} concursos.`,
    })
  }
}

/**
 * Monta um `BetInput` (core) a partir de peças possivelmente `undefined` — o schema
 * `apps/web/tsconfig.json` liga `exactOptionalPropertyTypes`, então `{ extra: maybeUndefined }`
 * não compila contra `extra?: ExtraPicks` (a chave só pode ficar AUSENTE, nunca presente com
 * valor `undefined`). Centralizado aqui para não repetir o spread condicional em cada router.
 */
export function buildBetInput(
  lottery: LotterySlug,
  numbers: number[],
  extra: ExtraPicks | undefined,
  columns: number[][] | undefined,
): BetInput {
  return {
    lottery,
    numbers,
    ...(extra !== undefined ? { extra } : {}),
    ...(columns !== undefined ? { columns } : {}),
  }
}

/**
 * Custo total (centavos, bigint) de uma aposta válida no intervalo informado.
 *
 * @throws quando `bet` não tem faixa de preço aplicável — chamar `validateBet`
 *         antes (mesmo contrato de `priceBet`, ver packages/core/src/lottery/price.ts).
 */
export function calculateBetCostCents(
  config: LotteryConfig,
  bet: BetInput,
  contestFrom: number,
  contestTo: number,
): bigint {
  const unitCostCents = priceBet(config, bet)
  return unitCostCents * BigInt(contestCount(contestFrom, contestTo))
}

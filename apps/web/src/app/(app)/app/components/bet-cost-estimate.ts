import { resolvePrice, type BetInput, type LotteryConfig } from '@lotopro/core'

/**
 * docs/08 §C.2 CL-13 — limite superior de concursos por jogo. Espelha
 * `MAX_CONTESTS_PER_BET` de `apps/web/src/server/lib/bet-cost.ts` (arquivo
 * de servidor, fora do território desta tarefa) — o servidor SEMPRE
 * revalida; este valor é só para a UI (select de quantidade, mensagem).
 */
export const MAX_CONTESTS_PER_BET = 24

/**
 * Espelha `calculateBetCostCents` (server/lib/bet-cost.ts) para feedback em
 * tempo real no cliente: preço unitário × nº de concursos. Usa `resolvePrice`
 * (não lança) em vez de `priceBet` (lança), já que aqui a aposta costuma
 * estar incompleta enquanto o usuário ainda está escolhendo dezenas —
 * `null` é um estado normal de "ainda não dá para precificar", não um erro.
 * O servidor sempre recalcula na mutation `bets.create`; isto é só preview.
 */
export function estimateBetCostCents(
  config: LotteryConfig,
  bet: BetInput,
  contestFrom: number,
  contestTo: number,
): bigint | null {
  if (contestTo < contestFrom) return null
  const resolved = resolvePrice(config, bet)
  if (resolved === null) return null
  const contestCount = contestTo - contestFrom + 1
  return resolved.priceCents * BigInt(contestCount)
}

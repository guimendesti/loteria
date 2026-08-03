/**
 * Matemática de cotas de bolão — docs/07 §7.6.
 *
 * ⚠️ Zero custódia (CLAUDE.md §1): isto é só cálculo. O dinheiro da cota nunca passa
 * pelo LotoPro — o Pix é P2P participante → organizador.
 *
 * Regra (CLAUDE.md §5): a cota arredonda SEMPRE para cima. É melhor sobrar centavo
 * com o organizador (`surplusCents`, exibido na UI) do que faltar dinheiro para pagar
 * os jogos que ele já comprou.
 */

import type { ShareMath } from '../types'

/** Divisão inteira de bigints arredondada para cima. Espera `a > 0n` e `b > 0n`. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b
}

/**
 * Calcula o valor da cota de um bolão a partir do custo total dos jogos e do
 * número de cotas oferecidas.
 *
 * @throws em `totalShares` não inteiro ou ≤ 0, ou `totalCostCents` ≤ 0n.
 */
export function computeShareMath(totalCostCents: bigint, totalShares: number): ShareMath {
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error(`totalShares deve ser inteiro positivo; veio ${totalShares}.`)
  }
  if (totalCostCents <= 0n) {
    throw new Error(`totalCostCents deve ser positivo; veio ${totalCostCents}.`)
  }

  const totalSharesBig = BigInt(totalShares)
  const shareValueCents = ceilDiv(totalCostCents, totalSharesBig)
  const surplusCents = shareValueCents * totalSharesBig - totalCostCents

  return { totalCostCents, totalShares, shareValueCents, surplusCents }
}

/**
 * Diz se dá para vender `requested` cotas novas a um bolão que já tem `taken`
 * cotas vendidas de um total de `total`. Usado pelo router antes de gravar uma
 * entrada nova — a checagem final e definitiva ainda precisa ser feita dentro da
 * transação do banco (recheck), isto aqui é a regra pura.
 */
export function canAcceptShares(taken: number, requested: number, total: number): boolean {
  if (!Number.isInteger(taken) || !Number.isInteger(requested) || !Number.isInteger(total)) {
    return false
  }
  if (taken < 0 || requested <= 0 || total <= 0) {
    return false
  }
  return taken + requested <= total
}

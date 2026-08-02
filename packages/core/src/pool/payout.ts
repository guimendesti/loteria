/**
 * Rateio de prêmio de bolão — docs/07 §7.6 ("Regra de rateio (implementação obrigatória)").
 *
 * ⚠️ Zero custódia (CLAUDE.md §1): isto é **só um cálculo**. O LotoPro não recebe nem
 * repassa esse dinheiro; o Pix é P2P organizador → participante, fora do sistema.
 *
 * Regra:
 *   valor_do_membro = floor(prêmio_total × cotas_do_membro / cotas_totais)
 *   resto           = prêmio_total − Σ valores   → vai para o organizador, explícito na UI
 *
 * Invariante obrigatória: Σ(shares.amountCents) + remainderCents === totalCents.
 * Nunca arredondar por membro de forma independente — em bolão, centavo perdido vira briga.
 */

import type { PayoutResult, PayoutShare } from '../types'

export interface PayoutMember {
  memberId: string
  /** Cotas do membro. Inteiro ≥ 0. */
  shares: number
}

/**
 * Distribui `totalPrizeCents` entre os membros, proporcionalmente às cotas.
 *
 * `totalShares` é o total de cotas do bolão (`Pool.totalShares`), que pode ser MAIOR que
 * a soma das cotas dos membros quando restaram cotas não vendidas — nesse caso a parte
 * não vendida cai no resto, junto com os centavos de arredondamento.
 *
 * @throws em entrada inconsistente (prêmio negativo, `totalShares` ≤ 0, cotas não inteiras
 *         ou negativas, soma de cotas acima do total, `memberId` duplicado).
 */
export function computePayout(
  totalPrizeCents: bigint,
  members: readonly PayoutMember[],
  totalShares: number,
): PayoutResult {
  if (totalPrizeCents < 0n) {
    throw new Error('Prêmio total não pode ser negativo.')
  }
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error(`totalShares deve ser inteiro positivo; veio ${totalShares}.`)
  }

  const seen = new Set<string>()
  let assignedShares = 0
  for (const member of members) {
    if (seen.has(member.memberId)) {
      throw new Error(`memberId duplicado no rateio: ${member.memberId}.`)
    }
    seen.add(member.memberId)
    if (!Number.isInteger(member.shares) || member.shares < 0) {
      throw new Error(`Cotas de ${member.memberId} devem ser inteiro ≥ 0; veio ${member.shares}.`)
    }
    assignedShares += member.shares
  }
  if (assignedShares > totalShares) {
    throw new Error(
      `Soma das cotas (${assignedShares}) excede o total do bolão (${totalShares}).`,
    )
  }

  const totalSharesBig = BigInt(totalShares)
  const shares: PayoutShare[] = []
  let distributed = 0n

  for (const member of members) {
    // Divisão de BigInt já trunca em direção a zero; com operandos ≥ 0 é exatamente floor.
    const amountCents = (totalPrizeCents * BigInt(member.shares)) / totalSharesBig
    distributed += amountCents
    shares.push({ memberId: member.memberId, shares: member.shares, amountCents })
  }

  return {
    shares,
    remainderCents: totalPrizeCents - distributed,
    totalCents: totalPrizeCents,
  }
}

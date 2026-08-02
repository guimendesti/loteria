/**
 * Preço de uma aposta, sempre em **centavos inteiros (bigint)** — CLAUDE.md §5.
 * Nunca introduzir `number` no caminho do dinheiro.
 *
 * Modelo: toda aposta múltipla é um empacotamento de N apostas simples e custa
 * `preçoSimples × N`. O que muda por modalidade é só como se calcula N:
 *
 *   PICK_N              N = C(dezenas, picksMin)
 *   PICK_N + CLOVER     N = C(dezenas, 6) × C(trevos, 2) / C(2,2)      (+Milionária)
 *   COLUMNS/MATCH_LIST  N = Π (palpites da coluna i)                   (Super Sete, Loteca)
 *
 * A tabela `config.priceTiers` continua sendo a fonte de verdade: quando existe uma faixa
 * exata para a aposta (caso de todas as modalidades PICK_N, cuja grade é enumerada em
 * configs.ts), o preço vem direto dela. O cálculo combinatório é o caminho de derivação —
 * e o único caminho para COLUMNS/MATCH_LIST, onde o total de marcações não determina N.
 */

import type { BetInput, LotteryConfig, PriceTierData } from '../types'
import { combinations, productOf } from './combinatorics'
import { columnLayout } from './configs'

export interface PriceBreakdown {
  /** Faixa da tabela usada (exata, ou a faixa simples quando o preço é derivado). */
  tier: PriceTierData
  /** Quantas apostas simples a aposta contém. */
  multiplier: bigint
  /** Preço final em centavos. */
  priceCents: bigint
}

/**
 * Quantidade de apostas simples contidas na aposta.
 * Retorna 0n quando a aposta não é dimensionável (abaixo do mínimo, colunas ausentes…).
 */
export function betMultiplier(config: LotteryConfig, bet: BetInput): bigint {
  if (config.format === 'COLUMNS' || config.format === 'MATCH_LIST') {
    const { columnCount, maxPerColumn } = columnLayout(config)
    const columns = bet.columns
    if (columns === undefined || columns.length !== columnCount) return 0n
    for (const column of columns) {
      if (column.length < 1 || column.length > maxPerColumn) return 0n
    }
    return productOf(columns.map((column) => column.length))
  }

  let multiplier = combinations(bet.numbers.length, config.picksMin)
  const extraField = config.extraField
  if (extraField !== null && extraField.kind === 'CLOVER') {
    const extra = bet.extra
    if (extra === undefined || extra.kind !== 'CLOVER') return 0n
    // C(trevos, 2) / C(2,2) — o denominador normaliza a aposta simples para 1.
    multiplier =
      (multiplier * combinations(extra.clovers.length, extraField.picksMin)) /
      combinations(extraField.picksMin, extraField.picksMin)
  }
  return multiplier
}

/** Faixa da aposta simples da modalidade (menor volante possível). */
function simpleTier(config: LotteryConfig): PriceTierData | undefined {
  const extraField = config.extraField
  const extraPicks = extraField !== null && extraField.kind === 'CLOVER' ? extraField.picksMin : null
  return config.priceTiers.find(
    (tier) => tier.picks === config.picksMin && tier.extraPicks === extraPicks,
  )
}

/** Faixa exata para o tamanho apostado, quando a tabela a enumera. */
function exactTier(config: LotteryConfig, bet: BetInput): PriceTierData | undefined {
  const extraField = config.extraField
  const extra = bet.extra
  const extraPicks =
    extraField !== null && extraField.kind === 'CLOVER' && extra !== undefined && extra.kind === 'CLOVER'
      ? extra.clovers.length
      : null
  return config.priceTiers.find(
    (tier) => tier.picks === bet.numbers.length && tier.extraPicks === extraPicks,
  )
}

/**
 * Resolve preço + faixa + multiplicador. `null` quando não há faixa aplicável
 * (aposta fora da tabela, ou modalidade sem tabela de preços — ex.: Federal).
 */
export function resolvePrice(config: LotteryConfig, bet: BetInput): PriceBreakdown | null {
  const multiplier = betMultiplier(config, bet)
  if (multiplier <= 0n) return null

  if (config.format === 'PICK_N') {
    const exact = exactTier(config, bet)
    if (exact !== undefined) {
      return { tier: exact, multiplier, priceCents: exact.priceCents }
    }
  }

  const base = simpleTier(config)
  if (base === undefined) return null
  return { tier: base, multiplier, priceCents: base.priceCents * multiplier }
}

/**
 * Preço da aposta em centavos.
 *
 * @throws quando não existe faixa de preço aplicável. Chame `validateBet` antes:
 *         a mesma condição é reportada como `NO_PRICE_TIER`.
 */
export function priceBet(config: LotteryConfig, bet: BetInput): bigint {
  const resolved = resolvePrice(config, bet)
  if (resolved === null) {
    throw new Error(
      `Sem faixa de preço aplicável para ${config.slug} (verifique a aposta com validateBet antes de precificar).`,
    )
  }
  return resolved.priceCents
}

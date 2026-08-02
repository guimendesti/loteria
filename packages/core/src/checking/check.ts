/**
 * Conferência de aposta contra o resultado do concurso — docs/06 §6.7.
 *
 * Área de alto risco (CLAUDE.md): contar acertos é interseção de conjuntos, trivial.
 * O que erra é o mapeamento **acertos → faixa**, que muda por modalidade:
 *
 *  • Dupla Sena confere os DOIS sorteios (`numbers` e `secondaryNumbers`) e cada faixa
 *    tem `drawIndex`.
 *  • Lotomania premia TAMBÉM 0 acertos (faixa com `hits: 0`).
 *  • +Milionária cruza dezenas × trevos; "1 ou 0 trevo" são duas linhas com o mesmo `tier`.
 *  • Timemania (Time do Coração) e Dia de Sorte (Mês da Sorte) têm faixa **independente**
 *    das dezenas: podem ser ganhas junto com a faixa numérica, e somam.
 *  • Super Sete / Loteca acertam por COLUNA, não por dezena.
 *
 * Tudo isso sai de `config.prizeTiers` + `config.format` + `config.extraField.kind`.
 * Nenhum `if (slug === ...)`.
 *
 * Contrato de saída: um `DrawCheck` por sorteio do concurso (`drawsPerContest`).
 * Quando um sorteio premia mais de uma faixa (caso Timemania/Dia de Sorte), `prizeCents`
 * é a SOMA das faixas ganhas e `prizeTier` aponta a faixa de maior prêmio
 * (empate → menor número de faixa, que é a mais alta).
 */

import type {
  BetInput,
  CheckOutcome,
  ContestResult,
  DrawCheck,
  LotteryConfig,
  PrizeTierData,
} from '../types'
import { columnLayout } from '../lottery/configs'

// ─── Acertos de dezenas / colunas ────────────────────────────────────────────

interface HitInfo {
  hits: number
  hitNumbers: number[]
}

function pickNHits(bet: BetInput, drawNumbers: readonly number[]): HitInfo {
  const drawn = new Set(drawNumbers)
  const hitNumbers = [...new Set(bet.numbers)].filter((value) => drawn.has(value))
  hitNumbers.sort((a, b) => a - b)
  return { hits: hitNumbers.length, hitNumbers }
}

function columnHits(
  config: LotteryConfig,
  bet: BetInput,
  drawNumbers: readonly number[],
): HitInfo {
  const { columnCount } = columnLayout(config)
  const columns = bet.columns ?? []
  const hitNumbers: number[] = []
  for (let i = 0; i < columnCount; i++) {
    const column = columns[i]
    const drawn = drawNumbers[i]
    if (column === undefined || drawn === undefined) continue
    if (column.includes(drawn)) hitNumbers.push(drawn)
  }
  return { hits: hitNumbers.length, hitNumbers }
}

function countHits(
  config: LotteryConfig,
  bet: BetInput,
  drawNumbers: readonly number[],
): HitInfo {
  return config.format === 'PICK_N'
    ? pickNHits(bet, drawNumbers)
    : columnHits(config, bet, drawNumbers)
}

// ─── Campo extra ─────────────────────────────────────────────────────────────

/**
 * Compara identificador de time (aposta) com o nome publicado (resultado).
 * A aposta guarda um id/slug ("sao-paulo-sp") e a Caixa devolve o nome ("SÃO PAULO/SP"):
 * NFD separa o acento do caractere base e o filtro `[^a-z0-9]` descarta acento,
 * pontuação e espaço — "saopaulosp" nos dois lados.
 */
function sameTeam(teamId: string, teamName: string): boolean {
  const normalize = (value: string): string =>
    value
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  const a = normalize(teamId)
  const b = normalize(teamName)
  return a.length > 0 && a === b
}

/**
 * Acertos do campo extra. `null` quando a modalidade não tem campo extra, ou quando
 * aposta/resultado ainda não têm a informação (nesse caso nenhuma faixa de extra casa).
 */
function computeExtraHits(
  config: LotteryConfig,
  bet: BetInput,
  result: ContestResult,
): number | null {
  const field = config.extraField
  const extra = bet.extra
  const drawn = result.extraResult
  if (field === null || extra === undefined || drawn === null) return null
  if (extra.kind !== field.kind || drawn.kind !== field.kind) return null

  if (extra.kind === 'CLOVER' && drawn.kind === 'CLOVER') {
    const drawnSet = new Set(drawn.clovers)
    return [...new Set(extra.clovers)].filter((value) => drawnSet.has(value)).length
  }
  if (extra.kind === 'MONTH' && drawn.kind === 'MONTH') {
    return extra.month === drawn.month ? 1 : 0
  }
  if (extra.kind === 'TEAM' && drawn.kind === 'TEAM') {
    return sameTeam(extra.teamId, drawn.teamName) ? 1 : 0
  }
  return null
}

// ─── Faixas ──────────────────────────────────────────────────────────────────

function tierMatches(
  config: LotteryConfig,
  tier: PrizeTierData,
  hits: number,
  extraHits: number | null,
): boolean {
  if (tier.extraHits === null) return hits === tier.hits

  const field = config.extraField
  if (field === null) return false

  // +Milionária: faixa cruzada — exige dezenas E trevos exatos.
  if (field.kind === 'CLOVER') return hits === tier.hits && extraHits === tier.extraHits

  // Mês da Sorte / Time do Coração: prêmio próprio, independente das dezenas.
  return extraHits === tier.extraHits
}

/** Prêmio publicado para a faixa. Casa por (tier, drawIndex), com fallback para tier puro. */
function prizeForTier(result: ContestResult, tier: number, drawIndex: number): bigint {
  const exact = result.prizes.find((prize) => prize.tier === tier && prize.drawIndex === drawIndex)
  if (exact !== undefined) return exact.prizeCents
  const loose = result.prizes.find((prize) => prize.tier === tier && prize.drawIndex === null)
  return loose?.prizeCents ?? 0n
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

export function check(
  config: LotteryConfig,
  bet: BetInput,
  result: ContestResult,
): CheckOutcome {
  const drawCount = Math.max(1, config.drawsPerContest)
  const sources: ReadonlyArray<readonly number[]> = [result.numbers, result.secondaryNumbers]
  const extraHits = computeExtraHits(config, bet, result)

  const draws: DrawCheck[] = []
  let totalPrizeCents = 0n

  for (let i = 0; i < drawCount; i++) {
    const drawIndex = i + 1
    const drawNumbers = sources[i] ?? []
    const { hits, hitNumbers } = countHits(config, bet, drawNumbers)

    const matched = config.prizeTiers.filter(
      (tier) =>
        (tier.drawIndex === null || tier.drawIndex === drawIndex) &&
        tierMatches(config, tier, hits, extraHits),
    )

    // Faixas distintas ganhas neste sorteio. `tier` pode se repetir na config
    // (+Milionária "1 ou 0 trevo") — o rateio publicado é um só, então deduplicamos.
    const wonTiers = [...new Set(matched.map((tier) => tier.tier))]

    let prizeCents = 0n
    let bestTier: number | null = null
    let bestCents = -1n
    for (const tierNumber of wonTiers) {
      const cents = prizeForTier(result, tierNumber, drawIndex)
      prizeCents += cents
      if (cents > bestCents) {
        bestCents = cents
        bestTier = tierNumber
      }
    }

    draws.push({
      drawIndex,
      hits,
      hitNumbers,
      extraHits,
      prizeTier: bestTier,
      prizeCents,
    })
    totalPrizeCents += prizeCents
  }

  return { draws, totalPrizeCents }
}

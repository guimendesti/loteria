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
 * Quando um sorteio premia mais de uma faixa, `prizeCents` é a SOMA das faixas ganhas e
 * `prizeTier` aponta a faixa de maior prêmio unitário (empate → menor número de faixa,
 * que é a mais alta).
 *
 * ── v2: decomposição multi-faixa (`DrawCheck.tierCounts`) ────────────────────────────────
 *
 * Uma aposta MÚLTIPLA é, por definição, um empacotamento de N apostas SIMPLES (é assim que
 * ela é precificada — ver `lottery/price.ts`). Logo ela não ganha "uma" faixa: ela ganha
 * várias, em quantidades diferentes. Mega-Sena de 8 dezenas com 6 acertos contém
 * C(8,6) = 28 apostas simples, das quais 1 tem 6 acertos, 12 têm 5 e 15 têm 4 → 1 sena +
 * 12 quinas + 15 quadras. Reportar só "sena" subestima o prêmio em ordens de grandeza.
 *
 * `tierCounts` carrega essa decomposição; `prizeCents` passa a ser Σ count × valor unitário
 * da faixa no concurso. A matemática de cada formato está documentada em `decompose()`.
 *
 * Aposta simples é o caso degenerado da MESMA fórmula (ver `pickNDistribution`): sai uma
 * única entrada, com count 1, na faixa correspondente aos acertos — nenhum ramo especial.
 */

import type {
  BetInput,
  CheckOutcome,
  ContestResult,
  DrawCheck,
  LotteryConfig,
  PrizeTierData,
  TierCount,
} from '../types'
import { combinations } from '../lottery/combinatorics'
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

// ─── Decomposição combinatória (v2) ──────────────────────────────────────────

/**
 * Quantas apostas SIMPLES embutidas caem em cada nº de acertos.
 *
 * `byHits[j]` = nº de apostas simples embutidas com exatamente `j` acertos de dezena
 * (ou de coluna/jogo, nos formatos COLUMNS/MATCH_LIST).
 * `byExtraHits[s]` = idem no eixo do campo extra que se CRUZA com as dezenas (trevos da
 * +Milionária). `null` quando a modalidade não tem esse segundo eixo — ou quando o eixo
 * existe mas a aposta/resultado não trazem a informação (nenhuma faixa cruzada casa).
 * `total` = nº de apostas simples embutidas na aposta inteira (Σ byHits × Σ byExtraHits);
 * é o multiplicador de preço, e a contagem das faixas INDEPENDENTES das dezenas.
 */
interface Decomposition {
  byHits: bigint[]
  byExtraHits: bigint[] | null
  total: bigint
}

function sumOf(values: readonly bigint[]): bigint {
  let acc = 0n
  for (const value of values) acc += value
  return acc
}

/**
 * PICK_N — identidade de Vandermonde.
 *
 * A aposta marca `picked` dezenas, das quais `hits` saíram. Cada aposta simples embutida é
 * uma escolha de `k = picksMin` dezenas entre as `picked`. Para ter exatamente `j` acertos,
 * ela escolhe `j` das `hits` premiadas e `k − j` das `picked − hits` restantes:
 *
 *     byHits[j] = C(hits, j) × C(picked − hits, k − j)
 *
 * Ex.: Mega 8 dezenas, 6 acertos → C(6,6)C(2,0) = 1 sena, C(6,5)C(2,1) = 12 quinas,
 * C(6,4)C(2,2) = 15 quadras. Σ = 28 = C(8,6) ✓ (identidade de Vandermonde).
 *
 * Caso simples (`picked === k`): C(picked − hits, k − j) só é ≠ 0 quando k − j ≤ picked − hits,
 * isto é j ≥ hits; e C(hits, j) só é ≠ 0 quando j ≤ hits. Sobra exatamente j = hits, com
 * valor 1 — o mesmo comportamento da v1, sem nenhum ramo especial.
 */
function pickNDistribution(picked: number, hits: number, k: number): bigint[] {
  const byHits: bigint[] = []
  for (let j = 0; j <= k; j++) {
    byHits.push(combinations(hits, j) * combinations(picked - hits, k - j))
  }
  return byHits
}

/**
 * COLUMNS / MATCH_LIST — DP polinomial sobre as colunas (Super Sete: 7; Loteca: 14).
 *
 * Aqui não vale C(n,k): a aposta é um PRODUTO de escolhas independentes, uma por coluna.
 * Cada coluna `i` com `n_i` palpites contribui um fator polinomial em `x` (o expoente de `x`
 * conta acertos):
 *
 *   • coluna que CONTÉM o dígito/resultado sorteado → `1·x + (n_i − 1)`
 *     (1 dos n_i palpites é o certo; os outros n_i − 1 erram);
 *   • coluna que NÃO contém                          → `n_i`  (todos os palpites erram).
 *
 * O produto dos fatores é um polinômio cujo coeficiente de `x^j` é EXATAMENTE o número de
 * apostas simples embutidas com `j` acertos. Multiplicar fator a fator é uma DP O(colunas²)
 * — 14 jogos = 105 multiplicações de BigInt, sem enumerar as 3^14 combinações.
 *
 * Invariante: Σ coeficientes === Π n_i === multiplicador de preço da aposta (`price.ts`).
 */
function multiplyByLinearFactor(dist: readonly bigint[], hitWays: bigint, missWays: bigint): bigint[] {
  const next = new Array<bigint>(dist.length + 1).fill(0n)
  for (let j = 0; j < dist.length; j++) {
    const ways = dist[j] ?? 0n
    if (ways === 0n) continue
    next[j] = (next[j] ?? 0n) + ways * missWays
    next[j + 1] = (next[j + 1] ?? 0n) + ways * hitWays
  }
  return next
}

function columnDistribution(
  config: LotteryConfig,
  bet: BetInput,
  drawNumbers: readonly number[],
): bigint[] {
  const { columnCount } = columnLayout(config)
  const columns = bet.columns ?? []
  let dist: bigint[] = [1n] // polinômio constante 1 — nenhuma coluna processada ainda
  for (let i = 0; i < columnCount; i++) {
    // Palpites repetidos não multiplicam a aposta (nem inflam acertos) — deduplicamos.
    const picks = [...new Set(columns[i] ?? [])]
    if (picks.length === 0) return [] // aposta incompleta: sem decomposição possível
    const drawn = drawNumbers[i]
    const hit = drawn !== undefined && picks.includes(drawn)
    dist = multiplyByLinearFactor(dist, hit ? 1n : 0n, BigInt(hit ? picks.length - 1 : picks.length))
  }
  return dist
}

/**
 * +Milionária — o eixo dos trevos é INDEPENDENTE do eixo das dezenas, então a decomposição
 * é o PRODUTO das duas distribuições de Vandermonde:
 *
 *     count(j, s) = C(h, j)·C(p − h, 6 − j) × C(t, s)·C(q − t, 2 − s)
 *
 * com `p` dezenas marcadas (`h` acertadas) e `q` trevos marcados (`t` acertados).
 * A faixa cruzada (hits, extraHits) da config casa exatamente uma célula dessa grade.
 */
function cloverDistribution(bet: BetInput, extraHits: number, cloverPicksMin: number): bigint[] | null {
  const extra = bet.extra
  if (extra === undefined || extra.kind !== 'CLOVER') return null
  const picked = new Set(extra.clovers).size
  const byExtraHits: bigint[] = []
  for (let s = 0; s <= cloverPicksMin; s++) {
    byExtraHits.push(combinations(extraHits, s) * combinations(picked - extraHits, cloverPicksMin - s))
  }
  return byExtraHits
}

/**
 * Aposta abaixo do mínimo da modalidade (ou com coluna vazia) contém ZERO apostas simples —
 * todas as distribuições zeram e nenhuma faixa é ganha, nem as independentes das dezenas.
 * É consistente com `price.ts` (`betMultiplier` = 0n) e com `validateBet`, que já rejeita
 * essa aposta; aqui só garantimos que uma aposta impossível não produza prêmio.
 */
function decompose(
  config: LotteryConfig,
  bet: BetInput,
  hits: number,
  extraHits: number | null,
  drawNumbers: readonly number[],
): Decomposition {
  const byHits =
    config.format === 'PICK_N'
      ? pickNDistribution(new Set(bet.numbers).size, hits, config.picksMin)
      : columnDistribution(config, bet, drawNumbers)

  const field = config.extraField
  const byExtraHits =
    field !== null && field.kind === 'CLOVER' && extraHits !== null
      ? cloverDistribution(bet, extraHits, field.picksMin)
      : null

  const total = sumOf(byHits) * (byExtraHits === null ? 1n : sumOf(byExtraHits))
  return { byHits, byExtraHits, total }
}

// ─── Faixas ──────────────────────────────────────────────────────────────────

/**
 * Quantas apostas simples embutidas caem NESTA faixa. Zero = faixa não ganha.
 * Substitui o `tierMatches` booleano da v1: para aposta simples o resultado é 0 ou 1, então
 * o comportamento antigo é preservado — a decomposição só acrescenta informação.
 */
function tierCountFor(
  config: LotteryConfig,
  tier: PrizeTierData,
  decomposition: Decomposition,
  extraHits: number | null,
): bigint {
  // Faixa numérica pura: casa por nº de acertos exato.
  if (tier.extraHits === null) return decomposition.byHits[tier.hits] ?? 0n

  const field = config.extraField
  if (field === null) return 0n

  // +Milionária: faixa cruzada — produto das duas dimensões.
  if (field.kind === 'CLOVER') {
    const byExtraHits = decomposition.byExtraHits
    if (byExtraHits === null) return 0n
    return (decomposition.byHits[tier.hits] ?? 0n) * (byExtraHits[tier.extraHits] ?? 0n)
  }

  // Mês da Sorte / Time do Coração: prêmio próprio, independente das dezenas. TODAS as
  // apostas simples embutidas carregam o mesmo mês/time (e foram pagas uma a uma), então a
  // faixa é ganha `total` vezes — 1 na aposta simples, C(picks, picksMin) na múltipla.
  return extraHits === tier.extraHits ? decomposition.total : 0n
}

/** Prêmio unitário publicado para a faixa. Casa por (tier, drawIndex), com fallback para tier puro. */
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
    const decomposition = decompose(config, bet, hits, extraHits, drawNumbers)

    // Contagem por faixa. `tier` pode se repetir na config (+Milionária "1 ou 0 trevo":
    // duas linhas, mesmo tier, porque a Caixa publica um único rateio) — somamos as
    // contagens das linhas irmãs e aplicamos o valor unitário uma única vez.
    const countByTier = new Map<number, bigint>()
    for (const tier of config.prizeTiers) {
      if (tier.drawIndex !== null && tier.drawIndex !== drawIndex) continue
      const count = tierCountFor(config, tier, decomposition, extraHits)
      if (count <= 0n) continue
      countByTier.set(tier.tier, (countByTier.get(tier.tier) ?? 0n) + count)
    }

    const tierCounts: TierCount[] = []
    let prizeCents = 0n
    let bestTier: number | null = null
    let bestUnitCents = -1n
    // Ordem crescente de faixa (tier 1 = a mais alta) — determinística e estável na
    // persistência; o desempate de `prizeTier` fica com a faixa de menor número.
    for (const tierNumber of [...countByTier.keys()].sort((a, b) => a - b)) {
      const count = countByTier.get(tierNumber) ?? 0n
      const unitCents = prizeForTier(result, tierNumber, drawIndex)
      const cents = unitCents * count
      tierCounts.push({ tier: tierNumber, count: Number(count), prizeCents: cents })
      prizeCents += cents
      if (unitCents > bestUnitCents) {
        bestUnitCents = unitCents
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
      tierCounts,
    })
    totalPrizeCents += prizeCents
  }

  return { draws, totalPrizeCents }
}

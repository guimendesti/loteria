/**
 * Contrato de tipos do domínio LotoPro.
 * ⚠️ Este arquivo é o contrato compartilhado entre core, db, integrations e apps.
 * Mudanças aqui exigem revisão — ver docs/06-arquitetura-tecnica.md §6.5 e docs/07-modelo-de-dados.md.
 *
 * Regras invioláveis (CLAUDE.md):
 * - Dinheiro SEMPRE em centavos inteiros (bigint). Nunca float.
 * - Modalidade é dado (LotteryConfig), nunca `if (slug === ...)` no domínio.
 */

// ─── Identificadores de modalidade ───────────────────────────────────────────

export type LotterySlug =
  | 'megasena'
  | 'lotofacil'
  | 'quina'
  | 'lotomania'
  | 'duplasena'
  | 'timemania'
  | 'diadesorte'
  | 'supersete'
  | 'maismilionaria'
  | 'loteca'
  | 'federal'

export type LotteryFormat = 'PICK_N' | 'COLUMNS' | 'MATCH_LIST'

// ─── Configuração de modalidade (linha da tabela `lotteries`) ────────────────

export type ExtraFieldConfig =
  | { kind: 'CLOVER'; min: number; max: number; picksMin: number; picksMax: number } // +Milionária
  | { kind: 'MONTH' }                                                                 // Dia de Sorte (1–12)
  | { kind: 'TEAM' }                                                                  // Timemania

/**
 * v2 — horário POR DIA: desde jul/2026 sete modalidades sorteiam DOMINGO às 11h
 * (corte 22h de sábado = 780 min antes), enquanto os sorteios de semana são às
 * 20h/21h com corte de 60 min. Um `time` único não representa isso.
 */
export interface DrawScheduleEntry {
  /** Dia da semana: 0=domingo … 6=sábado */
  day: number
  /** Horário do sorteio, HH:mm, timezone America/Sao_Paulo */
  time: string
  /** Minutos ANTES do sorteio em que as apostas encerram */
  cutoffMinutes: number
}

export interface DrawSchedule {
  entries: DrawScheduleEntry[]
}

export interface PriceTierData {
  picks: number
  /** Trevos (+Milionária); null nas demais */
  extraPicks: number | null
  priceCents: bigint
}

export interface PrizeTierData {
  tier: number
  label: string
  hits: number
  extraHits: number | null
  /** Dupla Sena: 1 ou 2. Null = único sorteio */
  drawIndex: number | null
}

export interface LotteryConfig {
  slug: LotterySlug
  name: string
  format: LotteryFormat
  universeMin: number
  universeMax: number
  picksMin: number
  picksMax: number
  drawsPerContest: number
  extraField: ExtraFieldConfig | null
  drawSchedule: DrawSchedule
  priceTiers: PriceTierData[]
  prizeTiers: PrizeTierData[]
}

// ─── Aposta ──────────────────────────────────────────────────────────────────

export type ExtraPicks =
  | { kind: 'CLOVER'; clovers: number[] }
  | { kind: 'MONTH'; month: number }
  | { kind: 'TEAM'; teamId: string }

export interface BetInput {
  lottery: LotterySlug
  /** Dezenas escolhidas (PICK_N). Vazio para COLUMNS/MATCH_LIST */
  numbers: number[]
  extra?: ExtraPicks
  /** Super Sete: 7 colunas, 1–3 números (0–9) cada */
  columns?: number[][]
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] }

export interface ValidationError {
  code:
    | 'TOO_FEW_PICKS' | 'TOO_MANY_PICKS' | 'OUT_OF_UNIVERSE' | 'DUPLICATE_NUMBER'
    | 'EXTRA_REQUIRED' | 'EXTRA_INVALID' | 'COLUMNS_INVALID' | 'FORMAT_MISMATCH'
    | 'NO_PRICE_TIER'
  message: string
}

// ─── Resultado de concurso ───────────────────────────────────────────────────

export interface ContestResult {
  lottery: LotterySlug
  contestNumber: number
  /** ISO date (YYYY-MM-DD), timezone America/Sao_Paulo */
  drawDate: string
  numbers: number[]
  numbersDrawOrder: number[]
  /** Dupla Sena: dezenas do 2º sorteio */
  secondaryNumbers: number[]
  extraResult: ExtraResult | null
  isAccumulated: boolean
  prizes: ContestPrizeData[]
  collectedCents: bigint | null
  accumulatedNextCents: bigint | null
  estimatedNextCents: bigint | null
  nextContestNumber: number | null
  /** Payload bruto da fonte — auditoria/reprocessamento */
  raw: unknown
}

export type ExtraResult =
  | { kind: 'CLOVER'; clovers: number[] }
  | { kind: 'MONTH'; month: number }
  | { kind: 'TEAM'; teamName: string }

export interface ContestPrizeData {
  tier: number
  label: string
  winnersCount: number
  prizeCents: bigint
  /** Dupla Sena */
  drawIndex: number | null
}

// ─── Conferência ─────────────────────────────────────────────────────────────

export interface CheckOutcome {
  /** Um resultado por sorteio do concurso (Dupla Sena → 2 itens) */
  draws: DrawCheck[]
  /** Prêmio bruto total do concurso, em centavos */
  totalPrizeCents: bigint
}

/**
 * v2 — decomposição multi-faixa: uma aposta MÚLTIPLA premiada contém várias
 * apostas simples premiadas em faixas distintas (Mega de 8 dezenas com 6
 * acertos = 1 sena + 12 quinas + 15 quadras). `tierCounts` carrega essa
 * decomposição; `prizeTier`/`prizeCents` seguem existindo como agregado
 * (faixa principal e prêmio total do sorteio).
 */
export interface TierCount {
  tier: number
  /** Quantas apostas simples embutidas caíram nesta faixa */
  count: number
  /** Prêmio desta faixa: count × valor unitário da faixa no concurso */
  prizeCents: bigint
}

export interface DrawCheck {
  drawIndex: number          // 1-based
  hits: number
  hitNumbers: number[]
  extraHits: number | null
  /** Faixa principal (maior prêmio) ou null se não premiado */
  prizeTier: number | null
  /** Prêmio total do sorteio (soma de tierCounts) */
  prizeCents: bigint
  /** Decomposição por faixa — vazio quando não premiado */
  tierCounts: TierCount[]
}

// ─── Bolão ───────────────────────────────────────────────────────────────────

export interface PayoutShare {
  memberId: string
  shares: number
  amountCents: bigint
}

export interface PayoutResult {
  shares: PayoutShare[]
  /** Resto em centavos atribuído ao organizador (explicitado na UI) */
  remainderCents: bigint
  /** Invariante: soma(shares.amountCents) + remainderCents === prêmio total */
  totalCents: bigint
}

/**
 * Tipos locais para os dados de seed.
 *
 * ⚠️ `packages/db` não depende de `@lotopro/core` (não há workspace link configurado
 * nesta sessão — ver README.md deste pacote). Os tipos abaixo por isso são declarados
 * localmente, mas devem permanecer estruturalmente idênticos aos equivalentes em
 * `packages/core/src/types.ts` (`LotterySlug`, `LotteryFormat`, `ExtraFieldConfig`,
 * `DrawSchedule`, `PriceTierData`, `PrizeTierData`). Se o contrato do domínio mudar,
 * atualize aqui também.
 */

// Mesma união de packages/core/src/types.ts → LotterySlug
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

// Mesma união de packages/core/src/types.ts → LotteryFormat
export type LotteryFormatSlug = 'PICK_N' | 'COLUMNS' | 'MATCH_LIST'

// Mesma união de packages/core/src/types.ts → ExtraFieldConfig
export type ExtraFieldConfig =
  | { kind: 'CLOVER'; min: number; max: number; picksMin: number; picksMax: number } // +Milionária
  | { kind: 'MONTH' } // Dia de Sorte (1–12)
  | { kind: 'TEAM' } // Timemania

// Superset de packages/core/src/types.ts → DrawSchedule (inclui `tz`, conforme o
// exemplo de JSON em docs/07-modelo-de-dados.md §7.3, campo `Lottery.drawSchedule`).
export interface DrawScheduleConfig {
  /** Dias da semana com sorteio: 0=domingo … 6=sábado */
  days: number[]
  /** Horário do sorteio, HH:mm */
  time: string
  /** Minutos ANTES do sorteio em que as apostas encerram */
  cutoffMinutes: number
  tz: string
}

export interface LotterySeed {
  slug: LotterySlug
  name: string
  /** slug usado na API da Caixa */
  caixaApiSlug: string
  format: LotteryFormatSlug
  universeMin: number
  universeMax: number
  picksMin: number
  picksMax: number
  drawsPerContest: number
  extraField: ExtraFieldConfig | null
  drawSchedule: DrawScheduleConfig
  /** CSS custom property definida em docs/09-design-system-e-ux.md §9.2, ex.: "--lot-megasena" */
  colorToken: string
}

export interface PriceTierSeed {
  lotterySlug: LotterySlug
  /** nº de dezenas (ou, em COLUMNS, nº de números marcados por coluna) da aposta simples */
  picks: number
  /** nº de trevos (+Milionária) */
  extraPicks: number | null
  priceCents: bigint
}

export interface PrizeTierSeed {
  lotterySlug: LotterySlug
  /** 1 = faixa principal; único por modalidade (@@unique([lotteryId, tier])) */
  tier: number
  label: string
  hits: number
  extraHits: number | null
  /** Dupla Sena: 1º ou 2º sorteio */
  drawIndex: number | null
  isSpecialRule: boolean
}

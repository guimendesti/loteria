/**
 * Tipos locais para os dados de seed.
 *
 * `LotterySlug` e `ExtraFieldConfig` vêm de `@lotopro/core` (dependência de workspace
 * deste pacote — ver package.json), que é o contrato canônico do domínio LotoPro.
 * `LotteryFormatSlug` é um alias local de `LotteryFormat` (mesmo pacote) — nome mantido
 * por compatibilidade com o restante deste diretório e para não colidir com o enum
 * `LotteryFormat` gerado pelo Prisma e reexportado por `../index.ts`.
 *
 * Os tipos abaixo (`LotterySeed`, `PriceTierSeed`, `PrizeTierSeed`, `DrawScheduleConfig`)
 * são específicos do seed — linhas das tabelas `lotteries`/`price_tiers`/`prize_tiers` —
 * e não têm equivalente em `@lotopro/core`.
 */
import type { DrawSchedule, ExtraFieldConfig, LotteryFormat, LotterySlug } from '@lotopro/core'

export type { LotterySlug, ExtraFieldConfig }
export type LotteryFormatSlug = LotteryFormat

// Superset de `DrawSchedule` (@lotopro/core) — inclui `tz`, conforme o exemplo de JSON em
// docs/07-modelo-de-dados.md §7.3, campo `Lottery.drawSchedule`.
export interface DrawScheduleConfig extends DrawSchedule {
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
  /**
   * `picks` da aposta simples — igual ao `picksMin` da modalidade em `./lotteries.ts`.
   * Em COLUMNS/MATCH_LIST (Super Sete, Loteca) é o TOTAL (colunas × palpites mínimo por
   * coluna, ex.: Super Sete = 7 colunas × 1 = 7), na mesma convenção de
   * `packages/core/src/lottery/configs.ts` — não o nº de palpites por coluna isoladamente.
   */
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

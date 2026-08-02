/**
 * Preço da aposta simples (mínimo de dezenas/colunas) de cada modalidade, vigente a partir de
 * 2025-07-01 (docs/07-modelo-de-dados.md §7.11 — "Tabela de preços 2026").
 *
 * "Aposta simples" = `picks` igual ao `picksMin` da modalidade em `./lotteries.ts` (e, no caso da
 * +Milionária, `extraPicks` igual ao `picksMin` do campo extra CLOVER).
 *
 * ⚠️ Valores em centavos, baseados no último reajuste público da Caixa conhecido no momento da
 * escrita deste seed. Nenhum documento do projeto lista os preços oficiais por modalidade —
 * conferir contra a tabela vigente da Caixa antes de usar em produção e, ao reajustar, NUNCA
 * fazer UPDATE: fechar `validUntil` do registro atual e inserir um novo (M9, ver schema.prisma).
 */
import type { PriceTierSeed } from './types'

export const PRICE_TIERS_VALID_FROM = new Date('2025-07-01T00:00:00-03:00')

export const priceTiers: PriceTierSeed[] = [
  { lotterySlug: 'megasena', picks: 6, extraPicks: null, priceCents: 600n }, // R$ 6,00
  { lotterySlug: 'lotofacil', picks: 15, extraPicks: null, priceCents: 350n }, // R$ 3,50
  { lotterySlug: 'quina', picks: 5, extraPicks: null, priceCents: 250n }, // R$ 2,50
  { lotterySlug: 'lotomania', picks: 50, extraPicks: null, priceCents: 300n }, // R$ 3,00
  { lotterySlug: 'duplasena', picks: 6, extraPicks: null, priceCents: 300n }, // R$ 3,00
  { lotterySlug: 'timemania', picks: 10, extraPicks: null, priceCents: 350n }, // R$ 3,50
  { lotterySlug: 'diadesorte', picks: 7, extraPicks: null, priceCents: 250n }, // R$ 2,50
  { lotterySlug: 'supersete', picks: 1, extraPicks: null, priceCents: 300n }, // R$ 3,00 (1 número por coluna)
  { lotterySlug: 'maismilionaria', picks: 6, extraPicks: 2, priceCents: 650n }, // R$ 6,50 (6 dezenas + 2 trevos)
  { lotterySlug: 'loteca', picks: 14, extraPicks: null, priceCents: 350n }, // R$ 3,50
  { lotterySlug: 'federal', picks: 1, extraPicks: null, priceCents: 600n }, // R$ 6,00 (fração de bilhete)
]

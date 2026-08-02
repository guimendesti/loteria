/**
 * Faixas de premiação por modalidade (docs/07-modelo-de-dados.md §7.11).
 *
 * Escopo: as 9 "modalidades de dezenas" priorizadas para o MVP
 * (docs/12-riscos-e-decisoes-pendentes.md Q9). `loteca` e `federal` ficam de fora — são
 * estruturalmente diferentes (Loteca não tem "acertos" e sim placar de jogos; Federal premia por
 * bilhete, não por faixa de acertos) e foram deferidas para a Fase 2.
 *
 * `tier` é único por modalidade (`@@unique([lotteryId, tier])`), por isso a Dupla Sena — que tem
 * dois sorteios por concurso — usa tiers 1–4 para o 1º sorteio e 5–8 para o 2º, distinguidos por
 * `drawIndex`.
 *
 * `extraHits: null` significa "sem exigência de acerto no campo extra" (ex.: +Milionária com 6
 * dezenas mas sem os 2 trevos; Dia de Sorte com 7 dezenas mas sem o mês certo) — não confundir com
 * `extraHits: 0`, que seria "exige acertar exatamente zero".
 */
import type { PrizeTierSeed } from './types'

export const prizeTiers: PrizeTierSeed[] = [
  // ── Mega-Sena: Sena / Quina / Quadra ──────────────────────────────────────
  { lotterySlug: 'megasena', tier: 1, label: 'Sena', hits: 6, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'megasena', tier: 2, label: 'Quina', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'megasena', tier: 3, label: 'Quadra', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },

  // ── Lotofácil: 15..11 acertos ──────────────────────────────────────────────
  { lotterySlug: 'lotofacil', tier: 1, label: '15 acertos', hits: 15, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotofacil', tier: 2, label: '14 acertos', hits: 14, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotofacil', tier: 3, label: '13 acertos', hits: 13, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotofacil', tier: 4, label: '12 acertos', hits: 12, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotofacil', tier: 5, label: '11 acertos', hits: 11, extraHits: null, drawIndex: null, isSpecialRule: false },

  // ── Quina: 5..2 acertos (Quina / Quadra / Terno / Duque) ───────────────────
  { lotterySlug: 'quina', tier: 1, label: 'Quina', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'quina', tier: 2, label: 'Quadra', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'quina', tier: 3, label: 'Terno', hits: 3, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'quina', tier: 4, label: 'Duque', hits: 2, extraHits: null, drawIndex: null, isSpecialRule: false },

  // ── Lotomania: 20..15 acertos + faixa especial de 0 acertos ────────────────
  { lotterySlug: 'lotomania', tier: 1, label: '20 acertos', hits: 20, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 2, label: '19 acertos', hits: 19, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 3, label: '18 acertos', hits: 18, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 4, label: '17 acertos', hits: 17, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 5, label: '16 acertos', hits: 16, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 6, label: '15 acertos', hits: 15, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'lotomania', tier: 7, label: '0 acertos', hits: 0, extraHits: null, drawIndex: null, isSpecialRule: true },

  // ── Dupla Sena: 6..3 acertos, × 2 sorteios (drawIndex 1 e 2) ────────────────
  { lotterySlug: 'duplasena', tier: 1, label: 'Sena (1º sorteio)', hits: 6, extraHits: null, drawIndex: 1, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 2, label: 'Quina (1º sorteio)', hits: 5, extraHits: null, drawIndex: 1, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 3, label: 'Quadra (1º sorteio)', hits: 4, extraHits: null, drawIndex: 1, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 4, label: 'Terno (1º sorteio)', hits: 3, extraHits: null, drawIndex: 1, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 5, label: 'Sena (2º sorteio)', hits: 6, extraHits: null, drawIndex: 2, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 6, label: 'Quina (2º sorteio)', hits: 5, extraHits: null, drawIndex: 2, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 7, label: 'Quadra (2º sorteio)', hits: 4, extraHits: null, drawIndex: 2, isSpecialRule: false },
  { lotterySlug: 'duplasena', tier: 8, label: 'Terno (2º sorteio)', hits: 3, extraHits: null, drawIndex: 2, isSpecialRule: false },

  // ── Timemania: 7..3 acertos + faixa própria do Time do Coração ──────────────
  { lotterySlug: 'timemania', tier: 1, label: '7 acertos', hits: 7, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'timemania', tier: 2, label: '6 acertos', hits: 6, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'timemania', tier: 3, label: '5 acertos', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'timemania', tier: 4, label: '4 acertos', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'timemania', tier: 5, label: '3 acertos', hits: 3, extraHits: null, drawIndex: null, isSpecialRule: false },
  // Faixa independente das dezenas (extraHits: 1, hits: 0 — ver core `extraOnlyTier`/`check.ts`).
  { lotterySlug: 'timemania', tier: 6, label: 'Time do Coração', hits: 0, extraHits: 1, drawIndex: null, isSpecialRule: false },

  // ── Dia de Sorte: 7..4 acertos + faixa própria do Mês da Sorte ──────────────
  // (core modela "Mês da Sorte" como faixa independente das dezenas, não como cruzamento
  // "7 acertos + mês" — ver comentário `extraOnlyTier` em packages/core/src/lottery/configs.ts)
  { lotterySlug: 'diadesorte', tier: 1, label: '7 acertos', hits: 7, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'diadesorte', tier: 2, label: '6 acertos', hits: 6, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'diadesorte', tier: 3, label: '5 acertos', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'diadesorte', tier: 4, label: '4 acertos', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'diadesorte', tier: 5, label: 'Mês da Sorte', hits: 0, extraHits: 1, drawIndex: null, isSpecialRule: false },

  // ── Super Sete: 7..3 colunas acertadas ──────────────────────────────────────
  { lotterySlug: 'supersete', tier: 1, label: '7 colunas', hits: 7, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'supersete', tier: 2, label: '6 colunas', hits: 6, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'supersete', tier: 3, label: '5 colunas', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'supersete', tier: 4, label: '4 colunas', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'supersete', tier: 5, label: '3 colunas', hits: 3, extraHits: null, drawIndex: null, isSpecialRule: false },

  // ── +Milionária: tabela completa (dezenas × trevos) ─────────────────────────
  { lotterySlug: 'maismilionaria', tier: 1, label: '6 números + 2 trevos', hits: 6, extraHits: 2, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 2, label: '6 números', hits: 6, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 3, label: '5 números + 2 trevos', hits: 5, extraHits: 2, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 4, label: '5 números', hits: 5, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 5, label: '4 números + 2 trevos', hits: 4, extraHits: 2, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 6, label: '4 números', hits: 4, extraHits: null, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 7, label: '3 números + 2 trevos', hits: 3, extraHits: 2, drawIndex: null, isSpecialRule: false },
  { lotterySlug: 'maismilionaria', tier: 8, label: '2 números + 2 trevos', hits: 2, extraHits: 2, drawIndex: null, isSpecialRule: false },
]

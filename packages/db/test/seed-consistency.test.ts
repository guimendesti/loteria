/**
 * Consistência entre o seed de `@lotopro/db` e o contrato canônico de `@lotopro/core`.
 *
 * `packages/core/src/lottery/configs.ts` é a fonte da verdade (vem dos valores exatos de
 * docs/01-pesquisa-de-mercado.md §1.2). Este teste garante que `packages/db/src/seed-data`
 * não diverge dela em: slugs, preço da aposta simples, universo/picks e faixas de premiação.
 *
 * Duas exceções estruturais, DOCUMENTADAS e intencionais (não são bugs — mexer nelas quebraria
 * `@@unique([lotteryId, tier])` do schema Prisma), são normalizadas explicitamente abaixo:
 *
 *  - Dupla Sena: o core repete `tier` 1–4 nos dois sorteios, distinguindo só por `drawIndex`
 *    (ver comentário em `configs.ts`: "as 4 faixas se repetem nos dois sorteios — mesmo tier").
 *    O seed usa tiers 1–8 únicos (1–4 no 1º sorteio, 5–8 no 2º) porque a tabela `PrizeTier` tem
 *    `@@unique([lotteryId, tier])` — duas linhas com o mesmo tier para a mesma modalidade não
 *    caberiam no schema. Comparamos por (hits, extraHits, drawIndex), ignorando o valor bruto
 *    de `tier`.
 *  - +Milionária: o core grava "6 acertos + 1 ou 0 trevo" como DUAS linhas com o MESMO tier
 *    (extraHits 1 e extraHits 0), pelo mesmo motivo de `check.ts` (a Caixa publica um único
 *    rateio para a faixa). O seed, pela mesma restrição de unicidade de `tier`, colapsa o par
 *    em uma única linha com `extraHits: null` ("sem exigência no campo extra" — ver comentário
 *    em `seed-data/prize-tiers.ts`). Colapsamos o core da mesma forma antes de comparar.
 */
import { describe, expect, it } from 'vitest'
import { ALL_LOTTERIES, getLotteryConfig, type LotterySlug, type PrizeTierData } from '@lotopro/core'

import { lotteries } from '../src/seed-data/lotteries'
import { priceTiers } from '../src/seed-data/price-tiers'
import { prizeTiers } from '../src/seed-data/prize-tiers'

/** As "9 modalidades de dezenas" priorizadas para o MVP (docs/12 Q9) — únicas com prize-tiers no seed. */
const NINE_NUMERIC_SLUGS: readonly LotterySlug[] = [
  'megasena',
  'lotofacil',
  'quina',
  'lotomania',
  'duplasena',
  'timemania',
  'diadesorte',
  'supersete',
  'maismilionaria',
]

interface HitsExtraDraw {
  hits: number
  extraHits: number | null
  drawIndex: number | null
}

function byHitsExtraDraw(a: HitsExtraDraw, b: HitsExtraDraw): number {
  if (a.hits !== b.hits) return a.hits - b.hits
  const ae = a.extraHits ?? -1
  const be = b.extraHits ?? -1
  if (ae !== be) return ae - be
  const ad = a.drawIndex ?? -1
  const bd = b.drawIndex ?? -1
  return ad - bd
}

/** Reduz `entries` às 3 dimensões comparáveis entre seed e core, ordenadas deterministicamente. */
function normalizeHitsExtraDraw(entries: readonly HitsExtraDraw[]): HitsExtraDraw[] {
  return entries
    .map(({ hits, extraHits, drawIndex }) => ({ hits, extraHits, drawIndex }))
    .sort(byHitsExtraDraw)
}

interface TierTuple extends HitsExtraDraw {
  tier: number
}

function byTierTuple(a: TierTuple, b: TierTuple): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  return byHitsExtraDraw(a, b)
}

function normalizeTierTuples(entries: readonly TierTuple[]): TierTuple[] {
  return entries
    .map(({ tier, hits, extraHits, drawIndex }) => ({ tier, hits, extraHits, drawIndex }))
    .sort(byTierTuple)
}

/**
 * +Milionária: colapsa pares "mesmo tier, extraHits 1 e 0" (a dualidade "1 ou 0 trevo") em uma
 * única linha com `extraHits: null`, replicando a adaptação do seed sob `@@unique([lotteryId, tier])`.
 */
function collapseEitherOrZeroExtra(entries: readonly PrizeTierData[]): TierTuple[] {
  const byTier = new Map<number, PrizeTierData[]>()
  for (const entry of entries) {
    const group = byTier.get(entry.tier) ?? []
    group.push(entry)
    byTier.set(entry.tier, group)
  }

  const result: TierTuple[] = []
  for (const [tier, group] of byTier) {
    const extraHitsSet = new Set(group.map((g) => g.extraHits))
    const isEitherOrZeroPair = group.length === 2 && extraHitsSet.has(1) && extraHitsSet.has(0)
    if (isEitherOrZeroPair) {
      const [first] = group as [PrizeTierData, PrizeTierData]
      result.push({ tier, hits: first.hits, extraHits: null, drawIndex: first.drawIndex })
    } else {
      for (const entry of group) {
        result.push({ tier, hits: entry.hits, extraHits: entry.extraHits, drawIndex: entry.drawIndex })
      }
    }
  }
  return result
}

describe('seed-data vs @lotopro/core — consistência', () => {
  it('(a) mesmos 11 slugs de LotterySlug', () => {
    const coreSlugs = [...ALL_LOTTERIES.map((c) => c.slug)].sort()
    const seedSlugs = lotteries.map((l) => l.slug).sort()

    expect(coreSlugs).toHaveLength(11)
    expect(seedSlugs).toEqual(coreSlugs)
  })

  it('(c) universo e picks (min/max) de cada modalidade batem com a config do core', () => {
    for (const seedLottery of lotteries) {
      const core = getLotteryConfig(seedLottery.slug)
      expect(
        {
          slug: seedLottery.slug,
          universeMin: seedLottery.universeMin,
          universeMax: seedLottery.universeMax,
          picksMin: seedLottery.picksMin,
          picksMax: seedLottery.picksMax,
        },
        `modalidade "${seedLottery.slug}"`,
      ).toEqual({
        slug: core.slug,
        universeMin: core.universeMin,
        universeMax: core.universeMax,
        picksMin: core.picksMin,
        picksMax: core.picksMax,
      })
    }
  })

  it('(b) preço da aposta simples do seed é idêntico ao priceTier de picks mínimo do core', () => {
    for (const core of ALL_LOTTERIES) {
      const minExtraPicks = core.extraField?.kind === 'CLOVER' ? core.extraField.picksMin : null
      const coreSimpleTier = core.priceTiers.find(
        (t) => t.picks === core.picksMin && t.extraPicks === minExtraPicks,
      )
      const seedTiersForLottery = priceTiers.filter((t) => t.lotterySlug === core.slug)

      if (!coreSimpleTier) {
        // Core não define priceTiers para esta modalidade (ex.: federal — preço "Variável",
        // não apostável pelo motor). O seed não deve inventar um preço fixo para ela.
        expect(
          seedTiersForLottery,
          `core não define price-tier para "${core.slug}"; o seed não deveria ter nenhum`,
        ).toHaveLength(0)
        continue
      }

      const seedSimpleTier = seedTiersForLottery.find(
        (t) => t.picks === core.picksMin && t.extraPicks === minExtraPicks,
      )
      expect(seedSimpleTier, `seed sem price-tier de aposta simples para "${core.slug}"`).toBeDefined()
      expect(
        seedSimpleTier?.priceCents,
        `priceCents da aposta simples de "${core.slug}" diverge do core`,
      ).toBe(coreSimpleTier.priceCents)
    }
  })

  it('(d) faixas de premiação — mesmo conjunto (tier, hits, extraHits, drawIndex) para as 9 modalidades de dezenas', () => {
    for (const slug of NINE_NUMERIC_SLUGS) {
      const core = getLotteryConfig(slug)
      const seedTiersForLottery = prizeTiers.filter((t) => t.lotterySlug === slug)

      if (slug === 'duplasena') {
        // Exceção estrutural documentada no topo do arquivo: tier renumerado no seed por
        // causa de `@@unique([lotteryId, tier])`. Compara só (hits, extraHits, drawIndex).
        expect(normalizeHitsExtraDraw(seedTiersForLottery)).toEqual(
          normalizeHitsExtraDraw(core.prizeTiers),
        )
        continue
      }

      if (slug === 'maismilionaria') {
        // Exceção estrutural documentada no topo do arquivo: "1 ou 0 trevo" colapsado em
        // extraHits: null no seed, pelo mesmo motivo de unicidade de tier.
        expect(normalizeTierTuples(seedTiersForLottery)).toEqual(
          normalizeTierTuples(collapseEitherOrZeroExtra(core.prizeTiers)),
        )
        continue
      }

      expect(normalizeTierTuples(seedTiersForLottery)).toEqual(normalizeTierTuples(core.prizeTiers))
    }
  })

  /**
   * `drawSchedule` é Json no banco (sem coluna tipada), então nada além deste teste impede o
   * seed de divergir do core. Como o corte de apostas é "recurso de valor real" (doc 01 §1.2,
   * implicação 1), a agenda precisa ser a MESMA nos dois lados — inclusive depois da migração
   * de jul/2026 (sábado → domingo 11h, corte 780 min).
   */
  it('(e) agenda de sorteios (drawSchedule.entries) é idêntica à do core', () => {
    for (const seedLottery of lotteries) {
      const core = getLotteryConfig(seedLottery.slug)
      expect(seedLottery.drawSchedule.entries, `modalidade "${seedLottery.slug}"`).toEqual(
        core.drawSchedule.entries,
      )
      expect(seedLottery.drawSchedule.tz, `modalidade "${seedLottery.slug}"`).toBe('America/Sao_Paulo')
    }
  })

  it('(f) o sorteio de domingo é às 11h com corte às 22h de sábado (780 min)', () => {
    const sundayEntries = lotteries.flatMap((lottery) =>
      lottery.drawSchedule.entries
        .filter((entry) => entry.day === 0)
        .map((entry) => ({ slug: lottery.slug, ...entry })),
    )
    expect(sundayEntries.length, 'nenhuma modalidade com sorteio de domingo no seed').toBeGreaterThan(0)
    for (const entry of sundayEntries) {
      expect({ time: entry.time, cutoffMinutes: entry.cutoffMinutes }, entry.slug).toEqual({
        time: '11:00',
        cutoffMinutes: 780,
      })
    }
  })
})

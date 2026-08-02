import { describe, expect, it } from 'vitest'
import {
  ALL_LOTTERIES,
  LOTTERY_CONFIGS,
  columnLayout,
  findLotteryConfig,
  getLotteryConfig,
} from '../src/index'
import { SLUGS } from './helpers'

/** Preço da aposta simples, tabela 2026 (doc 01 §1.2), em centavos. */
const SIMPLE_PRICE_CENTS: Record<string, bigint> = {
  megasena: 600n,
  lotofacil: 350n,
  quina: 300n,
  lotomania: 300n,
  duplasena: 300n,
  timemania: 350n,
  diadesorte: 250n,
  supersete: 300n,
  maismilionaria: 600n,
  loteca: 400n,
}

describe('catálogo de modalidades', () => {
  it('tem as 11 modalidades e a chave bate com o slug', () => {
    expect(ALL_LOTTERIES).toHaveLength(11)
    for (const slug of SLUGS) {
      expect(getLotteryConfig(slug).slug).toBe(slug)
    }
  })

  it('findLotteryConfig é tolerante a slug desconhecido', () => {
    expect(findLotteryConfig('megasena')?.name).toBe('Mega-Sena')
    expect(findLotteryConfig('lotogato')).toBeUndefined()
    expect(findLotteryConfig('toString')).toBeUndefined()
  })

  it('cada config é internamente coerente', () => {
    for (const config of ALL_LOTTERIES) {
      expect(config.universeMin).toBeLessThanOrEqual(config.universeMax)
      expect(config.picksMin).toBeLessThanOrEqual(config.picksMax)
      expect(config.drawsPerContest).toBeGreaterThanOrEqual(1)
      expect(config.drawSchedule.days.length).toBeGreaterThan(0)
      for (const day of config.drawSchedule.days) {
        expect(day).toBeGreaterThanOrEqual(0)
        expect(day).toBeLessThanOrEqual(6)
      }
      expect(config.drawSchedule.time).toMatch(/^\d{2}:\d{2}$/)
      expect(config.drawSchedule.cutoffMinutes).toBeGreaterThan(0)
      for (const tier of config.priceTiers) {
        expect(typeof tier.priceCents).toBe('bigint')
        expect(tier.priceCents > 0n).toBe(true)
      }
    }
  })

  it('preço da aposta simples bate com a tabela 2026', () => {
    for (const [slug, expected] of Object.entries(SIMPLE_PRICE_CENTS)) {
      const config = findLotteryConfig(slug)
      expect(config, slug).toBeDefined()
      const simple = config?.priceTiers.find(
        (tier) =>
          tier.picks === config.picksMin &&
          (config.extraField?.kind === 'CLOVER'
            ? tier.extraPicks === config.extraField.picksMin
            : tier.extraPicks === null),
      )
      expect(simple?.priceCents, slug).toBe(expected)
    }
  })

  it('universo e limites vêm do doc 01 §1.2', () => {
    expect(getLotteryConfig('megasena')).toMatchObject({
      universeMin: 1,
      universeMax: 60,
      picksMin: 6,
      picksMax: 20,
    })
    expect(getLotteryConfig('lotofacil')).toMatchObject({
      universeMin: 1,
      universeMax: 25,
      picksMin: 15,
      picksMax: 20,
    })
    expect(getLotteryConfig('quina')).toMatchObject({ universeMax: 80, picksMin: 5, picksMax: 15 })
    expect(getLotteryConfig('lotomania')).toMatchObject({
      universeMin: 0,
      universeMax: 99,
      picksMin: 50,
      picksMax: 50,
    })
    expect(getLotteryConfig('duplasena')).toMatchObject({ universeMax: 50, picksMin: 6, picksMax: 15 })
    expect(getLotteryConfig('timemania')).toMatchObject({ picksMin: 10, picksMax: 10 })
    expect(getLotteryConfig('diadesorte')).toMatchObject({ universeMax: 31, picksMin: 7, picksMax: 15 })
    expect(getLotteryConfig('maismilionaria')).toMatchObject({ picksMin: 6, picksMax: 12 })
  })

  it('formato e nº de sorteios por concurso', () => {
    expect(getLotteryConfig('duplasena').drawsPerContest).toBe(2)
    expect(getLotteryConfig('supersete').format).toBe('COLUMNS')
    expect(getLotteryConfig('loteca').format).toBe('MATCH_LIST')
    for (const slug of SLUGS) {
      if (slug === 'duplasena') continue
      expect(getLotteryConfig(slug).drawsPerContest, slug).toBe(1)
    }
  })

  it('layout de colunas é derivado da config', () => {
    expect(columnLayout(getLotteryConfig('supersete'))).toEqual({ columnCount: 7, maxPerColumn: 3 })
    expect(columnLayout(getLotteryConfig('loteca'))).toEqual({ columnCount: 14, maxPerColumn: 3 })
  })

  it('campos extras polimórficos', () => {
    expect(getLotteryConfig('maismilionaria').extraField).toEqual({
      kind: 'CLOVER',
      min: 1,
      max: 6,
      picksMin: 2,
      picksMax: 6,
    })
    expect(getLotteryConfig('diadesorte').extraField).toEqual({ kind: 'MONTH' })
    expect(getLotteryConfig('timemania').extraField).toEqual({ kind: 'TEAM' })
    expect(getLotteryConfig('megasena').extraField).toBeNull()
  })

  it('Lotomania é a única que premia zero acertos', () => {
    for (const config of ALL_LOTTERIES) {
      const hasZero = config.prizeTiers.some(
        (tier) => tier.hits === 0 && tier.extraHits === null,
      )
      expect(hasZero, config.slug).toBe(config.slug === 'lotomania')
    }
    expect(getLotteryConfig('lotomania').prizeTiers.map((t) => t.hits)).toEqual([
      20, 19, 18, 17, 16, 15, 0,
    ])
  })

  it('Dupla Sena repete as 4 faixas nos dois sorteios', () => {
    const tiers = getLotteryConfig('duplasena').prizeTiers
    expect(tiers).toHaveLength(8)
    expect(tiers.filter((t) => t.drawIndex === 1).map((t) => t.hits)).toEqual([6, 5, 4, 3])
    expect(tiers.filter((t) => t.drawIndex === 2).map((t) => t.hits)).toEqual([6, 5, 4, 3])
  })

  it('+Milionária modela "1 ou 0 trevo" como duas linhas do mesmo tier', () => {
    const tiers = getLotteryConfig('maismilionaria').prizeTiers
    const tier2 = tiers.filter((t) => t.tier === 2)
    expect(tier2.map((t) => t.extraHits)).toEqual([1, 0])
    expect(tier2.every((t) => t.hits === 6)).toBe(true)
    expect(new Set(tiers.map((t) => t.tier)).size).toBe(8)
  })

  it('Timemania e Dia de Sorte têm faixa própria de campo extra', () => {
    const time = getLotteryConfig('timemania').prizeTiers.find((t) => t.extraHits !== null)
    expect(time).toMatchObject({ label: 'Time do Coração', hits: 0, extraHits: 1 })
    const mes = getLotteryConfig('diadesorte').prizeTiers.find((t) => t.extraHits !== null)
    expect(mes).toMatchObject({ label: 'Mês da Sorte', hits: 0, extraHits: 1 })
  })

  it('Federal fica sem tabela de preço/faixa (fase 2 — não é volante)', () => {
    const federal = LOTTERY_CONFIGS.federal
    expect(federal.priceTiers).toHaveLength(0)
    expect(federal.prizeTiers).toHaveLength(0)
  })
})

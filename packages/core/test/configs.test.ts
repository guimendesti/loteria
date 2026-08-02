import { describe, expect, it } from 'vitest'
import {
  ALL_LOTTERIES,
  LOTTERY_CONFIGS,
  columnLayout,
  findLotteryConfig,
  getLotteryConfig,
  type LotterySlug,
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
      expect(config.drawSchedule.entries.length, config.slug).toBeGreaterThan(0)
      const days = config.drawSchedule.entries.map((entry) => entry.day)
      expect(new Set(days).size, `${config.slug}: dia repetido na agenda`).toBe(days.length)
      for (const entry of config.drawSchedule.entries) {
        expect(entry.day).toBeGreaterThanOrEqual(0)
        expect(entry.day).toBeLessThanOrEqual(6)
        expect(entry.time).toMatch(/^\d{2}:\d{2}$/)
        expect(entry.cutoffMinutes).toBeGreaterThan(0)
      }
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

/**
 * Agenda v2 (`DrawSchedule.entries`): horário e corte POR DIA.
 * Regra de negócio: doc 01 §1.2, nota de rodapé — em jul/2026 os sorteios de SÁBADO
 * migraram para DOMINGO às 11h, com apostas encerrando às 22h de sábado.
 */
describe('agenda de sorteios (DrawSchedule v2 — horário por dia)', () => {
  const MINUTES_PER_DAY = 24 * 60
  const SUNDAY = 0
  const SATURDAY = 6

  /** Modalidades cujo sorteio sabatino virou domingo. Só a Mega é explícita no doc. */
  const MIGRATED_TO_SUNDAY: LotterySlug[] = [
    'megasena',
    'lotofacil',
    'quina',
    'duplasena',
    'timemania',
    'diadesorte',
    'maismilionaria',
    'loteca',
  ]

  it('domingo é às 11h e o corte cai às 22h de sábado (780 min antes)', () => {
    for (const slug of MIGRATED_TO_SUNDAY) {
      const sunday = getLotteryConfig(slug).drawSchedule.entries.find((e) => e.day === SUNDAY)
      expect(sunday, slug).toEqual({ day: SUNDAY, time: '11:00', cutoffMinutes: 780 })

      // O corte é contado a partir do horário do sorteio: 11:00 − 780 min = 22:00 do dia anterior.
      const drawMinutes = 11 * 60
      const cutoff = drawMinutes - (sunday?.cutoffMinutes ?? 0)
      expect(((cutoff % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY, slug).toBe(22 * 60)
      expect(cutoff, `${slug}: o corte cai no dia ANTERIOR ao sorteio`).toBeLessThan(0)
    }
  })

  it('nenhuma modalidade migrada mantém sorteio no sábado', () => {
    for (const slug of MIGRATED_TO_SUNDAY) {
      const days = getLotteryConfig(slug).drawSchedule.entries.map((e) => e.day)
      expect(days, slug).not.toContain(SATURDAY)
    }
  })

  it('Federal não migrou (bilhete numerado, não volante): quarta e sábado às 19h', () => {
    expect(getLotteryConfig('federal').drawSchedule.entries).toEqual([
      { day: 3, time: '19:00', cutoffMinutes: 60 },
      { day: SATURDAY, time: '19:00', cutoffMinutes: 60 },
    ])
  })

  it('sorteios de segunda a sexta: 20h com corte de 60 min (Super Sete às 15h, Federal 19h)', () => {
    for (const config of ALL_LOTTERIES) {
      if (config.slug === 'federal') continue
      const expectedTime = config.slug === 'supersete' ? '15:00' : '20:00'
      for (const entry of config.drawSchedule.entries) {
        if (entry.day === SUNDAY) continue
        expect(entry.time, `${config.slug} dia ${entry.day}`).toBe(expectedTime)
        expect(entry.cutoffMinutes, `${config.slug} dia ${entry.day}`).toBe(60)
      }
    }
  })

  it('grades sem sorteio sabatino ficam inalteradas (seg/qua/sex)', () => {
    expect(getLotteryConfig('lotomania').drawSchedule.entries.map((e) => e.day)).toEqual([1, 3, 5])
    expect(getLotteryConfig('supersete').drawSchedule.entries.map((e) => e.day)).toEqual([1, 3, 5])
  })

  it('Mega-Sena: ter, qui e dom (doc 01 §1.2 "Ter, Qui, Sáb/Dom*")', () => {
    expect(getLotteryConfig('megasena').drawSchedule.entries).toEqual([
      { day: 2, time: '20:00', cutoffMinutes: 60 },
      { day: 4, time: '20:00', cutoffMinutes: 60 },
      { day: SUNDAY, time: '11:00', cutoffMinutes: 780 },
    ])
  })

  it('Lotofácil e Quina sorteiam 6x por semana: seg–sex + dom', () => {
    for (const slug of ['lotofacil', 'quina'] as const) {
      expect(getLotteryConfig(slug).drawSchedule.entries.map((e) => e.day), slug).toEqual([
        1, 2, 3, 4, 5, SUNDAY,
      ])
    }
  })

  it('+Milionária e Loteca sorteiam só aos domingos', () => {
    for (const slug of ['maismilionaria', 'loteca'] as const) {
      expect(getLotteryConfig(slug).drawSchedule.entries, slug).toHaveLength(1)
      expect(getLotteryConfig(slug).drawSchedule.entries[0]?.day, slug).toBe(SUNDAY)
    }
  })
})

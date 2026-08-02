import { describe, expect, it } from 'vitest'
import type { DrawSchedule, LotteryConfig } from '@lotopro/core'
import { isWithinHotWindow, selectDueLotteries, COLD_WINDOW_MIN_INTERVAL_MS } from '../src/scheduler'

// Datas fixas com offset explícito -03:00 (America/Sao_Paulo não tem DST desde 2019) —
// confirmadas via Intl: ver comentário em cada caso.

const TUESDAY_EVENING = new Date('2026-08-04T21:00:00-03:00') // terça 21:00
const TUESDAY_AFTERNOON = new Date('2026-08-04T15:00:00-03:00') // terça 15:00
const SUNDAY_MORNING = new Date('2026-08-02T11:00:00-03:00') // domingo 11:00
const SUNDAY_EVENING = new Date('2026-08-02T21:00:00-03:00') // domingo 21:00
const SATURDAY_EVENING = new Date('2026-08-01T22:30:00-03:00') // sábado 22:30

function schedule(days: number[]): DrawSchedule {
  return { days, time: '20:00', cutoffMinutes: 60 }
}

describe('isWithinHotWindow (SY-01 janela dinâmica)', () => {
  it('quente: dia de sorteio dentro de 20:50–23:00', () => {
    expect(isWithinHotWindow(TUESDAY_EVENING, schedule([2]))).toBe(true) // terça é dia 2
  })

  it('fria: dia de sorteio mas fora do horário de sorteio', () => {
    expect(isWithinHotWindow(TUESDAY_AFTERNOON, schedule([2]))).toBe(false)
  })

  it('fria: horário de sorteio de outra modalidade em dia que não sorteia', () => {
    // terça 21:00, mas a modalidade só sorteia quarta (3)
    expect(isWithinHotWindow(TUESDAY_EVENING, schedule([3]))).toBe(false)
  })

  it('quente: domingo 10:40–13:00, mesmo se a modalidade não sorteia domingo', () => {
    expect(isWithinHotWindow(SUNDAY_MORNING, schedule([6]))).toBe(true) // ex.: Loteca (sábado)
  })

  it('fria: domingo à noite, fora das duas janelas', () => {
    expect(isWithinHotWindow(SUNDAY_EVENING, schedule([1, 2, 3, 4, 5, 6]))).toBe(false)
  })

  it('quente: sábado dentro da janela de sorteio', () => {
    expect(isWithinHotWindow(SATURDAY_EVENING, schedule([6]))).toBe(true)
  })

  it('bordas da janela (20:50 e 23:00) são inclusivas', () => {
    expect(isWithinHotWindow(new Date('2026-08-04T20:50:00-03:00'), schedule([2]))).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-04T23:00:00-03:00'), schedule([2]))).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-04T20:49:00-03:00'), schedule([2]))).toBe(false)
    expect(isWithinHotWindow(new Date('2026-08-04T23:01:00-03:00'), schedule([2]))).toBe(false)
  })
})

function makeConfig(slug: string, days: number[]): LotteryConfig {
  return {
    slug: slug as LotteryConfig['slug'],
    name: slug,
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 60,
    picksMin: 6,
    picksMax: 6,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: schedule(days),
    priceTiers: [],
    prizeTiers: [],
  }
}

describe('selectDueLotteries (gate janela quente/fria + lastRun)', () => {
  it('janela quente: sempre due, independente do lastRun', () => {
    const configs = [makeConfig('a', [2])] // terça
    const due = selectDueLotteries(TUESDAY_EVENING, configs, () => TUESDAY_EVENING)
    expect(due).toEqual(['a'])
  })

  it('janela fria + nunca rodou: due (primeira execução)', () => {
    const configs = [makeConfig('a', [3])] // quarta — terça à tarde é fria para "a"
    const due = selectDueLotteries(TUESDAY_AFTERNOON, configs, () => null)
    expect(due).toEqual(['a'])
  })

  it('janela fria + rodou há 10 min: NÃO due (ainda não passou 1h)', () => {
    const configs = [makeConfig('a', [3])]
    const tenMinAgo = new Date(TUESDAY_AFTERNOON.getTime() - 10 * 60 * 1000)
    const due = selectDueLotteries(TUESDAY_AFTERNOON, configs, () => tenMinAgo)
    expect(due).toEqual([])
  })

  it('janela fria + rodou há mais de 1h: due de novo', () => {
    const configs = [makeConfig('a', [3])]
    const overOneHourAgo = new Date(TUESDAY_AFTERNOON.getTime() - (COLD_WINDOW_MIN_INTERVAL_MS + 1000))
    const due = selectDueLotteries(TUESDAY_AFTERNOON, configs, () => overOneHourAgo)
    expect(due).toEqual(['a'])
  })

  it('mistura modalidades quentes e frias no mesmo tick', () => {
    const configs = [makeConfig('hot', [2]), makeConfig('cold', [3])]
    const fiveMinAgo = new Date(TUESDAY_EVENING.getTime() - 5 * 60 * 1000)
    const due = selectDueLotteries(TUESDAY_EVENING, configs, () => fiveMinAgo)
    expect(due).toEqual(['hot'])
  })
})

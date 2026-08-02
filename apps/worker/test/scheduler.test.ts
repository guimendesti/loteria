import { describe, expect, it } from 'vitest'
import { getLotteryConfig, type DrawSchedule, type LotteryConfig } from '@lotopro/core'
import {
  isWithinHotWindow,
  selectDueLotteries,
  COLD_WINDOW_MIN_INTERVAL_MS,
  HOT_WINDOW_AFTER_MINUTES,
  HOT_WINDOW_BEFORE_MINUTES,
} from '../src/scheduler'

// Datas fixas com offset explícito -03:00 (America/Sao_Paulo não tem DST desde 2019) —
// confirmadas via Intl: ver comentário em cada caso.

const TUESDAY_EVENING = new Date('2026-08-04T21:00:00-03:00') // terça 21:00
const TUESDAY_AFTERNOON = new Date('2026-08-04T15:00:00-03:00') // terça 15:00
const SUNDAY_MORNING = new Date('2026-08-02T11:00:00-03:00') // domingo 11:00
const SUNDAY_EVENING = new Date('2026-08-02T21:00:00-03:00') // domingo 21:00
const SATURDAY_EVENING = new Date('2026-08-01T22:30:00-03:00') // sábado 22:30

/** Agenda v2: `{day, time, cutoffMinutes}` por dia. Padrão = sorteio de semana às 20h. */
function schedule(days: number[], time = '20:00', cutoffMinutes = 60): DrawSchedule {
  return { entries: days.map((day) => ({ day, time, cutoffMinutes })) }
}

/** Agenda das modalidades migradas: domingo 11h, corte às 22h de sábado. */
const SUNDAY_11H: DrawSchedule = { entries: [{ day: 0, time: '11:00', cutoffMinutes: 780 }] }

describe('isWithinHotWindow (SY-01 janela dinâmica, derivada de drawSchedule.entries)', () => {
  it('a janela é [sorteio − 10 min, sorteio + 2h] — bordas inclusivas', () => {
    expect(HOT_WINDOW_BEFORE_MINUTES).toBe(10)
    expect(HOT_WINDOW_AFTER_MINUTES).toBe(120)

    const tuesday20h = schedule([2])
    expect(isWithinHotWindow(new Date('2026-08-04T19:50:00-03:00'), tuesday20h)).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-04T22:00:00-03:00'), tuesday20h)).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-04T19:49:00-03:00'), tuesday20h)).toBe(false)
    expect(isWithinHotWindow(new Date('2026-08-04T22:01:00-03:00'), tuesday20h)).toBe(false)
  })

  it('quente: dia de sorteio, logo após o horário do sorteio', () => {
    expect(isWithinHotWindow(TUESDAY_EVENING, schedule([2]))).toBe(true) // terça é dia 2
  })

  it('fria: dia de sorteio mas longe do horário de sorteio', () => {
    expect(isWithinHotWindow(TUESDAY_AFTERNOON, schedule([2]))).toBe(false)
  })

  it('fria: horário de sorteio de outra modalidade em dia que não sorteia', () => {
    // terça 21:00, mas a modalidade só sorteia quarta (3)
    expect(isWithinHotWindow(TUESDAY_EVENING, schedule([3]))).toBe(false)
  })

  it('o horário sai da entrada do dia: Super Sete (15h) é quente às 15h, não às 21h', () => {
    const supersete = schedule([1, 3, 5], '15:00')
    expect(isWithinHotWindow(new Date('2026-08-03T15:05:00-03:00'), supersete)).toBe(true) // segunda
    expect(isWithinHotWindow(new Date('2026-08-03T21:00:00-03:00'), supersete)).toBe(false)
  })

  it('domingo 11h: quente de 10:50 a 13:00, frio fora disso', () => {
    expect(isWithinHotWindow(new Date('2026-08-02T10:50:00-03:00'), SUNDAY_11H)).toBe(true)
    expect(isWithinHotWindow(SUNDAY_MORNING, SUNDAY_11H)).toBe(true) // domingo 11:00
    expect(isWithinHotWindow(new Date('2026-08-02T13:00:00-03:00'), SUNDAY_11H)).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-02T10:49:00-03:00'), SUNDAY_11H)).toBe(false)
    expect(isWithinHotWindow(new Date('2026-08-02T13:01:00-03:00'), SUNDAY_11H)).toBe(false)
  })

  it('a janela de domingo NÃO vale para quem não sorteia domingo (v1 aquecia todo mundo)', () => {
    expect(isWithinHotWindow(SUNDAY_MORNING, schedule([1, 3, 5]))).toBe(false)
  })

  it('fria: domingo à noite, depois da janela do sorteio das 11h', () => {
    expect(isWithinHotWindow(SUNDAY_EVENING, SUNDAY_11H)).toBe(false)
    expect(isWithinHotWindow(SUNDAY_EVENING, schedule([1, 2, 3, 4, 5]))).toBe(false)
  })

  it('sábado 22:30 é o CORTE de apostas do sorteio de domingo, não janela de apuração', () => {
    expect(isWithinHotWindow(SATURDAY_EVENING, SUNDAY_11H)).toBe(false)
  })

  it('cada entrada abre a sua janela: agenda mista seg–sex 20h + dom 11h', () => {
    const lotofacil: DrawSchedule = {
      entries: [
        ...schedule([1, 2, 3, 4, 5]).entries,
        { day: 0, time: '11:00', cutoffMinutes: 780 },
      ],
    }
    expect(isWithinHotWindow(new Date('2026-08-03T20:30:00-03:00'), lotofacil)).toBe(true) // seg 20:30
    expect(isWithinHotWindow(new Date('2026-08-02T11:30:00-03:00'), lotofacil)).toBe(true) // dom 11:30
    expect(isWithinHotWindow(new Date('2026-08-02T20:30:00-03:00'), lotofacil)).toBe(false) // dom 20:30
    expect(isWithinHotWindow(new Date('2026-08-01T20:30:00-03:00'), lotofacil)).toBe(false) // sáb 20:30
  })

  it('janela que atravessa a meia-noite e a virada da semana', () => {
    const lateSaturday: DrawSchedule = { entries: [{ day: 6, time: '23:30', cutoffMinutes: 60 }] }
    expect(isWithinHotWindow(new Date('2026-08-01T23:30:00-03:00'), lateSaturday)).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-02T01:30:00-03:00'), lateSaturday)).toBe(true) // domingo 01:30
    expect(isWithinHotWindow(new Date('2026-08-02T01:31:00-03:00'), lateSaturday)).toBe(false)

    const earlySunday: DrawSchedule = { entries: [{ day: 0, time: '00:05', cutoffMinutes: 60 }] }
    expect(isWithinHotWindow(new Date('2026-08-01T23:55:00-03:00'), earlySunday)).toBe(true) // sábado 23:55
    expect(isWithinHotWindow(new Date('2026-08-02T00:05:00-03:00'), earlySunday)).toBe(true)
    expect(isWithinHotWindow(new Date('2026-08-01T23:54:00-03:00'), earlySunday)).toBe(false)
  })

  it('horário inválido na agenda não derruba o gate (entrada simplesmente não aquece)', () => {
    const broken: DrawSchedule = { entries: [{ day: 2, time: '25:99', cutoffMinutes: 60 }] }
    expect(isWithinHotWindow(TUESDAY_EVENING, broken)).toBe(false)
  })

  it('configs reais: Mega-Sena aquece domingo 11h e terça 20h, nunca sábado', () => {
    const megasena = getLotteryConfig('megasena').drawSchedule
    expect(isWithinHotWindow(SUNDAY_MORNING, megasena)).toBe(true) // domingo 11:00
    expect(isWithinHotWindow(TUESDAY_EVENING, megasena)).toBe(true) // terça 21:00
    expect(isWithinHotWindow(SATURDAY_EVENING, megasena)).toBe(false) // sábado 22:30
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

  it('domingo 11:05 aquece só as modalidades com sorteio de domingo', () => {
    const sunday: LotteryConfig = { ...makeConfig('dom', []), drawSchedule: SUNDAY_11H }
    const weekday = makeConfig('semana', [1, 3, 5])
    const at = new Date('2026-08-02T11:05:00-03:00')
    const justRan = new Date(at.getTime() - 5 * 60 * 1000)
    expect(selectDueLotteries(at, [sunday, weekday], () => justRan)).toEqual(['dom'])
  })
})

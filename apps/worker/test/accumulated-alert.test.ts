import { describe, expect, it } from 'vitest'
import { getLotteryConfig } from '@lotopro/core'
import {
  createAccumulatedAlertJob,
  formatNextDrawLabel,
  type AccumulatedAlertPrisma,
  type AccumulatedAlertPrismaContestRow,
  type AccumulatedAlertPrismaPreferenceRow,
} from '../src/jobs/accumulated-alert'
import type { NotifyJobData } from '../src/queues'

function createFakeDb(contests: AccumulatedAlertPrismaContestRow[], preferences: AccumulatedAlertPrismaPreferenceRow[]) {
  const prisma: AccumulatedAlertPrisma = {
    contest: { findLatestPerLottery: async () => contests },
    notificationPreference: { findManyWithThreshold: async () => preferences },
  }
  return prisma
}

function fakeNotifyQueue() {
  const calls: NotifyJobData[] = []
  return { add: async (_name: string, data: NotifyJobData) => void calls.push(data), calls }
}

describe('formatNextDrawLabel (SY-10)', () => {
  const megasenaSchedule = getLotteryConfig('megasena').drawSchedule // ter/qui 20h, dom 11h

  it('acha o próximo sorteio no mesmo dia quando ainda não passou', () => {
    // terça 2026-08-04, 15:00 — antes do sorteio de terça às 20h
    const label = formatNextDrawLabel(new Date('2026-08-04T15:00:00-03:00'), megasenaSchedule)
    expect(label).toBe('terça-feira, 20h')
  })

  it('pula para o próximo dia da agenda quando o de hoje já passou', () => {
    // terça 2026-08-04, 21:00 — depois do sorteio de terça; o próximo é quinta 20h (mais perto que domingo 11h)
    const label = formatNextDrawLabel(new Date('2026-08-04T21:00:00-03:00'), megasenaSchedule)
    expect(label).toBe('quinta-feira, 20h')
  })

  it('formata hora cheia sem minutos ("20h") e com minutos quando houver ("11h30")', () => {
    const withMinutes = formatNextDrawLabel(new Date('2026-08-01T00:00:00-03:00'), {
      entries: [{ day: 0, time: '11:30', cutoffMinutes: 60 }],
    })
    expect(withMinutes).toBe('domingo, 11h30')
  })
})

describe('createAccumulatedAlertJob (SY-10)', () => {
  const CONTEST: AccumulatedAlertPrismaContestRow = {
    number: 3040,
    lotterySlug: 'megasena',
    estimatedNextCents: 12_000_000_000n, // R$ 120.000.000,00
    isAccumulated: true,
  }

  it('enfileira notify só para usuários cujo limiar é <= a estimativa', async () => {
    const preferences: AccumulatedAlertPrismaPreferenceRow[] = [
      { userId: 'u-baixo', accumulatedThresholdCents: 5_000_000_00n }, // R$ 5 mi — abaixo, entra
      { userId: 'u-exato', accumulatedThresholdCents: 12_000_000_000n }, // exatamente o valor — entra
      { userId: 'u-alto', accumulatedThresholdCents: 50_000_000_000n }, // R$ 500 mi — acima, não entra
    ]
    const prisma = createFakeDb([CONTEST], preferences)
    const notifyQueue = fakeNotifyQueue()
    const job = createAccumulatedAlertJob({ prisma, notifyQueue })

    const res = await job({ triggeredAt: new Date().toISOString() })

    expect(res).toEqual({ scannedContests: 1, scannedPreferences: 3, enqueued: 2 })
    expect(notifyQueue.calls).toHaveLength(2)
    expect(notifyQueue.calls.map((c) => c.userId).sort()).toEqual(['u-baixo', 'u-exato'])
    expect(notifyQueue.calls[0]).toMatchObject({
      type: 'contest.accumulated',
      payload: { lotterySlug: 'megasena', contestNumber: 3040, estimatedNextCents: '12000000000' },
    })
  })

  it('ignora concurso não acumulado ou sem estimativa', async () => {
    const preferences: AccumulatedAlertPrismaPreferenceRow[] = [{ userId: 'u1', accumulatedThresholdCents: 1n }]
    const notifyQueue = fakeNotifyQueue()

    const jobNotAccumulated = createAccumulatedAlertJob({
      prisma: createFakeDb([{ ...CONTEST, isAccumulated: false }], preferences),
      notifyQueue,
    })
    await jobNotAccumulated({ triggeredAt: new Date().toISOString() })
    expect(notifyQueue.calls).toHaveLength(0)

    const jobNoEstimate = createAccumulatedAlertJob({
      prisma: createFakeDb([{ ...CONTEST, estimatedNextCents: null }], preferences),
      notifyQueue,
    })
    await jobNoEstimate({ triggeredAt: new Date().toISOString() })
    expect(notifyQueue.calls).toHaveLength(0)
  })

  it('sem usuários com limiar configurado, não enfileira nada', async () => {
    const notifyQueue = fakeNotifyQueue()
    const job = createAccumulatedAlertJob({ prisma: createFakeDb([CONTEST], []), notifyQueue })

    const result = await job({ triggeredAt: new Date().toISOString() })

    expect(result).toEqual({ scannedContests: 1, scannedPreferences: 0, enqueued: 0 })
  })
})

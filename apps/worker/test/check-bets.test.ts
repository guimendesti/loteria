import { describe, expect, it } from 'vitest'
import { getLotteryConfig } from '@lotopro/core'
import {
  createCheckBetsJob,
  BATCH_SIZE,
  type BetCheckTierCountJson,
  type CheckBetsPrisma,
  type CheckBetsPrismaBet,
  type CheckBetsPrismaContest,
  type CheckBetsPrismaLottery,
} from '../src/jobs/check-bets'
import type { NotifyJobData } from '../src/queues'

// ─── Duplo em memória de Prisma — só os métodos que check-bets.ts realmente chama ────────

interface FakeBetRow extends CheckBetsPrismaBet {
  lotteryId: string
  isActive: boolean
  contestFrom: number
  contestTo: number
}

function betCheckKey(betId: string, contestId: string, drawIndex: number): string {
  return [betId, contestId, drawIndex].join(':')
}

function createFakeDb() {
  const lotteries = new Map<string, CheckBetsPrismaLottery>()
  const contests = new Map<string, CheckBetsPrismaContest>()
  const contestsByKey = new Map<string, string>()
  const bets: FakeBetRow[] = []
  const betChecks = new Map<
    string,
    {
      betId: string
      contestId: string
      drawIndex: number
      hits: number
      hitNumbers: number[]
      extraHits: number | null
      prizeTier: number | null
      prizeCents: bigint
      tierCounts: BetCheckTierCountJson[]
    }
  >()
  const settledContestIds = new Set<string>()

  const prisma: CheckBetsPrisma = {
    lottery: {
      findUnique: async ({ where }) => lotteries.get(where.slug) ?? null,
    },
    contest: {
      findUnique: async ({ where }) => {
        const key = `${where.lotteryId_number.lotteryId}:${where.lotteryId_number.number}`
        const id = contestsByKey.get(key)
        return id !== undefined ? (contests.get(id) ?? null) : null
      },
      update: async ({ where }) => {
        settledContestIds.add(where.id)
        return { id: where.id }
      },
    },
    bet: {
      findMany: async ({ where, take }) => {
        const filtered = bets.filter(
          (bet) =>
            bet.lotteryId === where.lotteryId &&
            bet.isActive === where.isActive &&
            bet.contestFrom <= where.contestFrom.lte &&
            bet.contestTo >= where.contestTo.gte &&
            (where.id === undefined || bet.id > where.id.gt),
        )
        filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        return filtered.slice(0, take)
      },
    },
    betCheck: {
      upsert: async ({ where, create, update }) => {
        const key = betCheckKey(
          where.betId_contestId_drawIndex.betId,
          where.betId_contestId_drawIndex.contestId,
          where.betId_contestId_drawIndex.drawIndex,
        )
        const existing = betChecks.get(key)
        betChecks.set(key, existing ? { ...existing, ...update } : { ...create })
        return {}
      },
    },
  }

  return { prisma, lotteries, contests, contestsByKey, bets, betChecks, settledContestIds }
}

function createFakeNotifyQueue() {
  const calls: NotifyJobData[] = []
  return { add: async (_name: string, data: NotifyJobData) => void calls.push(data), calls }
}

const LOTTERY_ID = 'lot-megasena'
const CONTEST_NUMBER = 2900
const CONTEST_ID = 'contest-2900'

function seedMegasenaContest(db: ReturnType<typeof createFakeDb>): void {
  db.lotteries.set('megasena', { id: LOTTERY_ID, slug: 'megasena' })
  const contestRow: CheckBetsPrismaContest = {
    id: CONTEST_ID,
    number: CONTEST_NUMBER,
    drawDate: new Date('2026-08-04T00:00:00-03:00'),
    numbers: [1, 2, 3, 4, 5, 6],
    numbersDrawOrder: [1, 2, 3, 4, 5, 6],
    secondaryNumbers: [],
    extraResult: null,
    isAccumulated: false,
    collectedCents: 100_000_00n,
    accumulatedNextCents: null,
    estimatedNextCents: null,
    rawPayload: {},
    prizes: [
      { tier: 1, label: 'Sena', winnersCount: 0, prizeCents: 1_000_000n },
      { tier: 2, label: 'Quina', winnersCount: 5, prizeCents: 5_000n },
      { tier: 3, label: 'Quadra', winnersCount: 100, prizeCents: 100n },
    ],
  }
  db.contests.set(CONTEST_ID, contestRow)
  db.contestsByKey.set(`${LOTTERY_ID}:${CONTEST_NUMBER}`, CONTEST_ID)
}

function betRow(id: string, userId: string, numbers: number[]): FakeBetRow {
  return {
    id,
    userId,
    numbers,
    extraPicks: null,
    columns: null,
    matchPicks: null,
    lotteryId: LOTTERY_ID,
    isActive: true,
    contestFrom: CONTEST_NUMBER,
    contestTo: CONTEST_NUMBER,
  }
}

describe('check-bets (SY-03) — conferência em lote', () => {
  it('confere acertos, grava BetCheck e agrega notify por usuário', async () => {
    const config = getLotteryConfig('megasena')
    expect(config.prizeTiers.length).toBeGreaterThan(0) // sanity — config real usada

    const db = createFakeDb()
    seedMegasenaContest(db)
    db.bets.push(
      betRow('bet-0001', 'u1', [1, 2, 3, 4, 5, 6]), // 6 acertos — Sena
      betRow('bet-0002', 'u2', [1, 2, 3, 4, 5, 10]), // 5 acertos — Quina
      betRow('bet-0003', 'u1', [10, 20, 30, 40, 50, 60]), // 0 acertos
    )

    const notifyQueue = createFakeNotifyQueue()
    const checkBets = createCheckBetsJob({ prisma: db.prisma, notifyQueue })
    const result = await checkBets({ lotterySlug: 'megasena', contestNumber: CONTEST_NUMBER })

    expect(result).toEqual({ processedBets: 3, prizedBets: 2, notifiedUsers: 2 })

    expect(db.betChecks.get('bet-0001:contest-2900:1')).toMatchObject({
      hits: 6,
      prizeTier: 1,
      prizeCents: 1_000_000n,
      // Aposta simples: uma entrada, count 1, bigint serializado como string.
      tierCounts: [{ tier: 1, count: 1, prizeCents: '1000000' }],
    })
    expect(db.betChecks.get('bet-0002:contest-2900:1')).toMatchObject({
      hits: 5,
      prizeTier: 2,
      prizeCents: 5_000n,
      tierCounts: [{ tier: 2, count: 1, prizeCents: '5000' }],
    })
    expect(db.betChecks.get('bet-0003:contest-2900:1')).toMatchObject({
      hits: 0,
      prizeTier: null,
      prizeCents: 0n,
      tierCounts: [],
    })

    expect(db.settledContestIds.has(CONTEST_ID)).toBe(true)

    expect(notifyQueue.calls).toHaveLength(2)
    const u1Notify = notifyQueue.calls.find((call) => call.userId === 'u1')
    const u2Notify = notifyQueue.calls.find((call) => call.userId === 'u2')
    expect(u1Notify).toMatchObject({ type: 'bet.prized', payload: { totalPrizeCents: '1000000', betCount: 2 } })
    expect(u2Notify).toMatchObject({ type: 'bet.prized', payload: { totalPrizeCents: '5000', betCount: 1 } })
  })

  it('processa mais de um lote (BATCH_SIZE = 500) via paginação por cursor', async () => {
    const db = createFakeDb()
    seedMegasenaContest(db)
    const total = BATCH_SIZE + 1
    for (let i = 0; i < total; i++) {
      // nenhuma dessas apostas acerta nada — o foco aqui é a paginação, não o cálculo de prêmio
      db.bets.push(betRow(`bet-${String(i).padStart(5, '0')}`, `user-${i}`, [10, 20, 30, 40, 50, 60]))
    }

    const notifyQueue = createFakeNotifyQueue()
    const checkBets = createCheckBetsJob({ prisma: db.prisma, notifyQueue })
    const result = await checkBets({ lotterySlug: 'megasena', contestNumber: CONTEST_NUMBER })

    expect(result.processedBets).toBe(total)
    expect(result.prizedBets).toBe(0)
    expect(db.betChecks.size).toBe(total)
  })

  it('idempotência: reprocessar o mesmo concurso atualiza, nunca duplica BetCheck', async () => {
    const db = createFakeDb()
    seedMegasenaContest(db)
    db.bets.push(
      betRow('bet-0001', 'u1', [1, 2, 3, 4, 5, 6]),
      betRow('bet-0002', 'u2', [1, 2, 3, 4, 5, 10]),
      betRow('bet-0003', 'u1', [10, 20, 30, 40, 50, 60]),
    )

    const notifyQueue = createFakeNotifyQueue()
    const checkBets = createCheckBetsJob({ prisma: db.prisma, notifyQueue })

    const first = await checkBets({ lotterySlug: 'megasena', contestNumber: CONTEST_NUMBER })
    const sizeAfterFirst = db.betChecks.size
    const snapshotAfterFirst = new Map(db.betChecks)

    const second = await checkBets({ lotterySlug: 'megasena', contestNumber: CONTEST_NUMBER })

    expect(first.processedBets).toBe(3)
    expect(second.processedBets).toBe(3)
    expect(db.betChecks.size).toBe(sizeAfterFirst) // nenhuma linha nova
    expect([...db.betChecks.keys()].sort()).toEqual([...snapshotAfterFirst.keys()].sort())
    // valores continuam corretos após a segunda passada (update, não duplicação)
    expect(db.betChecks.get('bet-0001:contest-2900:1')).toMatchObject({ hits: 6, prizeCents: 1_000_000n })
  })

  it('aposta múltipla: persiste a decomposição v2 e agrega o prêmio total no notify', async () => {
    const db = createFakeDb()
    seedMegasenaContest(db)
    // Volante de 8 dezenas com 6 acertos: C(8,6) = 28 apostas simples embutidas
    // → 1 sena + 12 quinas + 15 quadras (packages/core/src/checking/check.ts).
    db.bets.push(betRow('bet-0001', 'u1', [1, 2, 3, 4, 5, 6, 7, 8]))

    const notifyQueue = createFakeNotifyQueue()
    const checkBets = createCheckBetsJob({ prisma: db.prisma, notifyQueue })
    const result = await checkBets({ lotterySlug: 'megasena', contestNumber: CONTEST_NUMBER })

    expect(result).toEqual({ processedBets: 1, prizedBets: 1, notifiedUsers: 1 })

    const saved = db.betChecks.get('bet-0001:contest-2900:1')
    expect(saved?.tierCounts).toEqual([
      { tier: 1, count: 1, prizeCents: '1000000' }, // 1 × R$ 10.000,00
      { tier: 2, count: 12, prizeCents: '60000' }, // 12 × R$ 50,00
      { tier: 3, count: 15, prizeCents: '1500' }, // 15 × R$ 1,00
    ])
    // Agregado = Σ das faixas (invariante do contrato v2).
    expect(saved?.prizeCents).toBe(1_061_500n)
    expect(saved).toMatchObject({ hits: 6, prizeTier: 1 })

    // `tierCounts` é Json: precisa sobreviver a JSON.stringify (nada de bigint).
    expect(() => JSON.stringify(saved?.tierCounts)).not.toThrow()

    expect(notifyQueue.calls[0]).toMatchObject({
      userId: 'u1',
      type: 'bet.prized',
      payload: { totalPrizeCents: '1061500', betCount: 1, prizedBetCount: 1 },
    })
  })
})

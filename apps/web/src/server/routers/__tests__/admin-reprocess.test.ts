/**
 * BO-21 (docs/08 §D.4) — idempotência do reprocessamento de conferência.
 *
 * Mesmo espírito do teste de idempotência de `apps/worker/test/check-bets.test.ts`
 * ("reprocessar o mesmo concurso atualiza, nunca duplica"), mas aqui a estratégia de
 * `admin.bets.reprocessChecks` é DELETAR e recriar (não `upsert`) — a garantia de
 * idempotência a verificar é: reprocessar duas vezes seguidas produz o MESMO conjunto final
 * de `BetCheck` (mesma contagem, mesmos valores), sem duplicar nem divergir. Duplo de Prisma
 * em memória, sem subir Postgres — mesmo padrão do teste do worker.
 */
import { describe, expect, it } from 'vitest'
import { getLotteryConfig } from '@lotopro/core'
import {
  reprocessBetScope,
  reprocessContestScope,
  type AdminReprocessBetSummary,
  type AdminReprocessPrisma,
  type ContestRow,
} from '../admin/bets'

interface FakeContestRow extends ContestRow {
  lotteryId: string
}

interface FakeBetRow extends AdminReprocessBetSummary {
  isActive: boolean
}

interface FakeBetCheckRow {
  betId: string
  contestId: string
  drawIndex: number
  hits: number
  hitNumbers: number[]
  extraHits: number | null
  prizeTier: number | null
  prizeCents: bigint
  tierCounts: unknown
}

function betCheckKey(betId: string, contestId: string, drawIndex: number): string {
  return [betId, contestId, drawIndex].join(':')
}

function createFakeDb() {
  const contests = new Map<string, FakeContestRow>()
  const bets: FakeBetRow[] = []
  const betChecks = new Map<string, FakeBetCheckRow>()

  const prisma: AdminReprocessPrisma = {
    contest: {
      findMany: async ({ where }) =>
        [...contests.values()].filter(
          (contest) =>
            contest.lotteryId === where.lotteryId &&
            contest.number >= where.number.gte &&
            contest.number <= where.number.lte,
        ),
    },
    bet: {
      // Sem filtro de `isActive` de propósito — mesmo critério do `betCheck.deleteMany`
      // abaixo (por `contestId`, também sem olhar a aposta dona). Ver docblock de
      // `reprocessContestScope` em `admin/bets.ts`: apostas arquivadas PRECISAM ser
      // reprocessadas aqui, senão o `deleteMany` some com o `BetCheck` delas para sempre.
      findMany: async ({ where, take }) => {
        const filtered = bets.filter(
          (bet) =>
            bet.lotteryId === where.lotteryId &&
            bet.contestFrom <= where.contestFrom.lte &&
            bet.contestTo >= where.contestTo.gte &&
            (where.id === undefined || bet.id > where.id.gt),
        )
        filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        return filtered.slice(0, take)
      },
    },
    betCheck: {
      deleteMany: async ({ where }) => {
        let count = 0
        for (const [key, row] of betChecks) {
          const matches = 'contestId' in where ? row.contestId === where.contestId : row.betId === where.betId
          if (matches) {
            betChecks.delete(key)
            count += 1
          }
        }
        return { count }
      },
      create: async ({ data }) => {
        const key = betCheckKey(data.betId, data.contestId, data.drawIndex)
        betChecks.set(key, { ...data })
        return {}
      },
    },
  }

  return { prisma, contests, bets, betChecks }
}

const LOTTERY_ID = 'lot-megasena'

function seedContest(
  db: ReturnType<typeof createFakeDb>,
  id: string,
  number: number,
  numbers: number[],
): FakeContestRow {
  const row: FakeContestRow = {
    id,
    lotteryId: LOTTERY_ID,
    number,
    drawDate: new Date('2026-08-04T00:00:00-03:00'),
    numbers,
    numbersDrawOrder: numbers,
    secondaryNumbers: [],
    extraResult: null,
    isAccumulated: false,
    collectedCents: null,
    accumulatedNextCents: null,
    estimatedNextCents: null,
    rawPayload: {},
    prizes: [
      { tier: 1, label: 'Sena', winnersCount: 0, prizeCents: 1_000_000n },
      { tier: 2, label: 'Quina', winnersCount: 5, prizeCents: 5_000n },
      { tier: 3, label: 'Quadra', winnersCount: 100, prizeCents: 100n },
    ],
  }
  db.contests.set(id, row)
  return row
}

function betRow(
  id: string,
  numbers: number[],
  overrides: Partial<Pick<FakeBetRow, 'isActive' | 'contestFrom' | 'contestTo'>> = {},
): FakeBetRow {
  return {
    id,
    lotteryId: LOTTERY_ID,
    numbers,
    extraPicks: null,
    columns: null,
    matchPicks: null,
    isActive: true,
    contestFrom: 2900,
    contestTo: 2900,
    ...overrides,
  }
}

describe('admin.bets.reprocessChecks (BO-21) — idempotência', () => {
  it('reprocessContestScope: reprocessar o mesmo concurso duas vezes produz o mesmo estado final', async () => {
    const config = getLotteryConfig('megasena')
    const db = createFakeDb()
    const contest = seedContest(db, 'contest-2900', 2900, [1, 2, 3, 4, 5, 6])
    db.bets.push(
      betRow('bet-0001', [1, 2, 3, 4, 5, 6]), // 6 acertos — Sena
      betRow('bet-0002', [1, 2, 3, 4, 5, 10]), // 5 acertos — Quina
      betRow('bet-0003', [10, 20, 30, 40, 50, 60]), // 0 acertos
    )

    const first = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)
    expect(first).toEqual({ deletedChecks: 0, recreatedChecks: 3, processedBets: 3, prizedBets: 2 })
    const snapshotAfterFirst = new Map(db.betChecks)

    const second = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)
    // Desta vez apaga os 3 que a primeira rodada criou, antes de recriar.
    expect(second).toEqual({ deletedChecks: 3, recreatedChecks: 3, processedBets: 3, prizedBets: 2 })

    expect(db.betChecks.size).toBe(snapshotAfterFirst.size)
    expect([...db.betChecks.entries()]).toEqual([...snapshotAfterFirst.entries()])
    expect(db.betChecks.get('bet-0001:contest-2900:1')).toMatchObject({ hits: 6, prizeTier: 1, prizeCents: 1_000_000n })
    expect(db.betChecks.get('bet-0002:contest-2900:1')).toMatchObject({ hits: 5, prizeTier: 2, prizeCents: 5_000n })
    expect(db.betChecks.get('bet-0003:contest-2900:1')).toMatchObject({ hits: 0, prizeTier: null, prizeCents: 0n })
  })

  it('reprocessContestScope: apaga BetCheck verdadeiramente órfão (bet_id sem linha em `bet`) e não o recria', async () => {
    const config = getLotteryConfig('megasena')
    const db = createFakeDb()
    const contest = seedContest(db, 'contest-2900', 2900, [1, 2, 3, 4, 5, 6])
    db.bets.push(betRow('bet-0001', [1, 2, 3, 4, 5, 6]))
    // `bet-9999` NÃO existe em `db.bets` — dado inconsistente (ex.: aposta removida por
    // fora da aplicação). Único caso legítimo de "sumiço": não há como recriar o que não
    // existe mais. Isto é DIFERENTE de uma aposta arquivada (isActive:false), que CONTINUA
    // existindo e cujo BetCheck deve ser recriado — ver os dois testes de simetria abaixo.
    db.betChecks.set('bet-9999:contest-2900:1', {
      betId: 'bet-9999',
      contestId: 'contest-2900',
      drawIndex: 1,
      hits: 3,
      hitNumbers: [1, 2, 3],
      extraHits: null,
      prizeTier: null,
      prizeCents: 0n,
      tierCounts: [],
    })

    const summary = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)

    expect(summary.deletedChecks).toBe(1) // só o órfão existia antes desta rodada
    expect(db.betChecks.has('bet-9999:contest-2900:1')).toBe(false)
    expect(db.betChecks.has('bet-0001:contest-2900:1')).toBe(true)
  })

  /**
   * ★ Regressão de segurança (achado de auditoria, severidade média): a versão anterior
   * apagava o `BetCheck` de TODA aposta que cobria o concurso (delete por `contestId`, sem
   * olhar `isActive`), mas só RECRIAVA para apostas ativas (`isActive: true` no `findMany`).
   * Resultado: reprocessar um concurso fazia a conferência de qualquer aposta arquivada
   * simplesmente desaparecer. Este teste prova que hoje o critério é o MESMO dos dois lados
   * — nenhuma aposta (ativa ou arquivada) perde `BetCheck` ao reprocessar.
   */
  it('reprocessContestScope: apostas ARQUIVADAS (isActive:false) são reconferidas, não perdem BetCheck (simetria delete/recria)', async () => {
    const config = getLotteryConfig('megasena')
    const db = createFakeDb()
    const contest = seedContest(db, 'contest-2900', 2900, [1, 2, 3, 4, 5, 6])
    db.bets.push(
      betRow('bet-ativa', [1, 2, 3, 4, 5, 6], { isActive: true }), // 6 acertos — Sena
      betRow('bet-arquivada', [1, 2, 3, 4, 5, 10], { isActive: false }), // 5 acertos — Quina
    )
    // Sujeira de uma rodada anterior — a aposta arquivada já tinha sido conferida antes de
    // ser arquivada pelo usuário.
    db.betChecks.set('bet-arquivada:contest-2900:1', {
      betId: 'bet-arquivada',
      contestId: 'contest-2900',
      drawIndex: 1,
      hits: 5,
      hitNumbers: [1, 2, 3, 4, 5],
      extraHits: null,
      prizeTier: 2,
      prizeCents: 5_000n,
      tierCounts: [],
    })

    const summary = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)

    // As DUAS apostas foram reprocessadas — nenhuma ficou de fora por causa de `isActive`.
    expect(summary.processedBets).toBe(2)
    expect(db.betChecks.has('bet-ativa:contest-2900:1')).toBe(true)
    expect(db.betChecks.has('bet-arquivada:contest-2900:1')).toBe(true)
    expect(db.betChecks.get('bet-arquivada:contest-2900:1')).toMatchObject({ hits: 5, prizeTier: 2, prizeCents: 5_000n })
  })

  it('reprocessContestScope: reprocessar duas vezes com apostas ativas E arquivadas produz o mesmo estado final (idempotência simétrica)', async () => {
    const config = getLotteryConfig('megasena')
    const db = createFakeDb()
    const contest = seedContest(db, 'contest-2900', 2900, [1, 2, 3, 4, 5, 6])
    db.bets.push(
      betRow('bet-ativa', [1, 2, 3, 4, 5, 6], { isActive: true }),
      betRow('bet-arquivada', [10, 20, 30, 40, 50, 60], { isActive: false }),
    )

    const first = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)
    expect(first).toEqual({ deletedChecks: 0, recreatedChecks: 2, processedBets: 2, prizedBets: 1 })
    const snapshotAfterFirst = new Map(db.betChecks)

    const second = await reprocessContestScope(db.prisma, LOTTERY_ID, contest, config)
    expect(second).toEqual({ deletedChecks: 2, recreatedChecks: 2, processedBets: 2, prizedBets: 1 })

    expect([...db.betChecks.entries()]).toEqual([...snapshotAfterFirst.entries()])
    expect(db.betChecks.has('bet-arquivada:contest-2900:1')).toBe(true)
  })

  it('reprocessBetScope: reprocessar a mesma aposta (multi-concurso) duas vezes produz o mesmo estado final', async () => {
    const config = getLotteryConfig('megasena')
    const db = createFakeDb()
    seedContest(db, 'contest-2900', 2900, [1, 2, 3, 4, 5, 6])
    seedContest(db, 'contest-2901', 2901, [1, 2, 3, 4, 5, 6])
    const bet = betRow('bet-0001', [1, 2, 3, 4, 5, 6], { contestFrom: 2900, contestTo: 2901 })

    const first = await reprocessBetScope(db.prisma, bet, config)
    expect(first).toEqual({ deletedChecks: 0, recreatedChecks: 2, processedBets: 2, prizedBets: 1 })
    const snapshotAfterFirst = new Map(db.betChecks)

    const second = await reprocessBetScope(db.prisma, bet, config)
    expect(second).toEqual({ deletedChecks: 2, recreatedChecks: 2, processedBets: 2, prizedBets: 1 })

    expect([...db.betChecks.entries()]).toEqual([...snapshotAfterFirst.entries()])
    expect(db.betChecks.get('bet-0001:contest-2900:1')).toMatchObject({ hits: 6, prizeTier: 1 })
    expect(db.betChecks.get('bet-0001:contest-2901:1')).toMatchObject({ hits: 6, prizeTier: 1 })
  })
})

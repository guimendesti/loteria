/**
 * Testes de `admin.config.fixContest` (BO-42) — achado de auditoria (severidade média): a
 * correção manual de dezenas de um concurso gravava `input.numbers` direto, sem checar
 * universo/duplicidade/quantidade contra a `LotteryConfig` da modalidade. Cobre os 3 casos
 * do achado (fora-do-universo, duplicado, quantidade errada) e prova que, em qualquer um
 * deles, o Prisma NUNCA chega a gravar nada (`contest.update` não é chamado) — a validação
 * roda ANTES da escrita.
 *
 * Mesmo padrão de `account.test.ts`/`push.test.ts`: instância própria de `initTRPC` (mesma
 * config de `server/trpc.ts`) para `t.createCallerFactory` bater com o `RootConfig`.
 */
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { adminConfigRouter } from '@/server/routers/admin/config'
import { toPaywallData, type Context } from '@/server/trpc'
import { BetValidationError, PaywallError } from '@/server/errors'

const testTRPC = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        betValidationErrors: error.cause instanceof BetValidationError ? error.cause.errors : null,
        paywall: error.cause instanceof PaywallError ? toPaywallData(error.cause.result) : null,
      },
    }
  },
})
const createCaller = testTRPC.createCallerFactory(adminConfigRouter)

const ADMIN_USER_ID = 'admin-1'
const CONTEST_ID = 'contest-2900'

function buildContext(prismaStubs: Record<string, unknown>): Context {
  return {
    prisma: prismaStubs as unknown as PrismaClient,
    session: {
      user: { id: ADMIN_USER_ID, email: 'admin@example.com', name: 'Admin', role: 'ADMIN' },
      session: { id: 'session-1', token: 'tok', userId: ADMIN_USER_ID },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('free')),
    ip: null,
    userAgent: null,
  }
}

/** Concurso existente da Mega-Sena (universo 1–60, 6 dezenas sorteadas) — base dos testes. */
function megasenaContest() {
  return {
    id: CONTEST_ID,
    number: 2900,
    drawDate: new Date('2026-08-04T00:00:00-03:00'),
    numbers: [1, 2, 3, 4, 5, 6],
    numbersDrawOrder: [1, 2, 3, 4, 5, 6],
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
    lotteryId: 'lottery-megasena',
    lottery: { slug: 'megasena' },
  }
}

/** Stubs mínimos para a `fixContest` conseguir rodar até o fim quando a validação PASSA. */
function buildValidPathStubs(overrides: { contestUpdateNumbers?: number[] } = {}) {
  const findUnique = vi.fn().mockResolvedValue(megasenaContest())
  const update = vi.fn().mockResolvedValue({
    ...megasenaContest(),
    numbers: overrides.contestUpdateNumbers ?? [10, 20, 30, 40, 50, 60],
  })
  const auditCreate = vi.fn().mockResolvedValue({})
  const betCheckDeleteMany = vi.fn().mockResolvedValue({ count: 0 })
  const betFindMany = vi.fn().mockResolvedValue([]) // sem apostas cobrindo o concurso — loop encerra na 1ª volta

  return {
    stubs: {
      contest: { findUnique, update },
      auditLog: { create: auditCreate },
      betCheck: { deleteMany: betCheckDeleteMany, create: vi.fn() },
      bet: { findMany: betFindMany },
    },
    findUnique,
    update,
    auditCreate,
  }
}

describe('admin.config.fixContest — validação das dezenas contra a LotteryConfig (BO-42)', () => {
  it('aceita uma correção válida (6 dezenas únicas dentro de 1–60) e grava normalmente', async () => {
    const { stubs, update, auditCreate } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    const result = await caller.fixContest({ contestId: CONTEST_ID, numbers: [10, 20, 30, 40, 50, 60] })

    expect(update).toHaveBeenCalledTimes(1)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(result.contest.numbers).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('rejeita dezena fora do universo (61 na Mega-Sena, universo 1–60) e NUNCA chega a gravar', async () => {
    const { stubs, update, auditCreate } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5, 61] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5, 61] }),
    ).rejects.toThrow(/fora do universo/i)

    expect(update).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('rejeita dezena duplicada e NUNCA chega a gravar', async () => {
    const { stubs, update } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5, 5] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5, 5] }),
    ).rejects.toThrow(/repetidas/i)

    expect(update).not.toHaveBeenCalled()
  })

  it('rejeita quantidade errada de dezenas (5 em vez de 6 na Mega-Sena) e NUNCA chega a gravar', async () => {
    const { stubs, update } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5] }),
    ).rejects.toThrow(/sorteia exatamente 6 dezenas/i)

    expect(update).not.toHaveBeenCalled()
  })

  it('quantidade errada por EXCESSO também é rejeitada (7 em vez de 6)', async () => {
    const { stubs, update } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.fixContest({ contestId: CONTEST_ID, numbers: [1, 2, 3, 4, 5, 6, 7] }),
    ).rejects.toThrow(/sorteia exatamente 6 dezenas/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('valida secondaryNumbers (2º sorteio) com o MESMO critério quando informado', async () => {
    const { stubs, update } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.fixContest({
        contestId: CONTEST_ID,
        numbers: [1, 2, 3, 4, 5, 6],
        secondaryNumbers: [1, 2, 3, 4, 5, 61], // fora do universo
      }),
    ).rejects.toThrow(/fora do universo/i)

    expect(update).not.toHaveBeenCalled()
  })

  it('não valida secondaryNumbers quando o campo não é informado (correção de 1 sorteio só)', async () => {
    const { stubs, update } = buildValidPathStubs()
    const caller = createCaller(buildContext(stubs))

    await caller.fixContest({ contestId: CONTEST_ID, numbers: [10, 20, 30, 40, 50, 60] })

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('404 quando o concurso não existe — validação nem roda', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ contest: { findUnique } }))

    await expect(
      caller.fixContest({ contestId: 'inexistente', numbers: [1, 2, 3, 4, 5, 6] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

/**
 * Testes do router `bets` (Onda 8b — vínculo `Bet.poolId` <-> `Pool`,
 * `docs/contracts/onda8-bolao.md`). Cobre especificamente o que esta onda
 * acrescentou: `assignPool` (vincular/desvincular depois da criação), `create`
 * com `poolId` (vincular já na criação) e `byPool` (consolidação de custo para
 * o organizador). Não há suíte anterior para `bets.ts` — este arquivo cobre só
 * o território desta tarefa, não o router inteiro.
 *
 * Mesmo padrão de `server/routers/__tests__/pool.test.ts`/`account.test.ts`:
 * instância própria de `initTRPC` (replicando o `RootConfig` de `server/trpc.ts`)
 * e fakes mínimos de Prisma (só os métodos que cada teste realmente usa).
 */
import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { PoolStatus } from '@lotopro/db'
import { betsRouter } from '@/server/routers/bets'
import { toPaywallData, type Context } from '@/server/trpc'
import { BetValidationError, PaywallError } from '@/server/errors'
import {
  assertBetMatchesPool,
  assertPoolGamesEditable,
  assertPoolOwnedBy,
  type PoolLinkTarget,
} from '@/server/lib/bet-pool'

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
const createCaller = testTRPC.createCallerFactory(betsRouter)

const OWNER_ID = 'owner-1' // dono do bolão E dono das apostas usadas nos testes felizes
const OTHER_POOL_OWNER = 'pool-owner-2' // dono de um bolão alheio (cenário "não-dono")
const OTHER_BET_OWNER = 'stranger-1' // dono de uma aposta alheia (cenário "aposta de outro usuário")
const TENANT_ID = 'tenant-1'

const LOTTERY_MEGASENA = 'lottery-megasena'
const LOTTERY_QUINA = 'lottery-quina'

function buildContext(prismaStubs: Record<string, unknown>, actorId: string = OWNER_ID): Context {
  return {
    prisma: prismaStubs as unknown as PrismaClient,
    session: {
      user: { id: actorId, email: `${actorId}@example.com`, name: 'Fulano de Tal', tenantId: TENANT_ID },
      session: { id: 'session-1', token: 'tok', userId: actorId },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('premium')),
    ip: null,
    userAgent: null,
  }
}

/** Bolão-alvo padrão: aberto, modalidade Mega-Sena, aceita concursos 2800-2810. */
function poolStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    ownerId: OWNER_ID,
    lotteryId: LOTTERY_MEGASENA,
    contestFrom: 2800,
    contestTo: 2810,
    status: PoolStatus.OPEN,
    totalCostCents: 1000n,
    ...overrides,
  }
}

/** Jogo-alvo padrão: do próprio `OWNER_ID`, Mega-Sena, concurso 2800, sem bolão ainda. */
function betStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bet-1',
    userId: OWNER_ID,
    lotteryId: LOTTERY_MEGASENA,
    contestFrom: 2800,
    contestTo: 2800,
    poolId: null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// bets.assignPool — autorização e integridade (Onda 8b)
// ─────────────────────────────────────────────────────────────────────────────

describe('bets.assignPool — rejeições', () => {
  it('não-dono do bolão recebe FORBIDDEN e não grava nada', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub())
    // O bolão pertence a OUTRA pessoa — o ator não é o organizador.
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ ownerId: OTHER_POOL_OWNER }))
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('aposta de outro usuário não pode ser arrastada para dentro do bolão — NOT_FOUND, nem consulta o bolão', async () => {
    // O ator É o dono real do bolão, mas a aposta pertence a OUTRO usuário.
    const betFindUnique = vi.fn().mockResolvedValue(betStub({ userId: OTHER_BET_OWNER }))
    const poolFindUnique = vi.fn()
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(poolFindUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('modalidade divergente entre jogo e bolão é rejeitada com BAD_REQUEST', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub({ lotteryId: LOTTERY_QUINA }))
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ lotteryId: LOTTERY_MEGASENA }))
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/modalidade/i),
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('concurso do jogo fora da faixa contestFrom..contestTo do bolão é rejeitado com BAD_REQUEST', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub({ contestFrom: 2700, contestTo: 2700 }))
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ contestFrom: 2800, contestTo: 2810 }))
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/faixa/i),
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('bolão em BET_PLACED está congelado — BAD_REQUEST explicando o motivo', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub())
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ status: PoolStatus.BET_PLACED }))
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/lotérica|registrados/i),
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('desvincular de um bolão já BET_PLACED também é bloqueado (congelamento vale para a origem também)', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub({ poolId: 'pool-old' }))
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ id: 'pool-old', status: PoolStatus.BET_PLACED }))
    const update = vi.fn()
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    await expect(caller.assignPool({ betId: 'bet-1', poolId: null })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('bets.assignPool — caminho feliz', () => {
  it('vincula o jogo ao bolão (dono, mesma modalidade, concurso dentro da faixa, bolão editável)', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub())
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const updated = { id: 'bet-1', poolId: 'pool-1' }
    const update = vi.fn().mockResolvedValue(updated)
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    const result = await caller.assignPool({ betId: 'bet-1', poolId: 'pool-1' })

    expect(result).toEqual(updated)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bet-1' }, data: { poolId: 'pool-1' } }),
    )
  })

  it('desvincula (poolId: null) de um bolão ainda editável', async () => {
    const betFindUnique = vi.fn().mockResolvedValue(betStub({ poolId: 'pool-1' }))
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const updated = { id: 'bet-1', poolId: null }
    const update = vi.fn().mockResolvedValue(updated)
    const caller = createCaller(
      buildContext({ bet: { findUnique: betFindUnique, update }, pool: { findUnique: poolFindUnique } }, OWNER_ID),
    )

    const result = await caller.assignPool({ betId: 'bet-1', poolId: null })

    expect(result).toEqual(updated)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bet-1' }, data: { poolId: null } }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// bets.create — vínculo opcional com bolão já na criação (Onda 8b)
// ─────────────────────────────────────────────────────────────────────────────

describe('bets.create — poolId opcional', () => {
  const baseInput = {
    lotterySlug: 'megasena' as const,
    numbers: [1, 2, 3, 4, 5, 6],
    contestFrom: 2800,
    contestTo: 2800,
  }

  it('cria o jogo já vinculado ao bolão quando poolId é informado e tudo bate', async () => {
    const lotteryFindUnique = vi.fn().mockResolvedValue({ id: LOTTERY_MEGASENA })
    const betCount = vi.fn().mockResolvedValue(0)
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const created = { id: 'bet-new', poolId: 'pool-1' }
    const betCreate = vi.fn().mockResolvedValue(created)
    const caller = createCaller(
      buildContext(
        {
          lottery: { findUnique: lotteryFindUnique },
          bet: { count: betCount, create: betCreate },
          pool: { findUnique: poolFindUnique },
        },
        OWNER_ID,
      ),
    )

    const result = await caller.create({ ...baseInput, poolId: 'pool-1' })

    expect(result).toEqual(created)
    const createCall = betCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(createCall.data.poolId).toBe('pool-1')
  })

  it('recusa quando o bolão informado não é do usuário — FORBIDDEN, nada é criado', async () => {
    const lotteryFindUnique = vi.fn().mockResolvedValue({ id: LOTTERY_MEGASENA })
    const betCount = vi.fn().mockResolvedValue(0)
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub({ ownerId: OTHER_POOL_OWNER }))
    const betCreate = vi.fn()
    const caller = createCaller(
      buildContext(
        {
          lottery: { findUnique: lotteryFindUnique },
          bet: { count: betCount, create: betCreate },
          pool: { findUnique: poolFindUnique },
        },
        OWNER_ID,
      ),
    )

    await expect(caller.create({ ...baseInput, poolId: 'pool-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(betCreate).not.toHaveBeenCalled()
  })

  it('sem poolId no input, cria normalmente sem vínculo (comportamento anterior preservado)', async () => {
    const lotteryFindUnique = vi.fn().mockResolvedValue({ id: LOTTERY_MEGASENA })
    const betCount = vi.fn().mockResolvedValue(0)
    const poolFindUnique = vi.fn()
    const created = { id: 'bet-new', poolId: null }
    const betCreate = vi.fn().mockResolvedValue(created)
    const caller = createCaller(
      buildContext(
        {
          lottery: { findUnique: lotteryFindUnique },
          bet: { count: betCount, create: betCreate },
          pool: { findUnique: poolFindUnique },
        },
        OWNER_ID,
      ),
    )

    const result = await caller.create(baseInput)

    expect(result).toEqual(created)
    expect(poolFindUnique).not.toHaveBeenCalled()
    const createCall = betCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(createCall.data.poolId).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// bets.byPool — consolidação de custo dos jogos vinculados (missão §2)
// ─────────────────────────────────────────────────────────────────────────────

describe('bets.byPool — soma do custo dos jogos vinculados vs. Pool.totalCostCents', () => {
  it('só o organizador do bolão vê a consolidação — FORBIDDEN para outro usuário', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, totalCostCents: 1000n })
    const betFindMany = vi.fn()
    const caller = createCaller(
      buildContext({ pool: { findUnique: poolFindUnique }, bet: { findMany: betFindMany } }, OTHER_POOL_OWNER),
    )

    await expect(caller.byPool({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(betFindMany).not.toHaveBeenCalled()
  })

  it('expõe a divergência quando a soma dos jogos NÃO bate com o custo declarado do bolão', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, totalCostCents: 1000n })
    const betFindMany = vi.fn().mockResolvedValue([
      { id: 'bet-1', costCents: 300n },
      { id: 'bet-2', costCents: 400n },
    ])
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique }, bet: { findMany: betFindMany } }, OWNER_ID))

    const result = await caller.byPool({ poolId: 'pool-1' })

    expect(result.betCount).toBe(2)
    expect(result.linkedCostCents).toBe(700n)
    expect(result.declaredCostCents).toBe(1000n)
    expect(result.costDiffCents).toBe(-300n)
    expect(result.matchesDeclaredCost).toBe(false)
  })

  it('matchesDeclaredCost é true quando a soma dos jogos bate exatamente com o custo declarado', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, totalCostCents: 700n })
    const betFindMany = vi.fn().mockResolvedValue([
      { id: 'bet-1', costCents: 300n },
      { id: 'bet-2', costCents: 400n },
    ])
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique }, bet: { findMany: betFindMany } }, OWNER_ID))

    const result = await caller.byPool({ poolId: 'pool-1' })

    expect(result.costDiffCents).toBe(0n)
    expect(result.matchesDeclaredCost).toBe(true)
  })

  it('bolão sem nenhum jogo vinculado ainda: soma zero, diverge do custo declarado (> 0)', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, totalCostCents: 1000n })
    const betFindMany = vi.fn().mockResolvedValue([])
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique }, bet: { findMany: betFindMany } }, OWNER_ID))

    const result = await caller.byPool({ poolId: 'pool-1' })

    expect(result.betCount).toBe(0)
    expect(result.linkedCostCents).toBe(0n)
    expect(result.matchesDeclaredCost).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// server/lib/bet-pool — funções puras (mesmo espírito de bet-cost.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe('server/lib/bet-pool — funções puras de autorização/integridade', () => {
  const pool: PoolLinkTarget = {
    id: 'pool-1',
    ownerId: OWNER_ID,
    lotteryId: LOTTERY_MEGASENA,
    contestFrom: 2800,
    contestTo: 2810,
    status: PoolStatus.OPEN,
    totalCostCents: 1000n,
  }

  it('assertPoolOwnedBy bloqueia quem não é o dono', () => {
    expect(() => assertPoolOwnedBy(pool, OTHER_POOL_OWNER)).toThrow(TRPCError)
    expect(() => assertPoolOwnedBy(pool, OWNER_ID)).not.toThrow()
  })

  it('assertPoolGamesEditable permite DRAFT/OPEN/CLOSED e bloqueia BET_PLACED/SETTLED/CANCELED', () => {
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.DRAFT })).not.toThrow()
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.OPEN })).not.toThrow()
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.CLOSED })).not.toThrow()
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.BET_PLACED })).toThrow(TRPCError)
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.SETTLED })).toThrow(TRPCError)
    expect(() => assertPoolGamesEditable({ ...pool, status: PoolStatus.CANCELED })).toThrow(TRPCError)
  })

  it('assertBetMatchesPool exige mesma modalidade e concurso dentro da faixa', () => {
    expect(() =>
      assertBetMatchesPool({ lotteryId: LOTTERY_QUINA, contestFrom: 2800, contestTo: 2800 }, pool),
    ).toThrow(TRPCError)
    expect(() =>
      assertBetMatchesPool({ lotteryId: LOTTERY_MEGASENA, contestFrom: 2790, contestTo: 2800 }, pool),
    ).toThrow(TRPCError)
    expect(() =>
      assertBetMatchesPool({ lotteryId: LOTTERY_MEGASENA, contestFrom: 2800, contestTo: 2820 }, pool),
    ).toThrow(TRPCError)
    expect(() =>
      assertBetMatchesPool({ lotteryId: LOTTERY_MEGASENA, contestFrom: 2800, contestTo: 2805 }, pool),
    ).not.toThrow()
  })
})

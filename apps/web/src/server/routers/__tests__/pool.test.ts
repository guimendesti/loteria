/**
 * Testes do router `pool` (Onda 8, `docs/contracts/onda8-bolao.md`) — autorização de
 * TODO procedure, invariantes de dinheiro/cotas e a máquina de estados do bolão.
 *
 * Mesmo padrão de `server/routers/__tests__/account.test.ts`: instância própria de
 * `initTRPC` (replicando o `RootConfig` de `server/trpc.ts` — transformer + errorFormatter
 * — para `t.createCallerFactory` tipar certo) e fakes mínimos de Prisma (só os métodos que
 * cada teste realmente usa), tipados via `as unknown as PrismaClient`.
 *
 * ⚠️ Sobre concorrência (invariante 3, "não vende cota a mais"): o fake de Prisma não é um
 * banco de verdade, então não há como testar uma corrida real de duas transações
 * simultâneas aqui. O que ESTE arquivo prova é a lógica de decisão em si — a recontagem
 * dentro da transação bloqueia corretamente quando a soma já bateria/passaria do total —
 * que é a mesma lógica que roda dentro de `prisma.$transaction` em produção. Cobertura de
 * corrida real pertence a um teste de integração contra Postgres (fora do escopo desta
 * tarefa).
 */
import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { MemberStatus, PaymentConfirmation, PayoutStatus, PixKeyType, PoolStatus } from '@lotopro/db'
import { poolRouter } from '@/server/routers/pool'
import { encryptSecret } from '@/server/lib/crypto'
import { normalizePixKeyForPayload } from '@/server/lib/pix-key'
import { toPaywallData, type Context } from '@/server/trpc'
import { BetValidationError, PaywallError } from '@/server/errors'
import { sharesRatioDecimalString } from '@/server/lib/pool/decimal'
import { alphabetIndexFromByte, generateUniqueInviteCode } from '@/server/lib/pool/invite-code'
import { enqueuePoolNotify } from '@/server/lib/pool/notify-queue'
import { maskOwnerPixKey, toPixKeyKind } from '@/server/lib/pool/pix'
import {
  assertCanConfirmPayment,
  assertCanDeclarePayment,
  assertCanLeavePool,
  assertCanMarkPayoutPaid,
  assertValidPoolTransition,
} from '@/server/lib/pool/state-machine'

// `pool.ts` enfileira eventos de `pool-notify` (item 1 do escopo desta tarefa) chamando
// `enqueuePoolNotify` DEPOIS de cada mutation persistir — mocka-se aqui pra: (a) as
// asserções de "o que foi enfileirado" não dependerem de um Redis de verdade; (b) simular
// falha de Redis (`mockRejectedValueOnce`) e provar que a mutation em si não é derrubada.
vi.mock('@/server/lib/pool/notify-queue', () => ({
  enqueuePoolNotify: vi.fn(),
}))

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
const createCaller = testTRPC.createCallerFactory(poolRouter)

const OWNER_ID = 'owner-1'
const MEMBER_ID_USER = 'member-user-1'
const OTHER_USER_ID = 'stranger-1'
const TENANT_ID = 'tenant-1'

/**
 * Contexto mínimo: só os métodos de Prisma que o teste realmente usa entram em
 * `prismaStubs`. `$transaction` é injetado automaticamente e sabe lidar com as DUAS
 * formas usadas pelo router: array de operações já disparadas (`Promise.all`) e callback
 * interativo (`fn(tx)`, reaproveitando os MESMOS stubs como `tx` — suficiente para testar
 * a lógica de decisão, já que não há isolamento real de banco aqui).
 */
function buildContext(prismaStubs: Record<string, unknown>, actorId: string = OWNER_ID): Context {
  const stubs: Record<string, unknown> = { ...prismaStubs }
  if (!('$transaction' in stubs)) {
    stubs.$transaction = vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => unknown)(stubs)
      }
      return Promise.all(arg as Array<Promise<unknown>>)
    })
  }
  if (!('$queryRaw' in stubs)) {
    // Achado J-1: `pool.join`/`members.addGuest` travam a linha do Pool (`SELECT ... FOR
    // UPDATE` via `tx.$queryRaw`) antes de recontar cotas. Testes que não estão exercitando
    // essa trava em si só precisam de um stub neutro — os describes dedicados abaixo
    // ("trava a linha do Pool...") passam o próprio `$queryRaw` pra inspecionar a chamada.
    stubs.$queryRaw = vi.fn().mockResolvedValue([])
  }

  return {
    prisma: stubs as unknown as PrismaClient,
    session: {
      user: { id: actorId, email: `${actorId}@example.com`, name: 'Fulano de Tal', tenantId: TENANT_ID },
      session: { id: 'session-1', token: 'tok', userId: actorId },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('premium')),
    // `Context` ganhou `ip`/`userAgent` (server/trpc.ts, achado de auditoria de outro
    // agente desta onda) — o router `pool` não os usa, mas o tipo exige os dois campos.
    ip: null,
    userAgent: null,
  }
}

/** `resolveEntitlements(prisma, ownerId)` (usado por `pool.join`) bate aqui quando o dono não tem assinatura ativa → cai no plano Free. */
function noActiveSubscriptionStub() {
  return { subscription: { findFirst: vi.fn().mockResolvedValue(null) } }
}

/** `JSON.stringify` nativo não serializa `bigint` (CLAUDE.md §5 — dinheiro é sempre
 * `bigint` neste router) — só para as asserções "nunca vaza X em lugar nenhum da resposta". */
function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
}

beforeEach(() => {
  // 32 bytes fixos em base64 — determinístico entre execuções, só para o teste (mesmo padrão de account.test.ts).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  vi.mocked(enqueuePoolNotify).mockReset()
})

// ─────────────────────────────────────────────────────────────────────────────
// Autorização — dono vs. membro vs. estranho em cada procedure
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.updateStatus — autorização (dono)', () => {
  it('não-dono chamando updateStatus recebe FORBIDDEN e não escreve nada', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, status: PoolStatus.DRAFT, receiptUrl: null })
    const update = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique, update } }, OTHER_USER_ID))

    await expect(caller.updateStatus({ poolId: 'pool-1', status: PoolStatus.OPEN })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('pool.detail — autorização (dono ou membro)', () => {
  const basePool = {
    id: 'pool-1',
    ownerId: OWNER_ID,
    name: 'Bolão da galera',
    status: PoolStatus.OPEN,
    description: null,
    inviteCode: 'SEGREDO123',
    inviteExpiresAt: null,
    receiptUrl: null,
    ownerPixKeyType: null,
    ownerPixKeyEnc: null,
    contestFrom: 2800,
    contestTo: 2800,
    totalShares: 10,
    totalCostCents: 1000n,
    shareValueCents: 100n,
    lottery: { slug: 'megasena', name: 'Mega-Sena' },
    bets: [],
  }

  it('não-membro (nem dono) recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...basePool, members: [] })
    const caller = createCaller(buildContext({ pool: { findUnique } }, OTHER_USER_ID))

    await expect(caller.detail({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('participante REMOVIDO conta como não-membro → FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ...basePool,
      members: [
        {
          id: 'm1',
          userId: OTHER_USER_ID,
          guestName: null,
          shares: 1,
          amountCents: 100n,
          status: MemberStatus.REMOVED,
          user: { name: 'Ex-participante' },
          payments: [],
        },
      ],
    })
    const caller = createCaller(buildContext({ pool: { findUnique } }, OTHER_USER_ID))

    await expect(caller.detail({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('bolão inexistente é NOT_FOUND', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ pool: { findUnique } }, OWNER_ID))

    await expect(caller.detail({ poolId: 'nao-existe' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('pool.members.confirmPayment — SÓ o dono (invariante de autorização)', () => {
  it('membro tentando confirmar o próprio pagamento (não é dono) recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      status: MemberStatus.PAID,
      amountCents: 500n,
      pool: { ownerId: OWNER_ID },
    })
    const paymentCreate = vi.fn()
    const memberUpdate = vi.fn()
    const caller = createCaller(
      buildContext({ poolMember: { findUnique, update: memberUpdate }, poolPayment: { create: paymentCreate } }, MEMBER_ID_USER),
    )

    await expect(caller.members.confirmPayment({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(paymentCreate).not.toHaveBeenCalled()
    expect(memberUpdate).not.toHaveBeenCalled()
  })

  it('o dono confirma normalmente e o status vira CONFIRMED', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      status: MemberStatus.PAID,
      amountCents: 500n,
      pool: { ownerId: OWNER_ID },
    })
    const paymentCreate = vi.fn().mockResolvedValue({})
    const memberUpdate = vi.fn().mockResolvedValue({ status: MemberStatus.CONFIRMED })
    const caller = createCaller(
      buildContext({ poolMember: { findUnique, update: memberUpdate }, poolPayment: { create: paymentCreate } }, OWNER_ID),
    )

    const result = await caller.members.confirmPayment({ memberId: 'member-1' })
    expect(result).toEqual({ status: MemberStatus.CONFIRMED })
    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ confirmedBy: PaymentConfirmation.OWNER_MANUAL }) }),
    )
  })
})

describe('pool.payments.declare — SÓ o próprio participante', () => {
  it('dono tentando declarar pagamento de outro participante recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      userId: MEMBER_ID_USER,
      status: MemberStatus.JOINED,
      amountCents: 500n,
    })
    const create = vi.fn()
    const caller = createCaller(buildContext({ poolMember: { findUnique }, poolPayment: { create } }, OWNER_ID))

    await expect(caller.payments.declare({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(create).not.toHaveBeenCalled()
  })

  it('declarar de novo depois de já CONFIRMED é rejeitado', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      userId: MEMBER_ID_USER,
      status: MemberStatus.CONFIRMED,
      amountCents: 500n,
    })
    const create = vi.fn()
    const caller = createCaller(buildContext({ poolMember: { findUnique }, poolPayment: { create } }, MEMBER_ID_USER))

    await expect(caller.payments.declare({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('pool.payments.pixPayload — dono ou o próprio membro', () => {
  function memberStub(poolOverrides: Record<string, unknown> = {}) {
    return {
      id: 'member-1',
      userId: MEMBER_ID_USER,
      amountCents: 500n,
      pool: {
        id: 'pool-1',
        ownerId: OWNER_ID,
        ownerPixKeyType: PixKeyType.EMAIL,
        ownerPixKeyEnc: encryptSecret('organizador@example.com'),
        owner: { name: 'Organizador da Silva' },
        ...poolOverrides,
      },
    }
  }

  it('estranho (nem dono, nem o próprio membro) recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue(memberStub())
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OTHER_USER_ID))

    await expect(caller.payments.pixPayload({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('o próprio membro gera o payload Pix (chave decifrada só no servidor, nunca ownerPixKeyEnc na resposta)', async () => {
    const findUnique = vi.fn().mockResolvedValue(memberStub())
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, MEMBER_ID_USER))

    const result = await caller.payments.pixPayload({ memberId: 'member-1' })
    expect(result.amountCents).toBe(500n)
    // A chave do organizador VAI dentro do EMV — é assim que o Pix funciona (é o "para
    // quem pagar", não um segredo do LotoPro). O que nunca pode vazar é `ownerPixKeyEnc`.
    expect(result.emv).toContain('organizador@example.com')
    expect(stringifyWithBigInt(result)).not.toMatch(/v1:/)
  })

  it('o dono também consegue gerar (não precisa ser o próprio membro)', async () => {
    const findUnique = vi.fn().mockResolvedValue(memberStub())
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    const result = await caller.payments.pixPayload({ memberId: 'member-1' })
    expect(result.amountCents).toBe(500n)
  })

  it('bolão sem chave Pix configurada retorna BAD_REQUEST (nunca gera EMV vazio/inválido)', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      memberStub({ ownerPixKeyType: null, ownerPixKeyEnc: null }),
    )
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    await expect(caller.payments.pixPayload({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('chave de telefone salva no formato antigo (dígitos soltos, sem "+55") é normalizada — sem isto o Pix quebraria em runtime (core exige E.164)', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      memberStub({ ownerPixKeyType: PixKeyType.PHONE, ownerPixKeyEnc: encryptSecret('11999998888') }),
    )
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    const result = await caller.payments.pixPayload({ memberId: 'member-1' })
    expect(result.emv).toContain('+5511999998888')
  })

  it('chave inválida mesmo depois de normalizar devolve BAD_REQUEST orientando recadastrar em Conta → Chave Pix', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      // Curto demais mesmo depois de normalizar (nem 10 nem 11 dígitos) — o core rejeita.
      memberStub({ ownerPixKeyType: PixKeyType.PHONE, ownerPixKeyEnc: encryptSecret('123') }),
    )
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    await expect(caller.payments.pixPayload({ memberId: 'member-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Conta → Chave Pix'),
    })
  })

  it('usa User.city do organizador como merchantCity real (item 3), com fallback pra SAO PAULO quando não preenchida', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      memberStub({ owner: { name: 'Organizador da Silva', city: 'Belo Horizonte' } }),
    )
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    const result = await caller.payments.pixPayload({ memberId: 'member-1' })
    expect(result.emv).toContain('BELO HORIZONTE')
  })

  it('organizador sem User.city cai no fallback SAO PAULO (nunca quebra por falta de cidade)', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      memberStub({ owner: { name: 'Organizador da Silva', city: null } }),
    )
    const caller = createCaller(buildContext({ poolMember: { findUnique } }, OWNER_ID))

    const result = await caller.payments.pixPayload({ memberId: 'member-1' })
    expect(result.emv).toContain('SAO PAULO')
  })
})

describe('server/lib/pix-key — normalizePixKeyForPayload (item 2 do escopo)', () => {
  it('telefone gravado como dígitos soltos (formato hoje gravado por account.ts) vira E.164', () => {
    expect(normalizePixKeyForPayload(PixKeyType.PHONE, '11999998888')).toBe('+5511999998888') // celular, 11 dígitos
    expect(normalizePixKeyForPayload(PixKeyType.PHONE, '1633334444')).toBe('+551633334444') // fixo, 10 dígitos
  })

  it('telefone já em E.164 (ou só com o "55" na frente) é idempotente — nunca duplica o "+"', () => {
    expect(normalizePixKeyForPayload(PixKeyType.PHONE, '+5511999998888')).toBe('+5511999998888')
    expect(normalizePixKeyForPayload(PixKeyType.PHONE, '5511999998888')).toBe('+5511999998888')
  })

  it('UUID (RANDOM) vira minúsculas (Addendum v2 §2: "UUID → minúsculas")', () => {
    expect(normalizePixKeyForPayload(PixKeyType.RANDOM, '550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('CPF/CNPJ ficam só com dígitos; e-mail fica minúsculo', () => {
    expect(normalizePixKeyForPayload(PixKeyType.CPF, '123.456.789-00')).toBe('12345678900')
    expect(normalizePixKeyForPayload(PixKeyType.CNPJ, '12.345.678/0001-90')).toBe('12345678000190')
    expect(normalizePixKeyForPayload(PixKeyType.EMAIL, 'Organizador@GMAIL.com')).toBe('organizador@gmail.com')
  })
})

describe('pool.leave — o próprio membro sai (Addendum v2 §4)', () => {
  it('libera a cota quando o bolão está aberto e o pagamento ainda não foi declarado nem confirmado', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ status: PoolStatus.OPEN })
    const memberFindUnique = vi.fn().mockResolvedValue({ id: 'member-1', status: MemberStatus.JOINED })
    const memberUpdate = vi.fn().mockResolvedValue({})
    const caller = createCaller(
      buildContext(
        { pool: { findUnique: poolFindUnique }, poolMember: { findUnique: memberFindUnique, update: memberUpdate } },
        MEMBER_ID_USER,
      ),
    )

    const result = await caller.leave({ poolId: 'pool-1' })
    expect(result).toEqual({ ok: true })
    expect(memberUpdate).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { status: MemberStatus.REMOVED } })
  })

  it.each([MemberStatus.PAID, MemberStatus.CONFIRMED])(
    'recusa sair depois do pagamento em status %s — orienta falar com o organizador (Pix já pode ter ocorrido)',
    async (status) => {
      const poolFindUnique = vi.fn().mockResolvedValue({ status: PoolStatus.OPEN })
      const memberFindUnique = vi.fn().mockResolvedValue({ id: 'member-1', status })
      const memberUpdate = vi.fn()
      const caller = createCaller(
        buildContext(
          { pool: { findUnique: poolFindUnique }, poolMember: { findUnique: memberFindUnique, update: memberUpdate } },
          MEMBER_ID_USER,
        ),
      )

      await expect(caller.leave({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(memberUpdate).not.toHaveBeenCalled()
    },
  )

  it('bolão fora de "aberto" (ex.: CLOSED) recusa a saída sem nem checar o participante', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ status: PoolStatus.CLOSED })
    const memberFindUnique = vi.fn()
    const caller = createCaller(
      buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { findUnique: memberFindUnique } }, MEMBER_ID_USER),
    )

    await expect(caller.leave({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(memberFindUnique).not.toHaveBeenCalled()
  })

  it('quem não participa do bolão recebe FORBIDDEN', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ status: PoolStatus.OPEN })
    const memberFindUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(
      buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { findUnique: memberFindUnique } }, OTHER_USER_ID),
    )

    await expect(caller.leave({ poolId: 'pool-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('bolão inexistente é NOT_FOUND', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique } }, MEMBER_ID_USER))

    await expect(caller.leave({ poolId: 'nao-existe' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('server/lib/pool/state-machine — assertCanLeavePool', () => {
  it('permite a partir de INVITED/JOINED', () => {
    expect(() => assertCanLeavePool(MemberStatus.INVITED)).not.toThrow()
    expect(() => assertCanLeavePool(MemberStatus.JOINED)).not.toThrow()
  })

  it('bloqueia a partir de PAID/CONFIRMED', () => {
    expect(() => assertCanLeavePool(MemberStatus.PAID)).toThrow(TRPCError)
    expect(() => assertCanLeavePool(MemberStatus.CONFIRMED)).toThrow(TRPCError)
  })
})

describe('pool.payout.pixPayload — Addendum v2 §2 (só o dono; chave do PARTICIPANTE, direção oposta de payments.pixPayload)', () => {
  function payoutStub(overrides: Record<string, unknown> = {}) {
    return {
      id: 'payout-1',
      poolId: 'pool-1',
      poolMemberId: 'member-1',
      amountCents: 700n,
      pool: { ownerId: OWNER_ID },
      poolMember: {
        user: {
          name: 'Participante da Silva',
          city: 'Recife',
          pixKeyType: PixKeyType.PHONE,
          // Formato antigo (sem "+55") — mesmo bug do item 2, agora do lado do participante.
          pixKeyEncrypted: encryptSecret('11999998888'),
        },
      },
      ...overrides,
    }
  }

  it('não-dono (nem o próprio participante do rateio) recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue(payoutStub())
    const caller = createCaller(buildContext({ poolPayout: { findUnique } }, MEMBER_ID_USER))

    await expect(caller.payout.pixPayload({ payoutId: 'payout-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('dono gera o EMV com a chave do participante já normalizada', async () => {
    const findUnique = vi.fn().mockResolvedValue(payoutStub())
    const caller = createCaller(buildContext({ poolPayout: { findUnique } }, OWNER_ID))

    const result = await caller.payout.pixPayload({ payoutId: 'payout-1' })
    expect(result).not.toBeNull()
    expect(result?.emv).toContain('+5511999998888')
    expect(result?.emv).toContain('RECIFE')
    expect(result?.amountCents).toBe(700n)
  })

  it('convidado sem conta (PoolMember.userId null → user null) devolve null, nunca lança', async () => {
    const findUnique = vi.fn().mockResolvedValue(payoutStub({ poolMember: { user: null } }))
    const caller = createCaller(buildContext({ poolPayout: { findUnique } }, OWNER_ID))

    const result = await caller.payout.pixPayload({ payoutId: 'payout-1' })
    expect(result).toBeNull()
  })

  it('membro com conta mas sem chave Pix cadastrada devolve null', async () => {
    const findUnique = vi.fn().mockResolvedValue(
      payoutStub({ poolMember: { user: { name: 'Fulano', city: null, pixKeyType: null, pixKeyEncrypted: null } } }),
    )
    const caller = createCaller(buildContext({ poolPayout: { findUnique } }, OWNER_ID))

    const result = await caller.payout.pixPayload({ payoutId: 'payout-1' })
    expect(result).toBeNull()
  })

  it('rateio inexistente é NOT_FOUND', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ poolPayout: { findUnique } }, OWNER_ID))

    await expect(caller.payout.pixPayload({ payoutId: 'nao-existe' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('pool.payout.list — memberId/isMine (Addendum v2 §1)', () => {
  function payoutRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'payout-1',
      poolMemberId: 'member-1',
      contestId: 'contest-1',
      sharesRatio: { toString: () => '0.50000000' },
      amountCents: 500n,
      status: PayoutStatus.PENDING,
      poolMember: { userId: MEMBER_ID_USER, user: { name: 'Fulano' }, guestName: null },
      ...overrides,
    }
  }

  it('isMine é true na linha do próprio membro e false na dos outros', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      members: [{ userId: MEMBER_ID_USER, status: MemberStatus.CONFIRMED }],
    })
    const payoutFindMany = vi.fn().mockResolvedValue([
      payoutRow(),
      payoutRow({
        id: 'payout-2',
        poolMemberId: 'member-2',
        poolMember: { userId: OTHER_USER_ID, user: { name: 'Ciclano' }, guestName: null },
      }),
    ])
    const contestFindMany = vi.fn().mockResolvedValue([{ id: 'contest-1', number: 2800 }])
    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          poolPayout: { findMany: payoutFindMany },
          contest: { findMany: contestFindMany },
        },
        MEMBER_ID_USER,
      ),
    )

    const rows = await caller.payout.list({ poolId: 'pool-1' })
    expect(rows.find((row) => row.id === 'payout-1')).toMatchObject({ memberId: 'member-1', isMine: true })
    expect(rows.find((row) => row.id === 'payout-2')).toMatchObject({ memberId: 'member-2', isMine: false })
  })

  it('para o dono vendo o rateio (ele não é um PoolMember), isMine é sempre false', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, members: [] })
    const payoutFindMany = vi.fn().mockResolvedValue([payoutRow()])
    const contestFindMany = vi.fn().mockResolvedValue([{ id: 'contest-1', number: 2800 }])
    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          poolPayout: { findMany: payoutFindMany },
          contest: { findMany: contestFindMany },
        },
        OWNER_ID,
      ),
    )

    const rows = await caller.payout.list({ poolId: 'pool-1' })
    expect(rows[0]?.isMine).toBe(false)
  })
})

describe('produtor de eventos pool-notify — falha ao enfileirar NUNCA derruba a mutation (item 1 do escopo)', () => {
  it('pool.join: Redis fora do ar não impede o participante de entrar, e o evento member.joined é o que se tentou enfileirar', async () => {
    vi.mocked(enqueuePoolNotify).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const poolFindUnique = vi.fn().mockResolvedValue({
      id: 'pool-1',
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
      inviteExpiresAt: null,
    })
    const memberFindUnique = vi.fn().mockResolvedValue(null)
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 0 } })
    const count = vi.fn().mockResolvedValue(1)
    const create = vi.fn().mockResolvedValue({ id: 'new-member' })

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          poolMember: { findUnique: memberFindUnique, aggregate, count, create },
          ...noActiveSubscriptionStub(),
        },
        MEMBER_ID_USER,
      ),
    )

    const result = await caller.join({ inviteCode: 'CODE1', shares: 1 })
    expect(result).toEqual({ poolId: 'pool-1', memberId: 'new-member' })
    expect(enqueuePoolNotify).toHaveBeenCalledWith({
      event: 'member.joined',
      poolId: 'pool-1',
      poolMemberId: 'new-member',
    })
  })

  it('pool.payments.declare: Redis rejeitando não impede o participante de declarar o pagamento (dinheiro/estado já gravados)', async () => {
    vi.mocked(enqueuePoolNotify).mockRejectedValueOnce(new Error('timeout'))

    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      poolId: 'pool-1',
      userId: MEMBER_ID_USER,
      status: MemberStatus.JOINED,
      amountCents: 500n,
    })
    const paymentCreate = vi.fn().mockResolvedValue({ id: 'payment-1' })
    const memberUpdate = vi.fn().mockResolvedValue({ status: MemberStatus.PAID })
    const caller = createCaller(
      buildContext(
        { poolMember: { findUnique, update: memberUpdate }, poolPayment: { create: paymentCreate } },
        MEMBER_ID_USER,
      ),
    )

    const result = await caller.payments.declare({ memberId: 'member-1' })
    expect(result).toEqual({ status: MemberStatus.PAID })
  })

  it('pool.members.confirmPayment: Redis rejeitando não impede o dono de confirmar o pagamento', async () => {
    vi.mocked(enqueuePoolNotify).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      poolId: 'pool-1',
      status: MemberStatus.PAID,
      amountCents: 500n,
      pool: { ownerId: OWNER_ID },
    })
    const paymentCreate = vi.fn().mockResolvedValue({ id: 'payment-1' })
    const memberUpdate = vi.fn().mockResolvedValue({ status: MemberStatus.CONFIRMED })
    const caller = createCaller(
      buildContext(
        { poolMember: { findUnique, update: memberUpdate }, poolPayment: { create: paymentCreate } },
        OWNER_ID,
      ),
    )

    const result = await caller.members.confirmPayment({ memberId: 'member-1' })
    expect(result).toEqual({ status: MemberStatus.CONFIRMED })
  })
})

describe('pool.payout.compute / markPaid — autorização (dono)', () => {
  it('payout.compute: não-dono recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'pool-1', ownerId: OWNER_ID, totalShares: 10 })
    const caller = createCaller(buildContext({ pool: { findUnique } }, OTHER_USER_ID))

    await expect(caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('payout.markPaid: não-dono recebe FORBIDDEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: PayoutStatus.PENDING, pool: { ownerId: OWNER_ID } })
    const update = vi.fn()
    const caller = createCaller(buildContext({ poolPayout: { findUnique, update } }, OTHER_USER_ID))

    await expect(caller.payout.markPaid({ payoutId: 'payout-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(update).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// inviteCode nunca vaza para quem não é dono (invariante 5)
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.detail — inviteCode: null para membro comum (invariante 5, regressão do contrato)', () => {
  const basePool = {
    id: 'pool-1',
    ownerId: OWNER_ID,
    name: 'Bolão da galera',
    status: PoolStatus.OPEN,
    description: null,
    inviteCode: 'SEGREDO123',
    inviteExpiresAt: null,
    receiptUrl: null,
    ownerPixKeyType: null,
    ownerPixKeyEnc: null,
    contestFrom: 2800,
    contestTo: 2800,
    totalShares: 10,
    totalCostCents: 1000n,
    shareValueCents: 100n,
    lottery: { slug: 'megasena', name: 'Mega-Sena' },
    // Addendum v2 §3: `detail` (assim como `PoolCard`) agora seleciona `owner.name`.
    owner: { name: 'Dono do Bolão' },
    bets: [],
  }

  it('dono recebe o inviteCode de verdade', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ...basePool,
      members: [
        {
          id: 'm1',
          userId: OWNER_ID,
          guestName: null,
          shares: 1,
          amountCents: 100n,
          status: MemberStatus.JOINED,
          user: { name: 'Dono' },
          payments: [],
        },
      ],
    })
    const caller = createCaller(buildContext({ pool: { findUnique } }, OWNER_ID))

    const result = await caller.detail({ poolId: 'pool-1' })
    expect(result.inviteCode).toBe('SEGREDO123')
    expect(result.role).toBe('OWNER')
  })

  it('membro comum recebe inviteCode: null — nunca a credencial de verdade em nenhum lugar da resposta', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ...basePool,
      members: [
        {
          id: 'm1',
          userId: MEMBER_ID_USER,
          guestName: null,
          shares: 1,
          amountCents: 100n,
          status: MemberStatus.JOINED,
          user: { name: 'Participante' },
          payments: [],
        },
      ],
    })
    const caller = createCaller(buildContext({ pool: { findUnique } }, MEMBER_ID_USER))

    const result = await caller.detail({ poolId: 'pool-1' })
    expect(result.inviteCode).toBeNull()
    expect(result.role).toBe('MEMBER')
    expect(stringifyWithBigInt(result)).not.toContain('SEGREDO123')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Venda de cotas não ultrapassa o total (invariante 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.join — não vende cota a mais (invariante 3)', () => {
  function poolStub(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pool-1',
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
      inviteExpiresAt: null,
      ...overrides,
    }
  }

  it('rejeita quando a soma das cotas ultrapassaria o total (recontagem dentro da transação)', async () => {
    const findUnique = vi.fn().mockResolvedValue(poolStub())
    const memberFindUnique = vi.fn().mockResolvedValue(null)
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 4 } })
    const count = vi.fn().mockResolvedValue(1)
    const create = vi.fn()

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique },
          poolMember: { findUnique: memberFindUnique, aggregate, count, create },
          ...noActiveSubscriptionStub(),
        },
        MEMBER_ID_USER,
      ),
    )

    // 4 já tomadas + 2 pedidas > 5 do total.
    await expect(caller.join({ inviteCode: 'CODE1', shares: 2 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })

  it('aceita quando cabe exatamente no restante (a última cota disponível)', async () => {
    const findUnique = vi.fn().mockResolvedValue(poolStub())
    const memberFindUnique = vi.fn().mockResolvedValue(null)
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 4 } })
    const count = vi.fn().mockResolvedValue(1)
    const create = vi.fn().mockResolvedValue({ id: 'new-member' })

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique },
          poolMember: { findUnique: memberFindUnique, aggregate, count, create },
          ...noActiveSubscriptionStub(),
        },
        MEMBER_ID_USER,
      ),
    )

    const result = await caller.join({ inviteCode: 'CODE1', shares: 1 })
    expect(result).toEqual({ poolId: 'pool-1', memberId: 'new-member' })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('já ser membro ativo do bolão retorna CONFLICT (não cria uma segunda linha)', async () => {
    const findUnique = vi.fn().mockResolvedValue(poolStub())
    const memberFindUnique = vi.fn().mockResolvedValue({ id: 'existing-member', status: MemberStatus.JOINED })
    const create = vi.fn()
    const caller = createCaller(
      buildContext(
        { pool: { findUnique }, poolMember: { findUnique: memberFindUnique, create }, ...noActiveSubscriptionStub() },
        MEMBER_ID_USER,
      ),
    )

    await expect(caller.join({ inviteCode: 'CODE1', shares: 1 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(create).not.toHaveBeenCalled()
  })

  it('convite expirado rejeita com BAD_REQUEST antes de qualquer escrita', async () => {
    const findUnique = vi.fn().mockResolvedValue(poolStub({ inviteExpiresAt: new Date('2000-01-01T00:00:00Z') }))
    const create = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique }, poolMember: { create } }, MEMBER_ID_USER))

    await expect(caller.join({ inviteCode: 'CODE1', shares: 1 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('pool.members.addGuest — não vende cota a mais (invariante 3)', () => {
  it('rejeita quando ultrapassaria o total de cotas', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
    })
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 5 } })
    const count = vi.fn().mockResolvedValue(2)
    const create = vi.fn()
    const caller = createCaller(
      buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { aggregate, count, create } }, OWNER_ID),
    )

    await expect(
      caller.members.addGuest({ poolId: 'pool-1', guestName: 'Zé', shares: 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })

  it('só o dono pode adicionar convidados', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
    })
    const create = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { create } }, OTHER_USER_ID))

    await expect(
      caller.members.addGuest({ poolId: 'pool-1', guestName: 'Zé', shares: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(create).not.toHaveBeenCalled()
  })

  it('bolão fora de "aberto" não aceita novos participantes', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.DRAFT,
      totalShares: 5,
      shareValueCents: 100n,
    })
    const create = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { create } }, OWNER_ID))

    await expect(
      caller.members.addGuest({ poolId: 'pool-1', guestName: 'Zé', shares: 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(create).not.toHaveBeenCalled()
  })

  it('bloqueia quando o bolão já está no teto de participantes do plano do dono (G3)', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 100,
      shareValueCents: 100n,
    })
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 2 } })
    const count = vi.fn().mockResolvedValue(4) // Free: maxPoolParticipants = 5; +1 (dono) já bate o teto.
    const create = vi.fn()
    const ctx = buildContext({ pool: { findUnique: poolFindUnique }, poolMember: { aggregate, count, create } }, OWNER_ID)
    ctx.getEntitlements = () => Promise.resolve(getEntitlements('free'))
    const caller = createCaller(ctx)

    await expect(
      caller.members.addGuest({ poolId: 'pool-1', guestName: 'Zé', shares: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(create).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-1 — pool.join / members.addGuest travam a linha do Pool antes de recontar
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.join / pool.members.addGuest — travam a linha do Pool com FOR UPDATE antes de recontar cotas (achado de auditoria J-1)', () => {
  it('pool.join emite SELECT ... FOR UPDATE no Pool ANTES de reagregar as cotas (prova a serialização)', async () => {
    const callOrder: string[] = []
    const findUnique = vi.fn().mockResolvedValue({
      id: 'pool-1',
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
      inviteExpiresAt: null,
    })
    const memberFindUnique = vi.fn().mockResolvedValue(null)
    const queryRaw = vi.fn().mockImplementation(async () => {
      callOrder.push('lock')
      return [{ id: 'pool-1' }]
    })
    const aggregate = vi.fn().mockImplementation(async () => {
      callOrder.push('aggregate')
      return { _sum: { shares: 0 } }
    })
    const count = vi.fn().mockResolvedValue(1)
    const create = vi.fn().mockResolvedValue({ id: 'new-member' })

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique },
          poolMember: { findUnique: memberFindUnique, aggregate, count, create },
          $queryRaw: queryRaw,
          ...noActiveSubscriptionStub(),
        },
        MEMBER_ID_USER,
      ),
    )

    await caller.join({ inviteCode: 'CODE1', shares: 1 })

    expect(queryRaw).toHaveBeenCalledTimes(1)
    const call = queryRaw.mock.calls[0] as unknown as [readonly string[], string]
    expect(call[0].join('')).toContain('FOR UPDATE')
    expect(call[0].join('')).toContain('"Pool"')
    expect(call[1]).toBe('pool-1')
    // A trava precisa ser a PRIMEIRA coisa dentro da transação — se a recontagem rodasse
    // antes, a corrida que motivou o achado J-1 continuaria possível.
    expect(callOrder).toEqual(['lock', 'aggregate'])
  })

  it('members.addGuest emite SELECT ... FOR UPDATE no Pool ANTES de reagregar as cotas', async () => {
    const callOrder: string[] = []
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.OPEN,
      totalShares: 5,
      shareValueCents: 100n,
    })
    const queryRaw = vi.fn().mockImplementation(async () => {
      callOrder.push('lock')
      return [{ id: 'pool-1' }]
    })
    const aggregate = vi.fn().mockImplementation(async () => {
      callOrder.push('aggregate')
      return { _sum: { shares: 0 } }
    })
    const count = vi.fn().mockResolvedValue(1)
    const create = vi.fn().mockResolvedValue({ id: 'new-member' })

    const caller = createCaller(
      buildContext(
        { pool: { findUnique: poolFindUnique }, poolMember: { aggregate, count, create }, $queryRaw: queryRaw },
        OWNER_ID,
      ),
    )

    await caller.members.addGuest({ poolId: 'pool-1', guestName: 'Zé', shares: 1 })

    expect(queryRaw).toHaveBeenCalledTimes(1)
    const call = queryRaw.mock.calls[0] as unknown as [readonly string[], string]
    expect(call[0].join('')).toContain('FOR UPDATE')
    expect(call[1]).toBe('pool-1')
    expect(callOrder).toEqual(['lock', 'aggregate'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-3 — receiptUrl/proofUrl exigem URL absoluta https://
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.attachReceipt — exige URL absoluta https:// (achado de auditoria J-3)', () => {
  it.each([
    ['http://exemplo.com/comprovante.png', 'http em vez de https'],
    ['javascript:alert(1)', 'esquema javascript:'],
    ['data:text/html,<script>alert(1)</script>', 'esquema data:'],
    ['/comprovante.png', 'caminho relativo, não é URL absoluta'],
    ['nao-e-uma-url', 'string qualquer'],
  ])('rejeita "%s" (%s) com BAD_REQUEST, sem gravar nada', async (badUrl) => {
    const update = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique: vi.fn().mockResolvedValue({ ownerId: OWNER_ID }), update } }, OWNER_ID))

    await expect(caller.attachReceipt({ poolId: 'pool-1', receiptUrl: badUrl })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('aceita URL https:// absoluta válida', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID })
    const update = vi.fn().mockResolvedValue({ receiptUploadedAt: new Date('2026-01-01') })
    const caller = createCaller(buildContext({ pool: { findUnique, update } }, OWNER_ID))

    const result = await caller.attachReceipt({ poolId: 'pool-1', receiptUrl: 'https://r2.example.com/comprovante.png' })
    expect(result).toEqual({ ok: true })
  })
})

describe('pool.payments.declare — proofUrl exige URL absoluta https:// quando informado (achado de auditoria J-3)', () => {
  function declareMemberStub() {
    return {
      id: 'member-1',
      poolId: 'pool-1',
      userId: MEMBER_ID_USER,
      status: MemberStatus.JOINED,
      amountCents: 500n,
    }
  }

  it.each(['javascript:alert(document.cookie)', 'http://phishing.example.com/pix'])(
    'rejeita proofUrl "%s"',
    async (badUrl) => {
      const findUnique = vi.fn().mockResolvedValue(declareMemberStub())
      const create = vi.fn()
      const caller = createCaller(buildContext({ poolMember: { findUnique }, poolPayment: { create } }, MEMBER_ID_USER))

      await expect(caller.payments.declare({ memberId: 'member-1', proofUrl: badUrl })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('aceita proofUrl https:// válido e continua funcionando sem proofUrl (campo opcional)', async () => {
    const findUnique = vi.fn().mockResolvedValue(declareMemberStub())
    const paymentCreate = vi.fn().mockResolvedValue({ id: 'payment-1' })
    const memberUpdate = vi.fn().mockResolvedValue({ status: MemberStatus.PAID })
    const caller = createCaller(
      buildContext({ poolMember: { findUnique, update: memberUpdate }, poolPayment: { create: paymentCreate } }, MEMBER_ID_USER),
    )

    const withProof = await caller.payments.declare({ memberId: 'member-1', proofUrl: 'https://r2.example.com/comprovante.jpg' })
    expect(withProof).toEqual({ status: MemberStatus.PAID })

    const withoutProof = await caller.payments.declare({ memberId: 'member-1' })
    expect(withoutProof).toEqual({ status: MemberStatus.PAID })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-4 — proofUrl só para o dono ou o próprio membro
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.detail — proofUrl só sai para o dono ou para o próprio membro (achado de auditoria J-4; o contrato listava sem essa restrição — bug do contrato, não do código)', () => {
  const basePool = {
    id: 'pool-1',
    ownerId: OWNER_ID,
    name: 'Bolão da galera',
    status: PoolStatus.OPEN,
    description: null,
    inviteCode: 'SEGREDO123',
    inviteExpiresAt: null,
    receiptUrl: null,
    ownerPixKeyType: null,
    ownerPixKeyEnc: null,
    contestFrom: 2800,
    contestTo: 2800,
    totalShares: 10,
    totalCostCents: 1000n,
    shareValueCents: 100n,
    lottery: { slug: 'megasena', name: 'Mega-Sena' },
    owner: { name: 'Dono do Bolão' },
    bets: [],
  }

  function membersFixture() {
    return [
      {
        id: 'm-self',
        userId: MEMBER_ID_USER,
        guestName: null,
        shares: 1,
        amountCents: 100n,
        status: MemberStatus.PAID,
        user: { name: 'Eu mesmo' },
        payments: [{ confirmedAt: new Date('2026-01-01'), proofUrl: 'https://r2.example.com/meu-comprovante.png' }],
      },
      {
        id: 'm-other',
        userId: OTHER_USER_ID,
        guestName: null,
        shares: 2,
        amountCents: 200n,
        status: MemberStatus.PAID,
        user: { name: 'Outro Participante' },
        payments: [{ confirmedAt: new Date('2026-01-01'), proofUrl: 'https://r2.example.com/comprovante-alheio.png' }],
      },
    ]
  }

  it('participante comum vê o PRÓPRIO proofUrl mas nunca o de outro membro (documento com dados pessoais)', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...basePool, members: membersFixture() })
    const caller = createCaller(buildContext({ pool: { findUnique } }, MEMBER_ID_USER))

    const result = await caller.detail({ poolId: 'pool-1' })
    const self = result.members.find((member) => member.id === 'm-self')
    const other = result.members.find((member) => member.id === 'm-other')

    expect(self?.proofUrl).toBe('https://r2.example.com/meu-comprovante.png')
    expect(other?.proofUrl).toBeNull()
    expect(stringifyWithBigInt(result)).not.toContain('comprovante-alheio')
  })

  it('o dono vê o proofUrl de todos os membros (precisa conciliar todos os pagamentos)', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...basePool, members: membersFixture() })
    const caller = createCaller(buildContext({ pool: { findUnique } }, OWNER_ID))

    const result = await caller.detail({ poolId: 'pool-1' })
    expect(result.members.find((member) => member.id === 'm-self')?.proofUrl).toBe(
      'https://r2.example.com/meu-comprovante.png',
    )
    expect(result.members.find((member) => member.id === 'm-other')?.proofUrl).toBe(
      'https://r2.example.com/comprovante-alheio.png',
    )
  })

  it('amountCents continua visível pra todo mundo — é função determinística de shares × shareValueCents, ambos já públicos no mesmo payload', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...basePool, members: membersFixture() })
    const caller = createCaller(buildContext({ pool: { findUnique } }, MEMBER_ID_USER))

    const result = await caller.detail({ poolId: 'pool-1' })
    expect(result.members.find((member) => member.id === 'm-other')?.amountCents).toBe(200n)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-5 — members.remove não deixa apagar quem já pagou/ganhou
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.members.remove — trava de estado (achado de auditoria J-5)', () => {
  it('bloqueia remover participante CONFIRMED mesmo com o bolão ainda OPEN', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      status: MemberStatus.CONFIRMED,
      pool: { ownerId: OWNER_ID, status: PoolStatus.OPEN },
    })
    const update = vi.fn()
    const caller = createCaller(buildContext({ poolMember: { findUnique, update } }, OWNER_ID))

    await expect(caller.members.remove({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(update).not.toHaveBeenCalled()
  })

  it.each([PoolStatus.BET_PLACED, PoolStatus.SETTLED])(
    'bloqueia remover QUALQUER participante depois que o bolão passou de CLOSED (status %s), mesmo sem CONFIRMED',
    async (poolStatus) => {
      const findUnique = vi.fn().mockResolvedValue({
        status: MemberStatus.JOINED,
        pool: { ownerId: OWNER_ID, status: poolStatus },
      })
      const update = vi.fn()
      const caller = createCaller(buildContext({ poolMember: { findUnique, update } }, OWNER_ID))

      await expect(caller.members.remove({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(update).not.toHaveBeenCalled()
    },
  )

  it('permite remover participante JOINED/PAID enquanto o bolão ainda está OPEN (gestão normal de convite)', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      status: MemberStatus.PAID,
      pool: { ownerId: OWNER_ID, status: PoolStatus.OPEN },
    })
    const update = vi.fn().mockResolvedValue({})
    const caller = createCaller(buildContext({ poolMember: { findUnique, update } }, OWNER_ID))

    const result = await caller.members.remove({ memberId: 'member-1' })
    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { status: MemberStatus.REMOVED } })
  })

  it('só o dono pode remover (autorização continua valendo)', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      status: MemberStatus.JOINED,
      pool: { ownerId: OWNER_ID, status: PoolStatus.OPEN },
    })
    const update = vi.fn()
    const caller = createCaller(buildContext({ poolMember: { findUnique, update } }, OTHER_USER_ID))

    await expect(caller.members.remove({ memberId: 'member-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(update).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de estados — BET_PLACED exige receiptUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.updateStatus — máquina de estados', () => {
  it('CLOSED -> BET_PLACED sem receiptUrl é rejeitado', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, status: PoolStatus.CLOSED, receiptUrl: null })
    const update = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique, update } }, OWNER_ID))

    await expect(caller.updateStatus({ poolId: 'pool-1', status: PoolStatus.BET_PLACED })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('CLOSED -> BET_PLACED com receiptUrl já anexado é aceito', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      status: PoolStatus.CLOSED,
      receiptUrl: 'https://r2.example.com/comprovante.png',
    })
    const update = vi.fn().mockResolvedValue({ status: PoolStatus.BET_PLACED })
    const caller = createCaller(buildContext({ pool: { findUnique, update } }, OWNER_ID))

    const result = await caller.updateStatus({ poolId: 'pool-1', status: PoolStatus.BET_PLACED })
    expect(result.status).toBe(PoolStatus.BET_PLACED)
  })

  it('transição ilegal pulando estado (DRAFT -> BET_PLACED) é rejeitada mesmo com receiptUrl', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: OWNER_ID, status: PoolStatus.DRAFT, receiptUrl: 'x' })
    const update = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique, update } }, OWNER_ID))

    await expect(caller.updateStatus({ poolId: 'pool-1', status: PoolStatus.BET_PLACED })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(update).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// payout.compute — idempotente (invariante 6)
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.compute — idempotente, sem duplicar nem inflar (invariante 6)', () => {
  it('rodar duas vezes devolve o mesmo resultado e a segunda vez só faz UPDATE (nunca CREATE de novo)', async () => {
    const pool = { id: 'pool-1', ownerId: OWNER_ID, totalShares: 10, lotteryId: 'lottery-1', contestFrom: 2800, contestTo: 2800 }
    const poolFindUnique = vi.fn().mockResolvedValue(pool)
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-1', number: 2800 })
    // Achado J-6: só CONFIRMED entra no rateio — os dois membros aqui precisam estar
    // CONFIRMED pra este teste de idempotência continuar valendo a pena.
    const members = [
      { id: 'member-1', shares: 6, status: MemberStatus.CONFIRMED },
      { id: 'member-2', shares: 4, status: MemberStatus.CONFIRMED },
    ]
    const memberFindMany = vi.fn().mockResolvedValue(members)
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: 1000n } })

    const payoutCreate = vi.fn().mockResolvedValue({})
    const payoutUpdate = vi.fn().mockResolvedValue({})
    let existingRows: Array<{ poolMemberId: string; status: PayoutStatus }> = []
    const payoutFindMany = vi.fn().mockImplementation(async () => existingRows)

    const ctx = buildContext(
      {
        pool: { findUnique: poolFindUnique },
        contest: { findUnique: contestFindUnique },
        poolMember: { findMany: memberFindMany },
        betCheck: { aggregate: betCheckAggregate },
        poolPayout: { create: payoutCreate, update: payoutUpdate, findMany: payoutFindMany },
      },
      OWNER_ID,
    )
    const caller = createCaller(ctx)

    const first = await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })
    expect(first.shares).toEqual([
      { memberId: 'member-1', shares: 6, amountCents: 600n },
      { memberId: 'member-2', shares: 4, amountCents: 400n },
    ])
    expect(first.remainderCents).toBe(0n)
    expect(first.totalCents).toBe(1000n)
    expect(first.unconfirmedShares).toBe(0)
    expect(payoutCreate).toHaveBeenCalledTimes(2)
    expect(payoutUpdate).not.toHaveBeenCalled()

    // A partir daqui, os dois payouts já existem no "banco" (ainda PENDING) — simula o
    // recálculo.
    existingRows = [
      { poolMemberId: 'member-1', status: PayoutStatus.PENDING },
      { poolMemberId: 'member-2', status: PayoutStatus.PENDING },
    ]
    payoutCreate.mockClear()
    payoutUpdate.mockClear()

    const second = await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })
    expect(second).toEqual(first)
    expect(payoutCreate).not.toHaveBeenCalled()
    expect(payoutUpdate).toHaveBeenCalledTimes(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-1 (degradação) — payout.compute nunca vira 500 cru em dado legado inconsistente
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.compute — degrada com elegância se a invariante de cotas foi violada por dado legado (achado de auditoria J-1)', () => {
  it('soma de cotas CONFIRMED acima do totalShares do bolão nunca vira 500 cru — TRPCError tratado, em português', async () => {
    const pool = { id: 'pool-1', ownerId: OWNER_ID, totalShares: 5, lotteryId: 'lottery-1', contestFrom: 2800, contestTo: 2800 }
    const poolFindUnique = vi.fn().mockResolvedValue(pool)
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-1', number: 2800 })
    // Dado legado inconsistente: 4 + 4 = 8 cotas CONFIRMED num bolão de totalShares: 5 — só
    // podia acontecer com dado gravado ANTES da trava do achado J-1 (`FOR UPDATE`).
    const memberFindMany = vi.fn().mockResolvedValue([
      { id: 'member-1', shares: 4, status: MemberStatus.CONFIRMED },
      { id: 'member-2', shares: 4, status: MemberStatus.CONFIRMED },
    ])
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: 1000n } })
    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          contest: { findUnique: contestFindUnique },
          poolMember: { findMany: memberFindMany },
          betCheck: { aggregate: betCheckAggregate },
        },
        OWNER_ID,
      ),
    )

    await expect(caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('inconsistentes'),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-2 — contestId validado contra a modalidade e a faixa do bolão
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.compute — contestId validado contra modalidade e faixa do bolão (achado de auditoria J-2)', () => {
  function poolStub() {
    return { id: 'pool-1', ownerId: OWNER_ID, totalShares: 10, lotteryId: 'lottery-megasena', contestFrom: 2800, contestTo: 2805 }
  }

  it('concurso de OUTRA modalidade é rejeitado com BAD_REQUEST, sem criar PoolPayout nem notificar', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-x', lotteryId: 'lottery-lotofacil', number: 2800 })
    const payoutCreate = vi.fn()
    const caller = createCaller(
      buildContext(
        { pool: { findUnique: poolFindUnique }, contest: { findUnique: contestFindUnique }, poolPayout: { create: payoutCreate } },
        OWNER_ID,
      ),
    )

    await expect(caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-x' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(payoutCreate).not.toHaveBeenCalled()
    expect(enqueuePoolNotify).not.toHaveBeenCalled()
  })

  it('concurso da MESMA modalidade mas FORA da faixa contestFrom..contestTo é rejeitado', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-y', lotteryId: 'lottery-megasena', number: 9999 })
    const payoutCreate = vi.fn()
    const caller = createCaller(
      buildContext(
        { pool: { findUnique: poolFindUnique }, contest: { findUnique: contestFindUnique }, poolPayout: { create: payoutCreate } },
        OWNER_ID,
      ),
    )

    await expect(caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-y' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(payoutCreate).not.toHaveBeenCalled()
  })

  it('concurso válido mas SEM prêmio (grossPrizeCents 0) grava a conferência mas NÃO dispara "bolão premiado"', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-megasena', number: 2801 })
    const memberFindMany = vi.fn().mockResolvedValue([{ id: 'member-1', shares: 10, status: MemberStatus.CONFIRMED }])
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: null } })
    const payoutFindMany = vi.fn().mockResolvedValue([])
    const payoutCreate = vi.fn().mockResolvedValue({})
    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          contest: { findUnique: contestFindUnique },
          poolMember: { findMany: memberFindMany },
          betCheck: { aggregate: betCheckAggregate },
          poolPayout: { findMany: payoutFindMany, create: payoutCreate },
        },
        OWNER_ID,
      ),
    )

    const result = await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })
    expect(result.totalCents).toBe(0n)
    expect(payoutCreate).toHaveBeenCalledTimes(1)
    expect(enqueuePoolNotify).not.toHaveBeenCalled()
  })

  it('concurso válido COM prêmio de verdade notifica "payout.computed" normalmente', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue(poolStub())
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-megasena', number: 2800 })
    const memberFindMany = vi.fn().mockResolvedValue([{ id: 'member-1', shares: 10, status: MemberStatus.CONFIRMED }])
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: 5000n } })
    const payoutFindMany = vi.fn().mockResolvedValue([])
    const payoutCreate = vi.fn().mockResolvedValue({})
    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          contest: { findUnique: contestFindUnique },
          poolMember: { findMany: memberFindMany },
          betCheck: { aggregate: betCheckAggregate },
          poolPayout: { findMany: payoutFindMany, create: payoutCreate },
        },
        OWNER_ID,
      ),
    )

    await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })
    expect(enqueuePoolNotify).toHaveBeenCalledWith({ event: 'payout.computed', poolId: 'pool-1', contestId: 'contest-1' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado J-6 — rateio considera só CONFIRMED; não-confirmado fica visível, não redistribuído
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.compute — só CONFIRMED entra no rateio; cotas não confirmadas ficam visíveis, nunca redistribuídas (achado de auditoria J-6)', () => {
  it('membro JOINED/PAID (nunca CONFIRMED) fica fora de result.shares; aparece em unconfirmedShares/unconfirmedMemberIds', async () => {
    const pool = { id: 'pool-1', ownerId: OWNER_ID, totalShares: 10, lotteryId: 'lottery-1', contestFrom: 2800, contestTo: 2800 }
    const poolFindUnique = vi.fn().mockResolvedValue(pool)
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-1', number: 2800 })
    const members = [
      { id: 'member-confirmed', shares: 6, status: MemberStatus.CONFIRMED },
      { id: 'member-paid-not-confirmed', shares: 3, status: MemberStatus.PAID },
      { id: 'member-joined', shares: 1, status: MemberStatus.JOINED },
    ]
    const memberFindMany = vi.fn().mockResolvedValue(members)
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: 1000n } })
    const payoutFindMany = vi.fn().mockResolvedValue([])
    const payoutCreate = vi.fn().mockResolvedValue({})

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          contest: { findUnique: contestFindUnique },
          poolMember: { findMany: memberFindMany },
          betCheck: { aggregate: betCheckAggregate },
          poolPayout: { findMany: payoutFindMany, create: payoutCreate },
        },
        OWNER_ID,
      ),
    )

    const result = await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })

    // Só quem CONFIRMOU entra na conta — 6/10 (totalShares DO BOLÃO, não da soma de quem
    // confirmou) × 1000 = 600. As 4 cotas não confirmadas (3 + 1) caem no resto do
    // organizador, exatamente como cota nunca vendida — nunca redistribuídas pra quem
    // confirmou.
    expect(result.shares).toEqual([{ memberId: 'member-confirmed', shares: 6, amountCents: 600n }])
    expect(result.remainderCents).toBe(400n)
    expect(result.unconfirmedShares).toBe(4)
    expect([...result.unconfirmedMemberIds].sort()).toEqual(['member-joined', 'member-paid-not-confirmed'])
    expect(payoutCreate).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado menor — recalcular nunca sobrescreve amountCents de linha já paga/declarada
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.compute — recalcular NUNCA sobrescreve amountCents de uma linha já paga/declarada (achado menor)', () => {
  it('linha DECLARED_PAID é preservada; só a linha ainda PENDING é atualizada', async () => {
    const pool = { id: 'pool-1', ownerId: OWNER_ID, totalShares: 10, lotteryId: 'lottery-1', contestFrom: 2800, contestTo: 2800 }
    const poolFindUnique = vi.fn().mockResolvedValue(pool)
    const contestFindUnique = vi.fn().mockResolvedValue({ id: 'contest-1', lotteryId: 'lottery-1', number: 2800 })
    const members = [
      { id: 'member-paid', shares: 6, status: MemberStatus.CONFIRMED },
      { id: 'member-pending', shares: 4, status: MemberStatus.CONFIRMED },
    ]
    const memberFindMany = vi.fn().mockResolvedValue(members)
    // Prêmio recalculado diferente do que já foi de fato pago via Pix pro member-paid.
    const betCheckAggregate = vi.fn().mockResolvedValue({ _sum: { prizeCents: 2000n } })
    const payoutFindMany = vi.fn().mockResolvedValue([
      { poolMemberId: 'member-paid', status: PayoutStatus.DECLARED_PAID },
      { poolMemberId: 'member-pending', status: PayoutStatus.PENDING },
    ])
    const payoutCreate = vi.fn()
    const payoutUpdate = vi.fn().mockResolvedValue({})

    const caller = createCaller(
      buildContext(
        {
          pool: { findUnique: poolFindUnique },
          contest: { findUnique: contestFindUnique },
          poolMember: { findMany: memberFindMany },
          betCheck: { aggregate: betCheckAggregate },
          poolPayout: { findMany: payoutFindMany, create: payoutCreate, update: payoutUpdate },
        },
        OWNER_ID,
      ),
    )

    await caller.payout.compute({ poolId: 'pool-1', contestId: 'contest-1' })

    expect(payoutCreate).not.toHaveBeenCalled()
    expect(payoutUpdate).toHaveBeenCalledTimes(1)
    expect(payoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { poolMemberId_contestId: { poolMemberId: 'member-pending', contestId: 'contest-1' } },
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// joinPreview não vaza existência (invariante 5)
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.joinPreview — código inexistente não vaza existência (invariante 5)', () => {
  it('código inexistente retorna NOT_FOUND genérico, sem tocar em poolMember', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const aggregate = vi.fn()
    const caller = createCaller(buildContext({ pool: { findUnique }, poolMember: { aggregate } }, OWNER_ID))

    await expect(caller.joinPreview({ inviteCode: 'NAO-EXISTE' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('convite existente mas expirado retorna expired:true — nunca lança erro nem some com os dados', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      name: 'Bolão da galera',
      status: PoolStatus.OPEN,
      totalShares: 10,
      shareValueCents: 100n,
      contestFrom: 2800,
      contestTo: 2800,
      inviteExpiresAt: new Date('2020-01-01T00:00:00Z'),
      owner: { name: 'Dono' },
      lottery: { slug: 'megasena', name: 'Mega-Sena' },
    })
    const aggregate = vi.fn().mockResolvedValue({ _sum: { shares: 3 } })
    const caller = createCaller(buildContext({ pool: { findUnique }, poolMember: { aggregate } }, OWNER_ID))

    const result = await caller.joinPreview({ inviteCode: 'EXPIRADO' })
    expect(result.expired).toBe(true)
    expect(result.poolName).toBe('Bolão da galera')
    expect(result.sharesAvailable).toBe(7)
  })

  it('é PÚBLICO de verdade — funciona sem sessão', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const ctx = buildContext({ pool: { findUnique } })
    ctx.session = null

    const caller = createCaller(ctx)
    await expect(caller.joinPreview({ inviteCode: 'QUALQUER' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// pool.create
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.create', () => {
  const createInput = {
    lotterySlug: 'megasena' as const,
    name: 'Bolão da firma',
    contestFrom: 2800,
    contestTo: 2800,
    totalShares: 3,
    totalCostCents: 1000n,
    rulesAccepted: true as const,
  }

  it('cria o bolão, gera inviteCode e devolve o ShareMath calculado (arredonda pra cima)', async () => {
    const lotteryFindUnique = vi.fn().mockResolvedValue({ id: 'lottery-1' })
    const poolCount = vi.fn().mockResolvedValue(0)
    const poolFindUniqueForCode = vi.fn().mockResolvedValue(null)
    const poolCreate = vi.fn().mockResolvedValue({ id: 'pool-new' })
    const userFindUniqueOrThrow = vi.fn().mockResolvedValue({ pixKeyEncrypted: 'v1:a:b:c', pixKeyType: PixKeyType.EMAIL })

    const ctx = buildContext(
      {
        lottery: { findUnique: lotteryFindUnique },
        pool: { count: poolCount, findUnique: poolFindUniqueForCode, create: poolCreate },
        user: { findUniqueOrThrow: userFindUniqueOrThrow },
      },
      OWNER_ID,
    )
    const caller = createCaller(ctx)

    const result = await caller.create(createInput)

    expect(result.poolId).toBe('pool-new')
    expect(result.inviteCode).toHaveLength(10)
    expect(result.share).toEqual({ totalCostCents: 1000n, totalShares: 3, shareValueCents: 334n, surplusCents: 2n })

    const createCall = poolCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(createCall.data.shareValueCents).toBe(334n)
    expect(createCall.data.status).toBe(PoolStatus.DRAFT)
    expect(createCall.data.ownerPixKeyType).toBe(PixKeyType.EMAIL)
    expect(createCall.data.ownerPixKeyEnc).toBe('v1:a:b:c')
  })

  it('bloqueia quando o dono já está no teto de bolões ativos do plano (G4)', async () => {
    const lotteryFindUnique = vi.fn().mockResolvedValue({ id: 'lottery-1' })
    const poolCount = vi.fn().mockResolvedValue(1) // Free: maxPools = 1
    const poolCreate = vi.fn()
    const ctx = buildContext(
      {
        lottery: { findUnique: lotteryFindUnique },
        pool: { count: poolCount, create: poolCreate, findUnique: vi.fn().mockResolvedValue(null) },
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ pixKeyEncrypted: null, pixKeyType: null }) },
      },
      OWNER_ID,
    )
    ctx.getEntitlements = () => Promise.resolve(getEntitlements('free'))
    const caller = createCaller(ctx)

    await expect(caller.create(createInput)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(poolCreate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// pool.payout.list / markPaid
// ─────────────────────────────────────────────────────────────────────────────

describe('pool.payout.list — sharesRatio sai como string (invariante 7)', () => {
  it('nunca devolve number para sharesRatio', async () => {
    const poolFindUnique = vi.fn().mockResolvedValue({
      ownerId: OWNER_ID,
      members: [{ userId: OWNER_ID, status: MemberStatus.JOINED }],
    })
    const decimalLike = { toString: () => '0.60000000' }
    const payoutFindMany = vi.fn().mockResolvedValue([
      {
        id: 'payout-1',
        contestId: 'contest-1',
        sharesRatio: decimalLike,
        amountCents: 600n,
        status: PayoutStatus.PENDING,
        poolMember: { user: { name: 'Fulano' }, guestName: null },
      },
    ])
    const contestFindMany = vi.fn().mockResolvedValue([{ id: 'contest-1', number: 2800 }])
    const caller = createCaller(
      buildContext(
        { pool: { findUnique: poolFindUnique }, poolPayout: { findMany: payoutFindMany }, contest: { findMany: contestFindMany } },
        OWNER_ID,
      ),
    )

    const rows = await caller.payout.list({ poolId: 'pool-1' })
    expect(typeof rows[0]?.sharesRatio).toBe('string')
    expect(rows[0]?.sharesRatio).toBe('0.60000000')
    expect(rows[0]?.contestNumber).toBe(2800)
  })
})

describe('pool.payout.markPaid', () => {
  it('PENDING -> DECLARED_PAID; repetir a chamada é rejeitado (não regride nem duplica)', async () => {
    const state = { current: PayoutStatus.PENDING as PayoutStatus }
    const findUnique = vi.fn().mockImplementation(async () => ({ status: state.current, pool: { ownerId: OWNER_ID } }))
    const update = vi.fn().mockImplementation(async () => {
      state.current = PayoutStatus.DECLARED_PAID
      return { status: PayoutStatus.DECLARED_PAID }
    })
    const caller = createCaller(buildContext({ poolPayout: { findUnique, update } }, OWNER_ID))

    const first = await caller.payout.markPaid({ payoutId: 'payout-1' })
    expect(first.status).toBe(PayoutStatus.DECLARED_PAID)

    await expect(caller.payout.markPaid({ payoutId: 'payout-1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(update).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// server/lib/pool/* — funções puras (mesmo espírito de bet-cost.test.ts/wallet-period.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe('server/lib/pool/state-machine — máquina de estados do bolão', () => {
  it.each([
    [PoolStatus.DRAFT, PoolStatus.OPEN],
    [PoolStatus.OPEN, PoolStatus.CLOSED],
    [PoolStatus.CLOSED, PoolStatus.BET_PLACED],
    [PoolStatus.BET_PLACED, PoolStatus.SETTLED],
    [PoolStatus.DRAFT, PoolStatus.CANCELED],
    [PoolStatus.OPEN, PoolStatus.CANCELED],
  ])('permite %s -> %s', (from, to) => {
    expect(() => assertValidPoolTransition(from, to, { hasReceiptUrl: true })).not.toThrow()
  })

  it('bloqueia pular estado (DRAFT -> CLOSED)', () => {
    expect(() => assertValidPoolTransition(PoolStatus.DRAFT, PoolStatus.CLOSED, { hasReceiptUrl: true })).toThrow(
      TRPCError,
    )
  })

  it('bloqueia repetir o mesmo estado (OPEN -> OPEN)', () => {
    expect(() => assertValidPoolTransition(PoolStatus.OPEN, PoolStatus.OPEN, { hasReceiptUrl: true })).toThrow(
      TRPCError,
    )
  })

  it('bloqueia sair de estados terminais (SETTLED, CANCELED)', () => {
    expect(() => assertValidPoolTransition(PoolStatus.SETTLED, PoolStatus.OPEN, { hasReceiptUrl: true })).toThrow(
      TRPCError,
    )
    expect(() => assertValidPoolTransition(PoolStatus.CANCELED, PoolStatus.OPEN, { hasReceiptUrl: true })).toThrow(
      TRPCError,
    )
  })

  it('CLOSED -> BET_PLACED exige hasReceiptUrl mesmo sendo uma transição válida no mapa', () => {
    expect(() =>
      assertValidPoolTransition(PoolStatus.CLOSED, PoolStatus.BET_PLACED, { hasReceiptUrl: false }),
    ).toThrow(/comprovante/i)
    expect(() =>
      assertValidPoolTransition(PoolStatus.CLOSED, PoolStatus.BET_PLACED, { hasReceiptUrl: true }),
    ).not.toThrow()
  })
})

describe('server/lib/pool/state-machine — status de pagamento e de rateio', () => {
  it('assertCanConfirmPayment/assertCanDeclarePayment bloqueiam CONFIRMED e REMOVED', () => {
    expect(() => assertCanConfirmPayment(MemberStatus.CONFIRMED)).toThrow(TRPCError)
    expect(() => assertCanConfirmPayment(MemberStatus.REMOVED)).toThrow(TRPCError)
    expect(() => assertCanDeclarePayment(MemberStatus.CONFIRMED)).toThrow(TRPCError)
    expect(() => assertCanDeclarePayment(MemberStatus.REMOVED)).toThrow(TRPCError)
  })

  it('permitem a partir de JOINED/PAID', () => {
    expect(() => assertCanConfirmPayment(MemberStatus.JOINED)).not.toThrow()
    expect(() => assertCanConfirmPayment(MemberStatus.PAID)).not.toThrow()
    expect(() => assertCanDeclarePayment(MemberStatus.JOINED)).not.toThrow()
  })

  it('assertCanMarkPayoutPaid só permite a partir de PENDING', () => {
    expect(() => assertCanMarkPayoutPaid(PayoutStatus.PENDING)).not.toThrow()
    expect(() => assertCanMarkPayoutPaid(PayoutStatus.DECLARED_PAID)).toThrow(TRPCError)
    expect(() => assertCanMarkPayoutPaid(PayoutStatus.CONFIRMED)).toThrow(TRPCError)
  })
})

describe('server/lib/pool/decimal — sharesRatioDecimalString (invariante 7: string, nunca number)', () => {
  it('formata como string de 8 casas decimais', () => {
    expect(sharesRatioDecimalString(1, 4)).toBe('0.25000000')
    expect(sharesRatioDecimalString(4, 4)).toBe('1.00000000')
    expect(sharesRatioDecimalString(1, 3)).toBe('0.33333333')
  })

  it('rejeita entradas inválidas', () => {
    expect(() => sharesRatioDecimalString(-1, 5)).toThrow()
    expect(() => sharesRatioDecimalString(1, 0)).toThrow()
    expect(() => sharesRatioDecimalString(1.5, 5)).toThrow()
  })
})

describe('server/lib/pool/invite-code — alphabetIndexFromByte sem viés (achado menor)', () => {
  it('rejeita exatamente os bytes 248..255 (256 − 8×31) em vez de enviesar os 8 primeiros símbolos via `byte % 31`', () => {
    // Antes: `byte % 31` fazia os bytes 248..255 caírem de novo nos índices 0..7 — os 8
    // primeiros símbolos do alfabeto saíam ~12,5% mais vezes que os outros 23.
    for (let byte = 0; byte < 248; byte++) {
      expect(alphabetIndexFromByte(byte, 31)).toBe(byte % 31)
    }
    for (let byte = 248; byte <= 255; byte++) {
      expect(alphabetIndexFromByte(byte, 31)).toBeNull()
    }
  })

  it('nunca devolve um índice fora de [0, alphabetLength)', () => {
    for (let byte = 0; byte < 256; byte++) {
      const index = alphabetIndexFromByte(byte, 31)
      if (index !== null) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(31)
      }
    }
  })
})

describe('server/lib/pool/invite-code — generateUniqueInviteCode', () => {
  it('tenta de novo em colisão e devolve o primeiro código livre', async () => {
    let calls = 0
    const exists = vi.fn(async () => {
      calls += 1
      return calls < 3 // as duas primeiras tentativas "colidem"; a terceira está livre.
    })

    const code = await generateUniqueInviteCode(exists)
    expect(code).toHaveLength(10)
    expect(exists).toHaveBeenCalledTimes(3)
  })

  it('desiste depois de várias colisões seguidas em vez de gravar um código repetido', async () => {
    const exists = vi.fn().mockResolvedValue(true)
    await expect(generateUniqueInviteCode(exists, 3)).rejects.toThrow()
    expect(exists).toHaveBeenCalledTimes(3)
  })
})

describe('server/lib/pool/pix — máscara da chave Pix do organizador (exemplos literais do contrato)', () => {
  it('e-mail vira ***@dominio', () => {
    expect(maskOwnerPixKey(PixKeyType.EMAIL, 'organizador@gmail.com')).toBe('***@gmail.com')
  })

  it('CPF vira ***.***.789-00', () => {
    expect(maskOwnerPixKey(PixKeyType.CPF, '12345678900')).toBe('***.***.789-00')
  })

  it('nunca inclui a chave inteira na máscara, em nenhum tipo', () => {
    expect(maskOwnerPixKey(PixKeyType.EMAIL, 'organizador@gmail.com')).not.toContain('organizador')
    expect(maskOwnerPixKey(PixKeyType.CPF, '12345678900')).not.toContain('12345678900')
    expect(maskOwnerPixKey(PixKeyType.PHONE, '+5511999998888')).not.toContain('999998888')
  })

  it('toPixKeyKind mapeia 1 a 1 para os literais de @lotopro/core', () => {
    expect(toPixKeyKind(PixKeyType.CPF)).toBe('CPF')
    expect(toPixKeyKind(PixKeyType.CNPJ)).toBe('CNPJ')
    expect(toPixKeyKind(PixKeyType.EMAIL)).toBe('EMAIL')
    expect(toPixKeyKind(PixKeyType.PHONE)).toBe('PHONE')
    expect(toPixKeyKind(PixKeyType.RANDOM)).toBe('RANDOM')
  })
})

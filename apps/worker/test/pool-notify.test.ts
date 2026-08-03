/**
 * Onda 8 — testes do job `pool-notify`. Duplo em memória de Prisma (mesmo padrão de
 * `accumulated-alert.test.ts`/`check-bets.test.ts`); a fila `notify` é um duplo que só
 * registra as chamadas (`calls`), incluindo o `jobId` (camada 1 de idempotência — a camada 2,
 * `Notification.dedupeKey`, é testada em `notify.test.ts`).
 *
 * O que precisa ficar provado aqui:
 *  · os 5 eventos notificam o destinatário CERTO (organizador vs. participante vs. broadcast);
 *  · convidado sem conta (`userId: null`) nunca gera um job `notify` (não tem pra onde enviar);
 *  · pool/membro/pagamento inexistente não lança — só conta em `skipped`;
 *  · reenfileirar o MESMO evento produz o MESMO `jobId` (natural key estável);
 *  · o payload nunca carrega a chave Pix nem o `inviteCode` (CLAUDE.md/docs/03).
 */
import { describe, expect, it } from 'vitest'
import {
  createPoolNotifyJob,
  type PoolNotifyMemberRow,
  type PoolNotifyPaymentRow,
  type PoolNotifyPayoutRow,
  type PoolNotifyPoolRow,
  type PoolNotifyPrisma,
} from '../src/jobs/pool-notify'
import type { NotifyJobData } from '../src/queues'

// ─── Duplo em memória de Prisma ────────────────────────────────────────────────

function createFakeDb(seed: {
  pools?: PoolNotifyPoolRow[]
  members?: PoolNotifyMemberRow[]
  payments?: PoolNotifyPaymentRow[]
  payouts?: PoolNotifyPayoutRow[]
}): PoolNotifyPrisma {
  const pools = new Map((seed.pools ?? []).map((p) => [p.id, p]))
  const members = new Map((seed.members ?? []).map((m) => [m.id, m]))
  const payments = new Map((seed.payments ?? []).map((p) => [p.id, p]))
  const payouts = seed.payouts ?? []

  return {
    pool: {
      findUnique: async ({ where }) => pools.get(where.id) ?? null,
    },
    poolMember: {
      findUnique: async ({ where }) => members.get(where.id) ?? null,
      // Ignora `where.poolId` de propósito (mesma simplificação de `accumulated-alert.test.ts`
      // `contest.findLatestPerLottery`): cada teste semeia só os membros do pool sob teste.
      findManyNotifiable: async () => [...members.values()],
    },
    poolPayment: {
      findUnique: async ({ where }) => payments.get(where.id) ?? null,
    },
    poolPayout: {
      findManyForContest: async () => payouts,
    },
  }
}

function fakeNotifyQueue() {
  const calls: { name: string; data: NotifyJobData; jobId: string | undefined }[] = []
  return {
    add: async (name: string, data: NotifyJobData, opts?: { jobId?: string }) => {
      calls.push({ name, data, jobId: opts?.jobId })
    },
    calls,
  }
}

const POOL: PoolNotifyPoolRow = { id: 'pool-1', ownerId: 'owner-1', name: 'Escritório' }

const MEMBER_WITH_ACCOUNT: PoolNotifyMemberRow = {
  id: 'member-1',
  poolId: 'pool-1',
  userId: 'user-membro-1',
  guestName: null,
  userName: 'João',
  shares: 2,
}

const GUEST_MEMBER: PoolNotifyMemberRow = {
  id: 'member-guest',
  poolId: 'pool-1',
  userId: null,
  guestName: 'Maria (convidada)',
  userName: null,
  shares: 1,
}

describe('pool-notify — member.joined', () => {
  it('avisa o ORGANIZADOR quando um novo participante entra', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [MEMBER_WITH_ACCOUNT] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({ event: 'member.joined', poolId: 'pool-1', poolMemberId: 'member-1' })

    expect(result).toEqual({ event: 'member.joined', notified: 1, skipped: 0 })
    expect(notifyQueue.calls).toHaveLength(1)
    const call = notifyQueue.calls[0]!
    expect(call.data.userId).toBe('owner-1') // organizador, não o membro que entrou
    expect(call.data.type).toBe('pool.member_joined')
    expect(call.data.title).toBe('João entrou no bolão "Escritório"')
    expect(call.data.body).toBe('2 cotas · aguardando pagamento.')
    expect(call.data.payload).toMatchObject({
      poolId: 'pool-1',
      poolName: 'Escritório',
      poolMemberId: 'member-1',
      memberName: 'João',
      shares: 2,
      dedupeScope: 'member:member-1',
    })
    expect(call.jobId).toBe('pool-notify:pool.member_joined:owner-1:member:member-1')
  })

  it('convidado sem User.name usa guestName no texto', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [GUEST_MEMBER] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    await job({ event: 'member.joined', poolId: 'pool-1', poolMemberId: 'member-guest' })

    expect(notifyQueue.calls[0]!.data.title).toBe('Maria (convidada) entrou no bolão "Escritório"')
  })

  it('pool ou membro inexistente: não lança, conta em skipped', async () => {
    const prisma = createFakeDb({ pools: [POOL] }) // sem membro
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({ event: 'member.joined', poolId: 'pool-1', poolMemberId: 'nao-existe' })

    expect(result).toEqual({ event: 'member.joined', notified: 0, skipped: 1 })
    expect(notifyQueue.calls).toHaveLength(0)
  })

  it('reenfileirar o MESMO evento produz o MESMO jobId (idempotência, camada 1)', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [MEMBER_WITH_ACCOUNT] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    await job({ event: 'member.joined', poolId: 'pool-1', poolMemberId: 'member-1' })
    await job({ event: 'member.joined', poolId: 'pool-1', poolMemberId: 'member-1' })

    expect(notifyQueue.calls).toHaveLength(2)
    expect(notifyQueue.calls[0]!.jobId).toBe(notifyQueue.calls[1]!.jobId)
  })
})

describe('pool-notify — payment.declared', () => {
  const PAYMENT: PoolNotifyPaymentRow = { id: 'payment-1', poolMemberId: 'member-1', amountCents: 5_000n }

  it('avisa o ORGANIZADOR quando o participante declara que pagou', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [MEMBER_WITH_ACCOUNT], payments: [PAYMENT] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({
      event: 'payment.declared',
      poolId: 'pool-1',
      poolMemberId: 'member-1',
      poolPaymentId: 'payment-1',
    })

    expect(result).toEqual({ event: 'payment.declared', notified: 1, skipped: 0 })
    const call = notifyQueue.calls[0]!
    expect(call.data.userId).toBe('owner-1')
    expect(call.data.type).toBe('pool.payment_declared')
    expect(call.data.title).toBe('João declarou pagamento no bolão "Escritório"')
    expect(call.data.payload).toMatchObject({ dedupeScope: 'payment-declared:payment-1', amountCents: '5000' })
  })
})

describe('pool-notify — payment.confirmed', () => {
  const PAYMENT: PoolNotifyPaymentRow = { id: 'payment-1', poolMemberId: 'member-1', amountCents: 5_000n }

  it('avisa o PARTICIPANTE quando o organizador confirma o pagamento', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [MEMBER_WITH_ACCOUNT], payments: [PAYMENT] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({
      event: 'payment.confirmed',
      poolId: 'pool-1',
      poolMemberId: 'member-1',
      poolPaymentId: 'payment-1',
    })

    expect(result).toEqual({ event: 'payment.confirmed', notified: 1, skipped: 0 })
    const call = notifyQueue.calls[0]!
    expect(call.data.userId).toBe('user-membro-1') // o membro, não o organizador
    expect(call.data.type).toBe('pool.payment_confirmed')
    expect(call.data.title).toBe('Pagamento confirmado no bolão "Escritório"')
  })

  it('convidado sem conta: pulado, nenhum job notify enfileirado', async () => {
    const guestPayment: PoolNotifyPaymentRow = { id: 'payment-2', poolMemberId: 'member-guest', amountCents: 5_000n }
    const prisma = createFakeDb({ pools: [POOL], members: [GUEST_MEMBER], payments: [guestPayment] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({
      event: 'payment.confirmed',
      poolId: 'pool-1',
      poolMemberId: 'member-guest',
      poolPaymentId: 'payment-2',
    })

    expect(result).toEqual({ event: 'payment.confirmed', notified: 0, skipped: 1 })
    expect(notifyQueue.calls).toHaveLength(0)
  })
})

describe('pool-notify — receipt.attached (broadcast)', () => {
  it('avisa TODOS os membros com conta; convidado é pulado', async () => {
    const prisma = createFakeDb({ pools: [POOL], members: [MEMBER_WITH_ACCOUNT, GUEST_MEMBER] })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({ event: 'receipt.attached', poolId: 'pool-1', attachedAt: '2026-08-03T12:00:00.000Z' })

    expect(result).toEqual({ event: 'receipt.attached', notified: 1, skipped: 1 })
    expect(notifyQueue.calls).toHaveLength(1)
    const call = notifyQueue.calls[0]!
    expect(call.data.userId).toBe('user-membro-1')
    expect(call.data.type).toBe('pool.receipt_attached')
    expect(call.data.title).toBe('Bolão "Escritório" apostado ✅')
    expect(call.data.payload).toMatchObject({ dedupeScope: 'receipt:pool-1:2026-08-03T12:00:00.000Z' })
  })
})

describe('pool-notify — payout.computed (rateio calculado)', () => {
  it('avisa cada membro premiado com O VALOR DELE, nunca chave Pix ou inviteCode', async () => {
    const payouts: PoolNotifyPayoutRow[] = [
      { id: 'payout-1', poolMemberId: 'member-1', memberUserId: 'user-membro-1', amountCents: 34_000n, contestNumber: 2900 },
      { id: 'payout-2', poolMemberId: 'member-guest', memberUserId: null, amountCents: 17_000n, contestNumber: 2900 },
    ]
    const prisma = createFakeDb({ pools: [POOL], payouts })
    const notifyQueue = fakeNotifyQueue()
    const job = createPoolNotifyJob({ prisma, notifyQueue })

    const result = await job({ event: 'payout.computed', poolId: 'pool-1', contestId: 'contest-1' })

    expect(result).toEqual({ event: 'payout.computed', notified: 1, skipped: 1 })
    const call = notifyQueue.calls[0]!
    expect(call.data.userId).toBe('user-membro-1')
    expect(call.data.type).toBe('pool.prized')
    expect(call.data.title).toBe('🎉 O bolão "Escritório" foi premiado!')
    expect(call.data.body).toBe('Sua parte: R$ 340,00. Veja o rateio.')
    expect(call.data.payload).toMatchObject({
      poolId: 'pool-1',
      contestNumber: 2900,
      amountCents: '34000',
      dedupeScope: 'payout:payout-1',
    })
    const serialized = JSON.stringify(call.data)
    expect(serialized).not.toMatch(/pix/i)
    expect(serialized).not.toMatch(/inviteCode/i)
  })
})

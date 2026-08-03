/**
 * SY-09 — testes do job `billing-dunning`. Duplos em memória para a porta de Prisma, a
 * fila `notify` e o gateway; relógio injetado para posicionar D+1/D+3/D+5/D+7 sem esperar.
 *
 * O que precisa ficar provado aqui:
 *  · os avisos saem exatamente nos marcos, uma vez cada (idempotência via `attempts`);
 *  · D+7 rebaixa para o free SEM apagar nada (⛔ CLAUDE.md / docs/05 §5.4);
 *  · a reconciliação com o gateway conserta um webhook perdido em vez de avisar à toa;
 *  · cancelamento, downgrade agendado e fim de trial terminam no fim do período.
 */
import { describe, expect, it } from 'vitest'
import { BillingCycle, InvoiceStatus, PaymentMethod, SubStatus } from '@lotopro/db'
import {
  createBillingDunningJob,
  expectedAttempts,
  isPaidGatewayStatus,
  resolveScheduledPlanSlug,
  type BillingDunningGateway,
  type BillingDunningPrisma,
  type DunningInvoiceRow,
  type DunningPlanRow,
  type DunningSubscriptionRow,
} from '../src/jobs/billing-dunning'
import type { NotifyJobData } from '../src/queues'

const PLANS: DunningPlanRow[] = [
  { id: 'plan-free', slug: 'free', name: 'Apostador' },
  { id: 'plan-premium', slug: 'premium', name: 'Estrategista' },
  { id: 'plan-pro', slug: 'pro', name: 'Bolão Master' },
]

const DUE_AT = new Date('2026-08-02T15:00:00Z')

function subscriptionRow(overrides: Partial<DunningSubscriptionRow> = {}): DunningSubscriptionRow {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-premium',
    status: SubStatus.PAST_DUE,
    billingCycle: BillingCycle.MONTHLY,
    paymentMethod: PaymentMethod.PIX_AUTOMATIC,
    gatewaySubscriptionId: 'sub_gw_1',
    currentPeriodStart: new Date('2026-08-02T15:00:00Z'),
    currentPeriodEnd: new Date('2026-09-02T15:00:00Z'),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    cancelReason: null,
    ...overrides,
  }
}

function invoiceRow(overrides: Partial<DunningInvoiceRow> = {}): DunningInvoiceRow {
  return {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    amountCents: 2366n,
    status: InvoiceStatus.PENDING,
    gatewayInvoiceId: 'pay_001',
    dueAt: DUE_AT,
    attempts: 0,
    ...overrides,
  }
}

/** Espelha o `status: { in: [...] }` do adapter real (`createBillingDunningPrismaAdapter`). */
const TRANSITIONABLE_STATUSES: SubStatus[] = [
  SubStatus.ACTIVE,
  SubStatus.TRIALING,
  SubStatus.PAST_DUE,
]

interface InvoiceState extends DunningInvoiceRow {
  paidAt: Date | null
  failureReason: string | null
}

function createFakePrisma(
  seed: { subscriptions?: DunningSubscriptionRow[]; invoices?: DunningInvoiceRow[] } = {},
) {
  const subscriptions = seed.subscriptions ?? [subscriptionRow()]
  const invoices: InvoiceState[] = (seed.invoices ?? [invoiceRow()]).map((row) => ({
    ...row,
    paidAt: null,
    failureReason: null,
  }))

  const prisma: BillingDunningPrisma = {
    subscription: {
      findManyPastDue: async () =>
        subscriptions.filter((row) => row.status === SubStatus.PAST_DUE),
      findManyDueForTransition: async ({ now }) =>
        subscriptions.filter((row) => {
          const scheduled =
            row.cancelAtPeriodEnd &&
            row.currentPeriodEnd.getTime() <= now.getTime() &&
            TRANSITIONABLE_STATUSES.includes(row.status)
          const expiredTrial =
            row.status === SubStatus.TRIALING &&
            row.trialEndsAt !== null &&
            row.trialEndsAt.getTime() <= now.getTime()
          return scheduled || expiredTrial
        }),
      update: async ({ where, data }) => {
        const row = subscriptions.find((item) => item.id === where.id)
        if (!row) throw new Error(`subscription ${where.id} não existe no duplo`)
        if (data.status !== undefined) row.status = data.status
        if (data.planId !== undefined) row.planId = data.planId
        if (data.currentPeriodStart !== undefined) row.currentPeriodStart = data.currentPeriodStart
        if (data.currentPeriodEnd !== undefined) row.currentPeriodEnd = data.currentPeriodEnd
        if (data.cancelAtPeriodEnd !== undefined) row.cancelAtPeriodEnd = data.cancelAtPeriodEnd
        if (data.canceledAt !== undefined) row.canceledAt = data.canceledAt
        if (data.cancelReason !== undefined) row.cancelReason = data.cancelReason
        if (data.trialEndsAt !== undefined) row.trialEndsAt = data.trialEndsAt
        return row
      },
    },
    invoice: {
      findOldestUnpaid: async ({ where }) =>
        invoices
          .filter(
            (row) =>
              row.subscriptionId === where.subscriptionId &&
              (row.status === InvoiceStatus.PENDING || row.status === InvoiceStatus.FAILED),
          )
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null,
      update: async ({ where, data }) => {
        const row = invoices.find((item) => item.id === where.id)
        if (!row) throw new Error(`invoice ${where.id} não existe no duplo`)
        if (data.status !== undefined) row.status = data.status
        if (data.attempts !== undefined) row.attempts = data.attempts
        if (data.paidAt !== undefined) row.paidAt = data.paidAt
        if (data.failureReason !== undefined) row.failureReason = data.failureReason
        return row
      },
    },
    plan: {
      findUnique: async ({ where }) => PLANS.find((plan) => plan.slug === where.slug) ?? null,
    },
  }

  return { prisma, subscriptions, invoices }
}

function fakeNotifyQueue() {
  const sent: NotifyJobData[] = []
  return {
    queue: { add: async (_name: string, data: NotifyJobData) => void sent.push(data) },
    sent,
  }
}

function paidGateway(): BillingDunningGateway {
  return {
    getPayment: async (id) => ({
      id,
      status: 'RECEIVED',
      valueCents: 2366n,
      dueDate: '2026-08-02',
      paymentDate: '2026-08-03',
    }),
    listPaymentsBySubscription: async () => [],
  }
}

function unpaidGateway(): BillingDunningGateway {
  return {
    getPayment: async (id) => ({ id, status: 'OVERDUE', valueCents: 2366n, dueDate: '2026-08-02' }),
    listPaymentsBySubscription: async () => [],
  }
}

/** `DUE_AT` + `days` dias, às 18:00Z (garante o dia inteiro fechado). */
function atDay(days: number): Date {
  return new Date(DUE_AT.getTime() + days * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
}

// ─── Regra dos marcos ─────────────────────────────────────────────────────────

describe('expectedAttempts (D+1/D+3/D+5)', () => {
  it('conta quantos marcos já venceram', () => {
    expect(expectedAttempts(0)).toBe(0)
    expect(expectedAttempts(1)).toBe(1)
    expect(expectedAttempts(2)).toBe(1)
    expect(expectedAttempts(3)).toBe(2)
    expect(expectedAttempts(4)).toBe(2)
    expect(expectedAttempts(5)).toBe(3)
    expect(expectedAttempts(6)).toBe(3)
  })
})

describe('isPaidGatewayStatus', () => {
  it('reconhece os status liquidados do Asaas', () => {
    expect(isPaidGatewayStatus('RECEIVED')).toBe(true)
    expect(isPaidGatewayStatus('confirmed')).toBe(true)
    expect(isPaidGatewayStatus('PENDING')).toBe(false)
    expect(isPaidGatewayStatus('OVERDUE')).toBe(false)
  })
})

describe('resolveScheduledPlanSlug (espelho de apps/web)', () => {
  it('lê cancelamento, downgrade agendado e ausência de agendamento', () => {
    expect(resolveScheduledPlanSlug(subscriptionRow())).toBeNull()
    expect(
      resolveScheduledPlanSlug(
        subscriptionRow({ cancelAtPeriodEnd: true, canceledAt: new Date() }),
      ),
    ).toBe('free')
    expect(
      resolveScheduledPlanSlug(
        subscriptionRow({ cancelAtPeriodEnd: true, cancelReason: 'scheduled_downgrade:premium' }),
      ),
    ).toBe('premium')
  })
})

// ─── Passe de dunning ─────────────────────────────────────────────────────────

describe('billing-dunning — avisos D+1/D+3/D+5', () => {
  it('não faz nada antes de D+1', async () => {
    const { prisma, invoices } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({ prisma, notifyQueue: queue, now: () => atDay(0) })

    const result = await run()

    expect(result.notified).toBe(0)
    expect(sent).toHaveLength(0)
    expect(invoices[0]?.attempts).toBe(0)
  })

  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
  ])('avisa em D+%i e grava attempts=%i', async (day, attempts) => {
    const { prisma, invoices } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      gateway: unpaidGateway(),
      now: () => atDay(day),
    })

    const result = await run()

    expect(result.notified).toBe(1)
    expect(sent[0]?.type).toBe('billing.payment_failed')
    expect(sent[0]?.userId).toBe('user-1')
    expect(sent[0]?.payload).toMatchObject({ daysOverdue: day, amountCents: '2366' })
    expect(invoices[0]).toMatchObject({ status: InvoiceStatus.FAILED, attempts })
  })

  it('é idempotente: rodar duas vezes no mesmo dia avisa uma vez só', async () => {
    const { prisma, invoices } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({ prisma, notifyQueue: queue, now: () => atDay(3) })

    await run()
    await run()

    expect(sent).toHaveLength(1)
    expect(invoices[0]?.attempts).toBe(2)
  })

  it('avisa uma vez por marco ao longo do ciclo (D+1, D+3, D+5 = 3 avisos)', async () => {
    const { prisma } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    let today = atDay(1)
    const run = createBillingDunningJob({ prisma, notifyQueue: queue, now: () => today })

    for (const day of [1, 2, 3, 4, 5, 6]) {
      today = atDay(day)
      await run()
    }

    expect(sent).toHaveLength(3)
    expect(sent.map((job) => job.payload?.['daysOverdue'])).toEqual([1, 3, 5])
  })
})

describe('billing-dunning — reconciliação com o gateway', () => {
  it('conserta o estado quando o Asaas já recebeu (webhook perdido) e não avisa', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      gateway: paidGateway(),
      now: () => atDay(3),
    })

    const result = await run()

    expect(result).toMatchObject({ reconciled: 1, notified: 0, downgraded: 0 })
    expect(sent).toHaveLength(0)
    expect(invoices[0]?.status).toBe(InvoiceStatus.PAID)
    expect(subscriptions[0]?.status).toBe(SubStatus.ACTIVE)
    // Período não muda: a fatura de 02/08 já estava coberta por currentPeriodEnd 02/09.
    expect(subscriptions[0]?.currentPeriodEnd.toISOString()).toBe('2026-09-02T15:00:00.000Z')
  })

  it('segue pela regra de tempo quando o gateway falha (avisa, não cobra de novo)', async () => {
    const { prisma } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const brokenGateway: BillingDunningGateway = {
      getPayment: async () => {
        throw new Error('timeout')
      },
      listPaymentsBySubscription: async () => {
        throw new Error('timeout')
      },
    }
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      gateway: brokenGateway,
      now: () => atDay(1),
    })

    const result = await run()
    expect(result.notified).toBe(1)
    expect(sent).toHaveLength(1)
  })
})

describe('billing-dunning — downgrade em D+7', () => {
  it('rebaixa para o free, marca EXPIRED e avisa que NENHUM dado foi apagado', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      gateway: unpaidGateway(),
      now: () => atDay(7),
    })

    const result = await run()

    expect(result.downgraded).toBe(1)
    expect(subscriptions[0]).toMatchObject({
      status: SubStatus.EXPIRED,
      planId: 'plan-free',
      cancelAtPeriodEnd: false,
    })
    expect(invoices[0]?.status).toBe(InvoiceStatus.FAILED)
    expect(sent[0]?.type).toBe('billing.downgraded')
    expect(sent[0]?.body).toContain('Nenhum dado foi apagado')
  })

  it('não rebaixa duas vezes (a assinatura sai do conjunto varrido)', async () => {
    const { prisma, subscriptions } = createFakePrisma()
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({ prisma, notifyQueue: queue, now: () => atDay(9) })

    await run()
    const second = await run()

    expect(second.scannedPastDue).toBe(0)
    expect(second.downgraded).toBe(0)
    expect(sent).toHaveLength(1)
    expect(subscriptions[0]?.status).toBe(SubStatus.EXPIRED)
  })
})

// ─── Passe de transições ──────────────────────────────────────────────────────

describe('billing-dunning — transições de fim de período', () => {
  it('conclui o cancelamento agendado quando o período pago acaba', async () => {
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [
        subscriptionRow({
          status: SubStatus.ACTIVE,
          cancelAtPeriodEnd: true,
          canceledAt: new Date('2026-08-20T10:00:00Z'),
          cancelReason: 'caro demais',
          currentPeriodEnd: new Date('2026-09-02T15:00:00Z'),
        }),
      ],
      invoices: [],
    })
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      now: () => new Date('2026-09-02T18:00:00Z'),
    })

    const result = await run()

    expect(result.transitions).toBe(1)
    expect(subscriptions[0]).toMatchObject({
      status: SubStatus.CANCELED,
      planId: 'plan-free',
      cancelAtPeriodEnd: false,
    })
    expect(sent[0]?.type).toBe('billing.downgraded')
  })

  it('mantém tudo intacto ENQUANTO o período pago não acabou', async () => {
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [
        subscriptionRow({
          status: SubStatus.ACTIVE,
          cancelAtPeriodEnd: true,
          canceledAt: new Date('2026-08-20T10:00:00Z'),
          currentPeriodEnd: new Date('2026-09-02T15:00:00Z'),
        }),
      ],
      invoices: [],
    })
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      now: () => new Date('2026-08-25T18:00:00Z'),
    })

    const result = await run()

    expect(result.transitions).toBe(0)
    expect(subscriptions[0]?.status).toBe(SubStatus.ACTIVE)
    expect(subscriptions[0]?.planId).toBe('plan-premium')
    expect(sent).toHaveLength(0)
  })

  it('aplica o downgrade agendado para outro plano pago e abre novo período', async () => {
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [
        subscriptionRow({
          status: SubStatus.ACTIVE,
          planId: 'plan-pro',
          cancelAtPeriodEnd: true,
          cancelReason: 'scheduled_downgrade:premium',
          currentPeriodEnd: new Date('2026-09-02T15:00:00Z'),
        }),
      ],
      invoices: [],
    })
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      now: () => new Date('2026-09-02T18:00:00Z'),
    })

    await run()

    expect(subscriptions[0]).toMatchObject({
      status: SubStatus.ACTIVE, // continua pagante, só que no plano menor
      planId: 'plan-premium',
      cancelAtPeriodEnd: false,
      cancelReason: null,
    })
    expect(subscriptions[0]?.currentPeriodEnd.toISOString()).toBe('2026-10-02T18:00:00.000Z')
    expect(sent[0]?.payload).toMatchObject({ reason: 'scheduled_downgrade' })
  })

  it('encerra o trial vencido caindo para o free (sem cartão, sem gateway)', async () => {
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [
        subscriptionRow({
          status: SubStatus.TRIALING,
          planId: 'plan-pro',
          gatewaySubscriptionId: null,
          trialEndsAt: new Date('2026-08-16T15:00:00Z'),
          currentPeriodEnd: new Date('2026-08-16T15:00:00Z'),
        }),
      ],
      invoices: [],
    })
    const { queue, sent } = fakeNotifyQueue()
    const run = createBillingDunningJob({
      prisma,
      notifyQueue: queue,
      now: () => new Date('2026-08-16T18:00:00Z'),
    })

    const result = await run()

    expect(result.transitions).toBe(1)
    expect(subscriptions[0]).toMatchObject({
      status: SubStatus.EXPIRED,
      planId: 'plan-free',
      trialEndsAt: null,
    })
    expect(sent[0]?.type).toBe('billing.trial_ended')
  })
})

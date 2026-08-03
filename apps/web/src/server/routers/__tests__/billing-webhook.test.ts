/**
 * SY-13 — testes do handler puro do webhook do Asaas
 * (`server/lib/billing/webhook.ts`). Sem `Request`/`Response` e sem Prisma: a rota
 * (`app/api/webhooks/asaas/route.ts`) é só a casca HTTP em volta disto.
 *
 * Cobre o que dá prejuízo se quebrar: token inválido, idempotência por
 * `WebhookEvent(provider, externalId)`, e o efeito de cada evento em
 * `Subscription`/`Invoice`.
 */
import { describe, expect, it } from 'vitest'
import { BillingCycle, InvoiceStatus, PaymentMethod, SubStatus } from '@lotopro/db'
import {
  createAsaasWebhookHandler,
  isValidWebhookToken,
  parseAsaasWebhookBody,
  reaisToCents,
  type WebhookEventRow,
  type WebhookPrisma,
} from '@/server/lib/billing/webhook'
import type {
  BillingInvoiceRow,
  BillingSubscriptionRow,
  BillingSubscriptionUpdateData,
} from '@/server/lib/billing/service'

const TOKEN = 'token-secreto-do-painel'
const NOW = new Date('2026-09-02T12:00:00Z')

// ─── Duplo de Prisma ──────────────────────────────────────────────────────────

class UniqueViolation extends Error {
  readonly code = 'P2002'
}

function subscriptionRow(overrides: Partial<BillingSubscriptionRow> = {}): BillingSubscriptionRow {
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
    createdAt: new Date('2026-08-02T15:00:00Z'),
    ...overrides,
  }
}

function invoiceRow(overrides: Partial<BillingInvoiceRow> = {}): BillingInvoiceRow {
  return {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    amountCents: 2366n,
    status: InvoiceStatus.PENDING,
    method: PaymentMethod.PIX_AUTOMATIC,
    gatewayInvoiceId: null,
    dueAt: new Date('2026-08-02T15:00:00Z'),
    paidAt: null,
    attempts: 0,
    failureReason: null,
    createdAt: new Date('2026-08-02T15:00:00Z'),
    ...overrides,
  }
}

function applySubscriptionUpdate(
  row: BillingSubscriptionRow,
  data: BillingSubscriptionUpdateData,
): void {
  if (data.planId !== undefined) row.planId = data.planId
  if (data.status !== undefined) row.status = data.status
  if (data.currentPeriodStart !== undefined) row.currentPeriodStart = data.currentPeriodStart
  if (data.currentPeriodEnd !== undefined) row.currentPeriodEnd = data.currentPeriodEnd
  if (data.cancelAtPeriodEnd !== undefined) row.cancelAtPeriodEnd = data.cancelAtPeriodEnd
  if (data.canceledAt !== undefined) row.canceledAt = data.canceledAt
  if (data.cancelReason !== undefined) row.cancelReason = data.cancelReason
}

function createFakePrisma(
  seed: { subscriptions?: BillingSubscriptionRow[]; invoices?: BillingInvoiceRow[] } = {},
) {
  const subscriptions = seed.subscriptions ?? [subscriptionRow()]
  const invoices = seed.invoices ?? []
  const events: Array<WebhookEventRow & { provider: string; externalId: string; error: string | null }> =
    []
  let sequence = 0

  const prisma: WebhookPrisma = {
    webhookEvent: {
      findUnique: async ({ where }) =>
        events.find(
          (event) =>
            event.provider === where.provider_externalId.provider &&
            event.externalId === where.provider_externalId.externalId,
        ) ?? null,
      create: async ({ data }) => {
        const clash = events.find(
          (event) => event.provider === data.provider && event.externalId === data.externalId,
        )
        if (clash) throw new UniqueViolation('unique constraint')
        sequence += 1
        const row = {
          id: `evt-${sequence}`,
          provider: data.provider,
          externalId: data.externalId,
          processedAt: null,
          error: null,
        }
        events.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const row = events.find((event) => event.id === where.id)
        if (!row) throw new Error(`webhookEvent ${where.id} não existe no duplo`)
        if (data.processedAt !== undefined) row.processedAt = data.processedAt
        if (data.error !== undefined) row.error = data.error
        return row
      },
    },
    subscription: {
      findFirst: async ({ where }) =>
        subscriptions.find((row) => row.gatewaySubscriptionId === where.gatewaySubscriptionId) ??
        null,
      findUnique: async ({ where }) => subscriptions.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const row = subscriptions.find((item) => item.id === where.id)
        if (!row) throw new Error(`subscription ${where.id} não existe no duplo`)
        applySubscriptionUpdate(row, data)
        return row
      },
    },
    invoice: {
      findUnique: async ({ where }) =>
        invoices.find((row) => row.gatewayInvoiceId === where.gatewayInvoiceId) ?? null,
      findFirstUnlinked: async ({ where }) =>
        invoices
          .filter(
            (row) =>
              row.subscriptionId === where.subscriptionId &&
              row.gatewayInvoiceId === null &&
              (row.status === InvoiceStatus.PENDING || row.status === InvoiceStatus.FAILED),
          )
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null,
      create: async ({ data }) => {
        sequence += 1
        const row = invoiceRow({
          id: `inv-${sequence}`,
          subscriptionId: data.subscriptionId,
          amountCents: data.amountCents,
          status: data.status,
          method: data.method,
          gatewayInvoiceId: data.gatewayInvoiceId,
          dueAt: data.dueAt,
          paidAt: data.paidAt ?? null,
        })
        invoices.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const row = invoices.find((item) => item.id === where.id)
        if (!row) throw new Error(`invoice ${where.id} não existe no duplo`)
        if (data.status !== undefined) row.status = data.status
        if (data.paidAt !== undefined) row.paidAt = data.paidAt
        if (data.amountCents !== undefined) row.amountCents = data.amountCents
        if (data.dueAt !== undefined) row.dueAt = data.dueAt
        if (data.gatewayInvoiceId !== undefined) row.gatewayInvoiceId = data.gatewayInvoiceId
        if (data.attempts !== undefined) row.attempts = data.attempts
        if (data.failureReason !== undefined) row.failureReason = data.failureReason
        return row
      },
    },
  }

  return { prisma, subscriptions, invoices, events }
}

function paymentEvent(
  event: string,
  overrides: Record<string, unknown> = {},
  eventId = 'evt_001',
): unknown {
  return {
    id: eventId,
    event,
    payment: {
      id: 'pay_001',
      customer: 'cus_001',
      subscription: 'sub_gw_1',
      value: 23.66,
      dueDate: '2026-08-02',
      paymentDate: '2026-08-02',
      billingType: 'PIX',
      status: 'CONFIRMED',
      ...overrides,
    },
  }
}

function makeHandler(prisma: WebhookPrisma) {
  return createAsaasWebhookHandler({ prisma, expectedToken: TOKEN, now: () => NOW })
}

// ─── Token ────────────────────────────────────────────────────────────────────

describe('isValidWebhookToken', () => {
  it('aceita só o token exato', () => {
    expect(isValidWebhookToken(TOKEN, TOKEN)).toBe(true)
    expect(isValidWebhookToken('outro-token-qualquer', TOKEN)).toBe(false)
    expect(isValidWebhookToken(TOKEN.slice(0, -1), TOKEN)).toBe(false)
  })

  it('falha FECHADO quando o token esperado não está configurado', () => {
    expect(isValidWebhookToken('', '')).toBe(false)
    expect(isValidWebhookToken('qualquer-coisa', '')).toBe(false)
    expect(isValidWebhookToken(null, TOKEN)).toBe(false)
  })
})

describe('parseAsaasWebhookBody', () => {
  it('normaliza o evento e converte reais em centavos inteiros', () => {
    const parsed = parseAsaasWebhookBody(paymentEvent('PAYMENT_CONFIRMED'))
    expect(parsed).toMatchObject({
      id: 'evt_001',
      event: 'PAYMENT_CONFIRMED',
      paymentId: 'pay_001',
      subscriptionId: 'sub_gw_1',
    })
    expect(parsed?.payment?.valueCents).toBe(2366n)
    expect(parsed?.payment?.dueAt?.toISOString()).toBe('2026-08-02T12:00:00.000Z')
  })

  it('deriva um id determinístico quando o evento não traz um', () => {
    const body = { event: 'PAYMENT_OVERDUE', payment: { id: 'pay_999' } }
    expect(parseAsaasWebhookBody(body)?.id).toBe('PAYMENT_OVERDUE:pay_999')
    expect(parseAsaasWebhookBody(body)?.id).toBe('PAYMENT_OVERDUE:pay_999')
  })

  it('rejeita corpo que não é evento do Asaas', () => {
    expect(parseAsaasWebhookBody(null)).toBeNull()
    expect(parseAsaasWebhookBody({ foo: 'bar' })).toBeNull()
    expect(parseAsaasWebhookBody('PAYMENT_CONFIRMED')).toBeNull()
  })

  it('converte reais para centavos sem erro de ponto flutuante', () => {
    expect(reaisToCents(24.9)).toBe(2490n)
    expect(reaisToCents(0.1)).toBe(10n)
    expect(reaisToCents(599)).toBe(59900n)
    expect(reaisToCents('24.90')).toBeNull()
  })
})

// ─── Autorização e idempotência ───────────────────────────────────────────────

describe('handler — autorização e idempotência', () => {
  it('devolve 401 e NÃO grava nada quando o token é inválido', async () => {
    const { prisma, events } = createFakePrisma()
    const result = await makeHandler(prisma)({
      token: 'token-errado-mesmo-tamanho!!',
      body: paymentEvent('PAYMENT_CONFIRMED'),
    })

    expect(result).toMatchObject({ httpStatus: 401, outcome: 'unauthorized' })
    expect(events).toHaveLength(0)
  })

  it('devolve 400 para corpo irreconhecível', async () => {
    const { prisma } = createFakePrisma()
    const result = await makeHandler(prisma)({ token: TOKEN, body: { nada: 'aqui' } })
    expect(result).toMatchObject({ httpStatus: 400, outcome: 'invalid' })
  })

  it('processa uma vez e ignora a reentrega do mesmo evento', async () => {
    const { prisma, subscriptions, invoices, events } = createFakePrisma({
      invoices: [invoiceRow()],
    })
    const handle = makeHandler(prisma)
    const body = paymentEvent('PAYMENT_CONFIRMED')

    const first = await handle({ token: TOKEN, body })
    const second = await handle({ token: TOKEN, body })

    expect(first.outcome).toBe('processed')
    expect(second).toMatchObject({ httpStatus: 200, outcome: 'duplicate' })
    expect(events).toHaveLength(1)
    expect(events[0]?.processedAt).toEqual(NOW)
    // O período não foi empurrado duas vezes.
    expect(subscriptions[0]?.currentPeriodEnd.toISOString()).toBe('2026-09-02T15:00:00.000Z')
    expect(invoices).toHaveLength(1)
  })

  it('reprocessa um evento cuja entrega anterior morreu antes de concluir', async () => {
    const { prisma, events, invoices } = createFakePrisma({ invoices: [invoiceRow()] })
    // Simula a entrega que gravou o WebhookEvent mas não chegou a processar.
    await prisma.webhookEvent.create({
      data: { provider: 'asaas', externalId: 'evt_001', eventType: 'PAYMENT_CONFIRMED', payload: {} },
    })

    const result = await makeHandler(prisma)({
      token: TOKEN,
      body: paymentEvent('PAYMENT_CONFIRMED'),
    })

    expect(result.outcome).toBe('processed')
    expect(events).toHaveLength(1)
    expect(events[0]?.processedAt).toEqual(NOW)
    expect(invoices[0]?.status).toBe(InvoiceStatus.PAID)
  })

  it('registra o erro e pede reentrega (5xx) quando o processamento falha', async () => {
    const { prisma, events } = createFakePrisma({ invoices: [invoiceRow()] })
    const explosive: WebhookPrisma = {
      ...prisma,
      invoice: {
        ...prisma.invoice,
        update: async () => {
          throw new Error('conexão perdida com o banco')
        },
      },
    }

    const result = await makeHandler(explosive)({
      token: TOKEN,
      body: paymentEvent('PAYMENT_CONFIRMED'),
    })

    expect(result).toMatchObject({ httpStatus: 500, outcome: 'error' })
    expect(events[0]?.processedAt).toBeNull()
    expect(events[0]?.error).toContain('conexão perdida')
  })
})

// ─── Efeitos por evento ───────────────────────────────────────────────────────

describe('PAYMENT_CONFIRMED / PAYMENT_RECEIVED', () => {
  it('adota a fatura criada por subscribe, marca PAID e ativa a assinatura', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma({ invoices: [invoiceRow()] })

    const result = await makeHandler(prisma)({
      token: TOKEN,
      body: paymentEvent('PAYMENT_CONFIRMED'),
    })

    expect(result.outcome).toBe('processed')
    expect(invoices[0]).toMatchObject({
      status: InvoiceStatus.PAID,
      gatewayInvoiceId: 'pay_001', // vínculo criado agora
      amountCents: 2366n,
    })
    expect(invoices[0]?.paidAt?.toISOString()).toBe('2026-08-02T12:00:00.000Z')
    expect(subscriptions[0]?.status).toBe(SubStatus.ACTIVE)
    // Primeira fatura: o período já tinha sido gravado por subscribe, não soma de novo.
    expect(subscriptions[0]?.currentPeriodEnd.toISOString()).toBe('2026-09-02T15:00:00.000Z')
  })

  it('cria a fatura e estende o período quando é uma renovação gerada pelo Asaas', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma({
      subscriptions: [subscriptionRow({ status: SubStatus.ACTIVE })],
    })

    await makeHandler(prisma)({
      token: TOKEN,
      body: paymentEvent(
        'PAYMENT_RECEIVED',
        { id: 'pay_002', dueDate: '2026-09-02', paymentDate: '2026-09-02' },
        'evt_002',
      ),
    })

    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      status: InvoiceStatus.PAID,
      gatewayInvoiceId: 'pay_002',
      method: PaymentMethod.PIX_AUTOMATIC,
    })
    // Vencimento 02/09 + 1 mês = 02/10.
    expect(subscriptions[0]?.currentPeriodEnd.toISOString()).toBe('2026-10-02T12:00:00.000Z')
  })

  it('não ressuscita assinatura já encerrada, mas registra o pagamento', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma({
      subscriptions: [subscriptionRow({ status: SubStatus.EXPIRED })],
      invoices: [invoiceRow()],
    })

    await makeHandler(prisma)({ token: TOKEN, body: paymentEvent('PAYMENT_CONFIRMED') })

    expect(invoices[0]?.status).toBe(InvoiceStatus.PAID)
    expect(subscriptions[0]?.status).toBe(SubStatus.EXPIRED)
  })

  it('ignora (200) pagamento de assinatura desconhecida', async () => {
    const { prisma } = createFakePrisma({ subscriptions: [] })
    const result = await makeHandler(prisma)({
      token: TOKEN,
      body: paymentEvent('PAYMENT_CONFIRMED'),
    })
    expect(result).toMatchObject({ httpStatus: 200, outcome: 'ignored' })
  })
})

describe('PAYMENT_OVERDUE', () => {
  it('marca a fatura como FAILED com attempts++ e a assinatura como PAST_DUE', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma({
      subscriptions: [subscriptionRow({ status: SubStatus.ACTIVE })],
      invoices: [invoiceRow()],
    })

    await makeHandler(prisma)({ token: TOKEN, body: paymentEvent('PAYMENT_OVERDUE') })

    expect(invoices[0]).toMatchObject({ status: InvoiceStatus.FAILED, attempts: 1 })
    expect(invoices[0]?.failureReason).toContain('vencida')
    expect(subscriptions[0]?.status).toBe(SubStatus.PAST_DUE)
  })
})

describe('PAYMENT_REFUNDED', () => {
  it('marca a fatura como REFUNDED sem mexer no status da assinatura', async () => {
    const { prisma, subscriptions, invoices } = createFakePrisma({
      subscriptions: [subscriptionRow({ status: SubStatus.ACTIVE })],
      invoices: [invoiceRow({ gatewayInvoiceId: 'pay_001', status: InvoiceStatus.PAID })],
    })

    await makeHandler(prisma)({ token: TOKEN, body: paymentEvent('PAYMENT_REFUNDED') })

    expect(invoices[0]?.status).toBe(InvoiceStatus.REFUNDED)
    expect(subscriptions[0]?.status).toBe(SubStatus.ACTIVE)
  })
})

describe('SUBSCRIPTION_DELETED', () => {
  it('cancela a assinatura quando o cancelamento veio do lado do Asaas', async () => {
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [subscriptionRow({ status: SubStatus.ACTIVE })],
    })

    await makeHandler(prisma)({
      token: TOKEN,
      body: { id: 'evt_003', event: 'SUBSCRIPTION_DELETED', subscription: 'sub_gw_1' },
    })

    expect(subscriptions[0]?.status).toBe(SubStatus.CANCELED)
    expect(subscriptions[0]?.canceledAt).toEqual(NOW)
  })

  it('NÃO corta o acesso quando é o eco do nosso próprio cancelamento agendado', async () => {
    // `service.cancel` derruba no gateway na hora, mas o acesso vai até currentPeriodEnd.
    const { prisma, subscriptions } = createFakePrisma({
      subscriptions: [
        subscriptionRow({
          status: SubStatus.ACTIVE,
          cancelAtPeriodEnd: true,
          canceledAt: new Date('2026-08-20T10:00:00Z'),
          currentPeriodEnd: new Date('2026-09-30T15:00:00Z'),
        }),
      ],
    })

    const result = await makeHandler(prisma)({
      token: TOKEN,
      body: { id: 'evt_004', event: 'SUBSCRIPTION_DELETED', subscription: 'sub_gw_1' },
    })

    expect(result.outcome).toBe('processed')
    expect(subscriptions[0]?.status).toBe(SubStatus.ACTIVE)
    expect(subscriptions[0]?.cancelAtPeriodEnd).toBe(true)
  })
})

describe('eventos não tratados', () => {
  it('marca como processado e devolve 200 (não vira reentrega infinita)', async () => {
    const { prisma, events } = createFakePrisma()
    const result = await makeHandler(prisma)({
      token: TOKEN,
      body: { id: 'evt_005', event: 'PAYMENT_CREATED', payment: { id: 'pay_005' } },
    })

    expect(result).toMatchObject({ httpStatus: 200, outcome: 'ignored' })
    expect(events[0]?.processedAt).toEqual(NOW)
  })
})

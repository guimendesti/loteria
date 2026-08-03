/**
 * Testes do serviço de assinaturas (`server/lib/billing/service.ts`) e da aritmética de
 * período/preço (`server/lib/billing/period.ts`).
 *
 * Sem banco, sem rede: um duplo em memória para a porta `BillingPrisma` e um gateway
 * falso que grava as chamadas. É o que torna verificável a regra que mais importa aqui —
 * ⛔ o valor cobrado depende SÓ de (plano × ciclo × meio de pagamento).
 */
import { describe, expect, it } from 'vitest'
import { BillingCycle, InvoiceStatus, PaymentMethod, SubStatus } from '@lotopro/db'
import {
  addCycle,
  addMonths,
  chargeAmountCents,
  daysBetween,
  formatDueDate,
  parseDueDate,
  planPriceCents,
} from '@/server/lib/billing/period'
import {
  createBillingService,
  encodeScheduledDowngrade,
  hasActiveAccess,
  mapGatewaySubscriptionStatus,
  resolveScheduledPlanSlug,
  type BillingInvoiceCreateData,
  type BillingInvoiceRow,
  type BillingPlanRow,
  type BillingPrisma,
  type BillingSubscriptionCreateData,
  type BillingSubscriptionRow,
  type BillingSubscriptionUpdateData,
  type BillingUserRow,
} from '@/server/lib/billing/service'
import { BillingError, type BillingGateway } from '@/server/lib/billing/types'

// ─── Duplos ───────────────────────────────────────────────────────────────────

const PLANS: BillingPlanRow[] = [
  {
    id: 'plan-free',
    slug: 'free',
    name: 'Apostador',
    priceMonthlyCents: 0n,
    priceYearlyCents: 0n,
    isPublic: true,
    displayOrder: 1,
  },
  {
    id: 'plan-premium',
    slug: 'premium',
    name: 'Estrategista',
    priceMonthlyCents: 2490n,
    priceYearlyCents: 24900n,
    isPublic: true,
    displayOrder: 2,
  },
  {
    id: 'plan-pro',
    slug: 'pro',
    name: 'Bolão Master',
    priceMonthlyCents: 5990n,
    priceYearlyCents: 59900n,
    isPublic: true,
    displayOrder: 3,
  },
  {
    id: 'plan-whitelabel',
    slug: 'whitelabel',
    name: 'White-label',
    priceMonthlyCents: 34900n,
    priceYearlyCents: 418800n,
    isPublic: false,
    displayOrder: 4,
  },
]

const USER: BillingUserRow = { id: 'user-1', name: 'Márcia', email: 'marcia@example.com' }

function applySubscriptionUpdate(
  row: BillingSubscriptionRow,
  data: BillingSubscriptionUpdateData,
): void {
  if (data.planId !== undefined) row.planId = data.planId
  if (data.status !== undefined) row.status = data.status
  if (data.billingCycle !== undefined) row.billingCycle = data.billingCycle
  if (data.paymentMethod !== undefined) row.paymentMethod = data.paymentMethod
  if (data.gatewaySubscriptionId !== undefined) row.gatewaySubscriptionId = data.gatewaySubscriptionId
  if (data.gatewayCustomerId !== undefined) row.gatewayCustomerId = data.gatewayCustomerId
  if (data.currentPeriodStart !== undefined) row.currentPeriodStart = data.currentPeriodStart
  if (data.currentPeriodEnd !== undefined) row.currentPeriodEnd = data.currentPeriodEnd
  if (data.trialEndsAt !== undefined) row.trialEndsAt = data.trialEndsAt
  if (data.cancelAtPeriodEnd !== undefined) row.cancelAtPeriodEnd = data.cancelAtPeriodEnd
  if (data.canceledAt !== undefined) row.canceledAt = data.canceledAt
  if (data.cancelReason !== undefined) row.cancelReason = data.cancelReason
}

function createFakePrisma(seed: { subscription?: BillingSubscriptionRow } = {}) {
  const subscriptions: BillingSubscriptionRow[] = seed.subscription ? [seed.subscription] : []
  const invoices: BillingInvoiceRow[] = []
  let sequence = 0

  const prisma: BillingPrisma = {
    plan: {
      findUnique: async ({ where }) => PLANS.find((plan) => plan.slug === where.slug) ?? null,
      findMany: async ({ where }) =>
        PLANS.filter((plan) => where?.isPublic === undefined || plan.isPublic === where.isPublic),
    },
    user: {
      findUnique: async ({ where }) => (where.id === USER.id ? USER : null),
    },
    subscription: {
      findUnique: async ({ where }) =>
        subscriptions.find((row) => row.userId === where.userId) ?? null,
      create: async ({ data }: { data: BillingSubscriptionCreateData }) => {
        sequence += 1
        const row: BillingSubscriptionRow = {
          id: `sub-${sequence}`,
          userId: data.userId,
          planId: data.planId,
          status: data.status,
          billingCycle: data.billingCycle,
          paymentMethod: data.paymentMethod,
          gatewaySubscriptionId: data.gatewaySubscriptionId ?? null,
          gatewayCustomerId: data.gatewayCustomerId ?? null,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          trialEndsAt: data.trialEndsAt ?? null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          canceledAt: data.canceledAt ?? null,
          cancelReason: data.cancelReason ?? null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        }
        subscriptions.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const row = subscriptions.find((item) => item.id === where.id)
        if (!row) throw new Error(`subscription ${where.id} não existe no duplo`)
        applySubscriptionUpdate(row, data)
        return row
      },
    },
    invoice: {
      create: async ({ data }: { data: BillingInvoiceCreateData }) => {
        sequence += 1
        const row: BillingInvoiceRow = {
          id: `inv-${sequence}`,
          subscriptionId: data.subscriptionId,
          amountCents: data.amountCents,
          status: data.status,
          method: data.method,
          gatewayInvoiceId: data.gatewayInvoiceId ?? null,
          dueAt: data.dueAt,
          paidAt: null,
          attempts: 0,
          failureReason: null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        }
        invoices.push(row)
        return row
      },
      findMany: async ({ where, take, skip }) =>
        invoices.filter((row) => row.subscriptionId === where.subscriptionId).slice(skip, skip + take),
    },
  }

  return { prisma, subscriptions, invoices }
}

interface GatewayCall {
  method: string
  args: unknown[]
}

function createFakeGateway(options: { subscriptionStatus?: string } = {}) {
  const calls: GatewayCall[] = []
  let counter = 0

  const gateway: BillingGateway = {
    createCustomer: async (input) => {
      calls.push({ method: 'createCustomer', args: [input] })
      counter += 1
      return { id: `cus_${counter}` }
    },
    createSubscription: async (input) => {
      calls.push({ method: 'createSubscription', args: [input] })
      counter += 1
      return { id: `sub_${counter}`, status: options.subscriptionStatus ?? 'ACTIVE' }
    },
    updateSubscription: async (id, input) => {
      calls.push({ method: 'updateSubscription', args: [id, input] })
      return {}
    },
    cancelSubscription: async (id) => {
      calls.push({ method: 'cancelSubscription', args: [id] })
      return { deleted: true }
    },
    getSubscription: async (id) => {
      calls.push({ method: 'getSubscription', args: [id] })
      return {}
    },
    getPayment: async (id) => {
      calls.push({ method: 'getPayment', args: [id] })
      return { id, status: 'PENDING', valueCents: 0n, dueDate: '2026-08-01' }
    },
    listPaymentsBySubscription: async (id) => {
      calls.push({ method: 'listPaymentsBySubscription', args: [id] })
      return []
    },
  }

  return { gateway, calls }
}

const NOW = new Date('2026-08-02T15:00:00Z')

function baseSubscription(overrides: Partial<BillingSubscriptionRow> = {}): BillingSubscriptionRow {
  return {
    id: 'sub-existing',
    userId: USER.id,
    planId: 'plan-premium',
    status: SubStatus.ACTIVE,
    billingCycle: BillingCycle.MONTHLY,
    paymentMethod: PaymentMethod.PIX_AUTOMATIC,
    gatewaySubscriptionId: 'sub_gw_1',
    gatewayCustomerId: 'cus_gw_1',
    currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  }
}

// ─── Preço e período ──────────────────────────────────────────────────────────

describe('period — aritmética de preço', () => {
  const premium = PLANS[1] as BillingPlanRow

  it('usa o preço do ciclo escolhido', () => {
    expect(planPriceCents(premium, BillingCycle.MONTHLY)).toBe(2490n)
    expect(planPriceCents(premium, BillingCycle.YEARLY)).toBe(24900n)
  })

  it('aplica os 5% de desconto do Pix Automático truncando centavos para baixo (docs/05 §5.5)', () => {
    // 2490 × 5% = 124,5 centavos → desconto de 124, cobrança de 2366.
    expect(chargeAmountCents(premium, BillingCycle.MONTHLY, PaymentMethod.PIX_AUTOMATIC)).toBe(2366n)
    expect(chargeAmountCents(premium, BillingCycle.YEARLY, PaymentMethod.PIX_AUTOMATIC)).toBe(23655n)
  })

  it('não aplica desconto em cartão nem em boleto', () => {
    expect(chargeAmountCents(premium, BillingCycle.MONTHLY, PaymentMethod.CREDIT_CARD)).toBe(2490n)
    expect(chargeAmountCents(premium, BillingCycle.YEARLY, PaymentMethod.BOLETO)).toBe(24900n)
  })

  it('mantém o plano gratuito em zero', () => {
    const free = PLANS[0] as BillingPlanRow
    expect(chargeAmountCents(free, BillingCycle.MONTHLY, PaymentMethod.PIX_AUTOMATIC)).toBe(0n)
  })
})

describe('period — aritmética de datas', () => {
  it('gruda no último dia do mês quando o dia não existe no destino', () => {
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    )
    // 2028 é bissexto.
    expect(addMonths(new Date('2028-01-31T12:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    )
  })

  it('avança 1 mês no ciclo mensal e 12 no anual', () => {
    const start = new Date('2026-08-02T15:00:00Z')
    expect(addCycle(start, BillingCycle.MONTHLY).toISOString()).toBe('2026-09-02T15:00:00.000Z')
    expect(addCycle(start, BillingCycle.YEARLY).toISOString()).toBe('2027-08-02T15:00:00.000Z')
  })

  it('conta dias inteiros de atraso', () => {
    expect(daysBetween(new Date('2026-08-01T10:00:00Z'), new Date('2026-08-04T09:00:00Z'))).toBe(2)
    expect(daysBetween(new Date('2026-08-01T10:00:00Z'), new Date('2026-08-04T11:00:00Z'))).toBe(3)
  })

  it('formata o vencimento no fuso de São Paulo, não em UTC', () => {
    // 03/08 00:30 UTC = 02/08 21:30 em São Paulo — o vencimento é dia 2, não dia 3.
    expect(formatDueDate(new Date('2026-08-03T00:30:00Z'))).toBe('2026-08-02')
  })

  it('faz o round-trip de uma data do Asaas', () => {
    const parsed = parseDueDate('2026-08-02')
    expect(parsed).not.toBeNull()
    expect(formatDueDate(parsed as Date)).toBe('2026-08-02')
    expect(parseDueDate('02/08/2026')).toBeNull()
  })
})

// ─── Convenções de agendamento ────────────────────────────────────────────────

describe('resolveScheduledPlanSlug', () => {
  it('não vê agendamento sem cancelAtPeriodEnd', () => {
    expect(resolveScheduledPlanSlug(baseSubscription())).toBeNull()
  })

  it('lê cancelamento (canceledAt preenchido) como queda para o free', () => {
    const subscription = baseSubscription({
      cancelAtPeriodEnd: true,
      canceledAt: NOW,
      cancelReason: 'caro demais',
    })
    expect(resolveScheduledPlanSlug(subscription)).toBe('free')
  })

  it('decodifica o downgrade agendado a partir de cancelReason', () => {
    const subscription = baseSubscription({
      cancelAtPeriodEnd: true,
      cancelReason: encodeScheduledDowngrade('premium'),
    })
    expect(resolveScheduledPlanSlug(subscription)).toBe('premium')
  })
})

describe('mapGatewaySubscriptionStatus', () => {
  it('só considera ACTIVE quando o gateway diz ACTIVE', () => {
    expect(mapGatewaySubscriptionStatus('ACTIVE')).toBe(SubStatus.ACTIVE)
    expect(mapGatewaySubscriptionStatus('active')).toBe(SubStatus.ACTIVE)
    expect(mapGatewaySubscriptionStatus('EXPIRED')).toBe(SubStatus.EXPIRED)
    // Sem PENDING no enum do Prisma: pendente entra na janela de graça.
    expect(mapGatewaySubscriptionStatus('PENDING')).toBe(SubStatus.PAST_DUE)
  })
})

// ─── startTrial ───────────────────────────────────────────────────────────────

describe('startTrial (docs/05 §5.4 — 14 dias de Pro, sem cartão)', () => {
  it('cria assinatura TRIALING de 14 dias sem NENHUMA chamada ao gateway', async () => {
    const { prisma } = createFakePrisma()
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const subscription = await service.startTrial(USER.id)

    expect(subscription.status).toBe(SubStatus.TRIALING)
    expect(subscription.planId).toBe('plan-pro')
    expect(subscription.gatewaySubscriptionId).toBeNull()
    expect(subscription.trialEndsAt?.toISOString()).toBe('2026-08-16T15:00:00.000Z')
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-08-16T15:00:00.000Z')
    expect(calls).toHaveLength(0)
  })

  it('recusa o segundo trial do mesmo usuário', async () => {
    const { prisma } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(service.startTrial(USER.id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

// ─── subscribe ────────────────────────────────────────────────────────────────

describe('subscribe (CL-105)', () => {
  it('cria customer + assinatura no gateway e persiste Subscription ACTIVE + Invoice PENDING', async () => {
    const { prisma, invoices } = createFakePrisma()
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const result = await service.subscribe({
      userId: USER.id,
      planSlug: 'premium',
      cycle: BillingCycle.MONTHLY,
      method: PaymentMethod.PIX_AUTOMATIC,
    })

    expect(calls.map((call) => call.method)).toEqual(['createCustomer', 'createSubscription'])
    expect(calls[1]?.args[0]).toMatchObject({
      customerId: 'cus_1',
      billingType: 'PIX',
      cycle: 'MONTHLY',
      valueCents: 2366n, // preço com o incentivo de Pix — nada a ver com aposta
      nextDueDate: '2026-08-02',
      externalReference: USER.id,
    })

    expect(result.subscription.status).toBe(SubStatus.ACTIVE)
    expect(result.subscription.gatewaySubscriptionId).toBe('sub_2')
    expect(result.subscription.currentPeriodEnd.toISOString()).toBe('2026-09-02T15:00:00.000Z')

    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      amountCents: 2366n,
      status: InvoiceStatus.PENDING,
      method: PaymentMethod.PIX_AUTOMATIC,
      gatewayInvoiceId: null, // o webhook adota esta linha no primeiro PAYMENT_*
    })
  })

  it('converte trial em assinatura paga reaproveitando a mesma linha', async () => {
    const trial = baseSubscription({
      id: 'sub-trial',
      planId: 'plan-pro',
      status: SubStatus.TRIALING,
      gatewaySubscriptionId: null,
      gatewayCustomerId: null,
      trialEndsAt: new Date('2026-08-16T15:00:00Z'),
      currentPeriodEnd: new Date('2026-08-16T15:00:00Z'),
    })
    const { prisma, subscriptions } = createFakePrisma({ subscription: trial })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await service.subscribe({
      userId: USER.id,
      planSlug: 'pro',
      cycle: BillingCycle.YEARLY,
      method: PaymentMethod.CREDIT_CARD,
    })

    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]).toMatchObject({
      id: 'sub-trial',
      status: SubStatus.ACTIVE,
      billingCycle: BillingCycle.YEARLY,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      trialEndsAt: null,
    })
  })

  it('deixa em PAST_DUE (janela de graça) quando o gateway não devolve ACTIVE', async () => {
    const { prisma } = createFakePrisma()
    const { gateway } = createFakeGateway({ subscriptionStatus: 'PENDING' })
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const result = await service.subscribe({
      userId: USER.id,
      planSlug: 'premium',
      cycle: BillingCycle.MONTHLY,
      method: PaymentMethod.PIX_AUTOMATIC,
    })

    expect(result.subscription.status).toBe(SubStatus.PAST_DUE)
  })

  it('recusa assinar o plano free, o plano sob consulta e boleto mensal', async () => {
    const { prisma } = createFakePrisma()
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(
      service.subscribe({
        userId: USER.id,
        planSlug: 'free',
        cycle: BillingCycle.MONTHLY,
        method: PaymentMethod.PIX_AUTOMATIC,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await expect(
      service.subscribe({
        userId: USER.id,
        planSlug: 'whitelabel',
        cycle: BillingCycle.MONTHLY,
        method: PaymentMethod.PIX_AUTOMATIC,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // docs/05 §5.5, decisão 4 — boleto só no anual.
    await expect(
      service.subscribe({
        userId: USER.id,
        planSlug: 'premium',
        cycle: BillingCycle.MONTHLY,
        method: PaymentMethod.BOLETO,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('recusa assinar de novo quem já tem assinatura no gateway', async () => {
    const { prisma } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(
      service.subscribe({
        userId: USER.id,
        planSlug: 'pro',
        cycle: BillingCycle.MONTHLY,
        method: PaymentMethod.PIX_AUTOMATIC,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('traduz falha do gateway em BillingError de gateway, sem persistir nada', async () => {
    const { prisma, subscriptions } = createFakePrisma()
    const gateway: BillingGateway = {
      ...createFakeGateway().gateway,
      createCustomer: async () => {
        throw new Error('502 Bad Gateway')
      },
    }
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(
      service.subscribe({
        userId: USER.id,
        planSlug: 'premium',
        cycle: BillingCycle.MONTHLY,
        method: PaymentMethod.PIX_AUTOMATIC,
      }),
    ).rejects.toBeInstanceOf(BillingError)
    expect(subscriptions).toHaveLength(0)
  })
})

// ─── changePlan ───────────────────────────────────────────────────────────────

describe('changePlan (CL-105)', () => {
  it('upgrade vale na hora: atualiza o valor no gateway e troca o plano local', async () => {
    const { prisma, subscriptions } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const result = await service.changePlan({ userId: USER.id, planSlug: 'pro' })

    expect(result.applied).toBe('immediate')
    expect(calls[0]).toMatchObject({
      method: 'updateSubscription',
      args: ['sub_gw_1', { valueCents: 5691n }], // 5990 - 5% = 5691
    })
    expect(subscriptions[0]?.planId).toBe('plan-pro')
    expect(subscriptions[0]?.cancelAtPeriodEnd).toBe(false)
  })

  it('downgrade é agendado para o fim do período e NÃO troca o plano agora', async () => {
    const subscription = baseSubscription({ planId: 'plan-pro' })
    const { prisma, subscriptions } = createFakePrisma({ subscription })
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const result = await service.changePlan({ userId: USER.id, planSlug: 'premium' })

    expect(result.applied).toBe('scheduled')
    expect(result.effectiveAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    // O valor no gateway já cai — a PRÓXIMA cobrança sai menor.
    expect(calls[0]?.args[1]).toMatchObject({ valueCents: 2366n })
    // ...mas o acesso continua sendo o do plano pago atual até o fim do período.
    expect(subscriptions[0]?.planId).toBe('plan-pro')
    expect(subscriptions[0]?.cancelAtPeriodEnd).toBe(true)
    expect(subscriptions[0]?.canceledAt).toBeNull()
    expect(resolveScheduledPlanSlug(subscriptions[0] as BillingSubscriptionRow)).toBe('premium')
  })

  it('recusa trocar para o mesmo plano/ciclo e para o free', async () => {
    const { prisma } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(
      service.changePlan({ userId: USER.id, planSlug: 'premium' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(service.changePlan({ userId: USER.id, planSlug: 'free' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})

// ─── cancel / reactivate ──────────────────────────────────────────────────────

describe('cancel (CL-105)', () => {
  it('cancela no gateway na hora mas mantém o acesso até o fim do período', async () => {
    const { prisma, subscriptions } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    const subscription = await service.cancel({ userId: USER.id, reason: 'caro demais' })

    expect(calls[0]).toMatchObject({ method: 'cancelSubscription', args: ['sub_gw_1'] })
    expect(subscription.cancelAtPeriodEnd).toBe(true)
    expect(subscription.canceledAt?.toISOString()).toBe(NOW.toISOString())
    expect(subscription.cancelReason).toBe('caro demais')
    // Status intacto: quem paga até 01/09 usa até 01/09.
    expect(subscription.status).toBe(SubStatus.ACTIVE)
    expect(hasActiveAccess(subscriptions[0] as BillingSubscriptionRow, NOW)).toBe(true)
  })

  it('não chama o gateway ao cancelar um trial (não há nada lá)', async () => {
    const trial = baseSubscription({ status: SubStatus.TRIALING, gatewaySubscriptionId: null })
    const { prisma } = createFakePrisma({ subscription: trial })
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await service.cancel({ userId: USER.id })
    expect(calls).toHaveLength(0)
  })

  it('recusa cancelar duas vezes', async () => {
    const { prisma } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await service.cancel({ userId: USER.id })
    await expect(service.cancel({ userId: USER.id })).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('reactivate (CL-105)', () => {
  it('recria a assinatura no gateway com a próxima cobrança no fim do período pago', async () => {
    const { prisma, subscriptions } = createFakePrisma({ subscription: baseSubscription() })
    const { gateway, calls } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await service.cancel({ userId: USER.id })
    const reactivated = await service.reactivate({ userId: USER.id })

    const created = calls.find((call) => call.method === 'createSubscription')
    expect(created?.args[0]).toMatchObject({
      customerId: 'cus_gw_1', // reaproveita o customer que já existia
      nextDueDate: '2026-08-31', // 01/09 00:00 UTC = 31/08 21:00 em São Paulo
      valueCents: 2366n,
    })
    expect(reactivated.cancelAtPeriodEnd).toBe(false)
    expect(reactivated.canceledAt).toBeNull()
    expect(subscriptions[0]?.gatewaySubscriptionId).not.toBe('sub_gw_1')
  })

  it('recusa reativar depois que o período acabou', async () => {
    const expired = baseSubscription({
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-07-10T00:00:00Z'),
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    })
    const { prisma } = createFakePrisma({ subscription: expired })
    const { gateway } = createFakeGateway()
    const service = createBillingService({ prisma, gateway, now: () => NOW })

    await expect(service.reactivate({ userId: USER.id })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

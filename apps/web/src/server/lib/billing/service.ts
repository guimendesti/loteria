/**
 * Serviço de assinaturas (docs/05 §5.2/§5.4/§5.5, docs/08 CL-105).
 *
 * Lógica pura e testável: recebe uma porta mínima de Prisma (`BillingPrisma`), a porta do
 * gateway (`BillingGateway`, ver `types.ts`) e um relógio injetável. Não conhece tRPC,
 * Next nem `PrismaClient` — o adapter mora em `prisma-adapter.ts` e a construção do
 * gateway em `gateway.ts`.
 *
 * ⛔ CLAUDE.md: o valor cobrado sai de (plano × ciclo × meio) e de mais nada. Downgrade
 * NUNCA apaga dado do usuário — só troca `planId` (docs/05 §5.4, "nunca apagar dados por
 * downgrade").
 *
 * ── Decisões de modelagem que o schema atual força (docs/07 §7.4) ──────────────────────
 *
 * 1. NÃO existe `Subscription.pendingPlanId`. Um downgrade agendado é codificado em
 *    `cancelAtPeriodEnd = true` + `cancelReason = "scheduled_downgrade:<slug>"`, com
 *    `canceledAt = null`. Um CANCELAMENTO é `cancelAtPeriodEnd = true` + `canceledAt != null`
 *    (alvo implícito: plano `free`), o que deixa `cancelReason` livre para o motivo dado
 *    pelo usuário. `resolveScheduledPlanSlug` é o ÚNICO lugar que lê essa convenção —
 *    quando o schema ganhar `pendingPlanId`/`pendingPlanEffectiveAt`, só ela muda.
 * 2. NÃO existe `SubStatus.PENDING`. Assinatura criada cujo gateway ainda não confirmou o
 *    primeiro pagamento fica em `PAST_DUE` (ver `mapGatewaySubscriptionStatus`) — o mesmo
 *    estado de graça que o dunning já trata e que o webhook `PAYMENT_CONFIRMED` promove a
 *    `ACTIVE`.
 * 3. NÃO existe `Subscription.gatewayCustomerId`. A porta já lê/escreve o campo como
 *    OPCIONAL; hoje o adapter simplesmente não o repassa (cada `subscribe` cria um customer
 *    novo no Asaas, com `externalReference = userId`). Quando a coluna existir, só o
 *    adapter muda. Ver relatório/pendências.
 */
import { BillingCycle, InvoiceStatus, PaymentMethod, SubStatus } from '@lotopro/db'
import {
  BillingError,
  type AsaasBillingType,
  type AsaasCycle,
  type BillingGateway,
} from './types'
import {
  TRIAL_DAYS,
  addCycle,
  addDays,
  chargeAmountCents,
  formatDueDate,
} from './period'

// ─── Porta mínima de Prisma ───────────────────────────────────────────────────

export interface BillingPlanRow {
  id: string
  slug: string
  name: string
  priceMonthlyCents: bigint
  priceYearlyCents: bigint
  isPublic: boolean
  displayOrder: number
}

export interface BillingUserRow {
  id: string
  name: string
  email: string
}

export interface BillingSubscriptionRow {
  id: string
  userId: string
  planId: string
  status: SubStatus
  billingCycle: BillingCycle
  paymentMethod: PaymentMethod
  gatewaySubscriptionId: string | null
  /**
   * Ainda NÃO existe no schema (ver cabeçalho, decisão 3). Opcional para que o adapter
   * atual — que não o devolve — continue estruturalmente compatível.
   */
  gatewayCustomerId?: string | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt: Date | null
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  cancelReason: string | null
  createdAt: Date
}

export interface BillingInvoiceRow {
  id: string
  subscriptionId: string
  amountCents: bigint
  status: InvoiceStatus
  method: PaymentMethod
  gatewayInvoiceId: string | null
  dueAt: Date
  paidAt: Date | null
  attempts: number
  failureReason: string | null
  createdAt: Date
}

export interface BillingSubscriptionCreateData {
  userId: string
  planId: string
  status: SubStatus
  billingCycle: BillingCycle
  paymentMethod: PaymentMethod
  gatewaySubscriptionId?: string | null
  gatewayCustomerId?: string | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt?: Date | null
  cancelAtPeriodEnd?: boolean
  canceledAt?: Date | null
  cancelReason?: string | null
}

export type BillingSubscriptionUpdateData = Partial<Omit<BillingSubscriptionCreateData, 'userId'>>

export interface BillingInvoiceCreateData {
  subscriptionId: string
  amountCents: bigint
  status: InvoiceStatus
  method: PaymentMethod
  gatewayInvoiceId?: string | null
  dueAt: Date
}

export interface BillingPrisma {
  plan: {
    findUnique(args: { where: { slug: string } }): Promise<BillingPlanRow | null>
    findMany(args: { where?: { isPublic?: boolean } }): Promise<BillingPlanRow[]>
  }
  user: {
    findUnique(args: { where: { id: string } }): Promise<BillingUserRow | null>
  }
  subscription: {
    findUnique(args: { where: { userId: string } }): Promise<BillingSubscriptionRow | null>
    create(args: { data: BillingSubscriptionCreateData }): Promise<BillingSubscriptionRow>
    update(args: {
      where: { id: string }
      data: BillingSubscriptionUpdateData
    }): Promise<BillingSubscriptionRow>
  }
  invoice: {
    create(args: { data: BillingInvoiceCreateData }): Promise<BillingInvoiceRow>
    findMany(args: {
      where: { subscriptionId: string }
      take: number
      skip: number
    }): Promise<BillingInvoiceRow[]>
  }
}

export interface BillingServiceDeps {
  prisma: BillingPrisma
  /** Injetado só quando a operação precisa do Asaas — ver `gateway.ts`. */
  gateway: BillingGateway
  now?: () => Date
}

// ─── Constantes de plano ──────────────────────────────────────────────────────

/** Plano de queda: downgrade, fim de trial e D+7 do dunning sempre caem aqui. */
export const FREE_PLAN_SLUG = 'free'
/** docs/05 §5.4 — o trial é de Pro. */
export const TRIAL_PLAN_SLUG = 'pro'

const SCHEDULED_DOWNGRADE_PREFIX = 'scheduled_downgrade:'

// ─── Mapeamentos Prisma ↔ Asaas ───────────────────────────────────────────────

export function toAsaasBillingType(method: PaymentMethod): AsaasBillingType {
  switch (method) {
    case PaymentMethod.PIX_AUTOMATIC:
      return 'PIX'
    case PaymentMethod.CREDIT_CARD:
      return 'CREDIT_CARD'
    case PaymentMethod.BOLETO:
      return 'BOLETO'
  }
}

export function toAsaasCycle(cycle: BillingCycle): AsaasCycle {
  return cycle === BillingCycle.YEARLY ? 'YEARLY' : 'MONTHLY'
}

/**
 * Status do Asaas → `SubStatus` local. Sem `PENDING` no enum do Prisma (ver cabeçalho,
 * decisão 2), tudo que não é `ACTIVE` na criação vira `PAST_DUE`: o usuário mantém acesso
 * de graça (mesma janela do dunning) e o webhook `PAYMENT_CONFIRMED` promove a `ACTIVE`.
 */
export function mapGatewaySubscriptionStatus(status: string): SubStatus {
  const normalized = status.trim().toUpperCase()
  if (normalized === 'ACTIVE') return SubStatus.ACTIVE
  if (normalized === 'EXPIRED') return SubStatus.EXPIRED
  return SubStatus.PAST_DUE
}

// ─── Mudança de plano agendada (fim do período) ───────────────────────────────

export function encodeScheduledDowngrade(planSlug: string): string {
  return `${SCHEDULED_DOWNGRADE_PREFIX}${planSlug}`
}

/**
 * Slug do plano que deve valer a partir de `currentPeriodEnd`, ou `null` se nada está
 * agendado. Convenção descrita no cabeçalho (decisão 1) — único leitor dessa codificação.
 */
export function resolveScheduledPlanSlug(
  subscription: Pick<BillingSubscriptionRow, 'cancelAtPeriodEnd' | 'canceledAt' | 'cancelReason'>,
): string | null {
  if (!subscription.cancelAtPeriodEnd) return null
  if (subscription.canceledAt !== null) return FREE_PLAN_SLUG
  const reason = subscription.cancelReason ?? ''
  if (reason.startsWith(SCHEDULED_DOWNGRADE_PREFIX)) {
    const slug = reason.slice(SCHEDULED_DOWNGRADE_PREFIX.length).trim()
    if (slug.length > 0) return slug
  }
  return FREE_PLAN_SLUG
}

/** `true` enquanto a assinatura dá acesso ao plano pago (o downgrade só vale no fim do período). */
export function hasActiveAccess(
  subscription: Pick<BillingSubscriptionRow, 'status' | 'currentPeriodEnd'>,
  now: Date,
): boolean {
  if (subscription.status === SubStatus.EXPIRED || subscription.status === SubStatus.CANCELED) {
    return false
  }
  return subscription.currentPeriodEnd.getTime() > now.getTime()
}

// ─── Entradas ─────────────────────────────────────────────────────────────────

export interface SubscribeInput {
  userId: string
  planSlug: string
  cycle: BillingCycle
  method: PaymentMethod
}

export interface ChangePlanInput {
  userId: string
  planSlug: string
  /** Ausente = mantém o ciclo atual. */
  cycle?: BillingCycle
}

export interface CancelInput {
  userId: string
  reason?: string
}

export interface SubscribeResult {
  subscription: BillingSubscriptionRow
  invoice: BillingInvoiceRow
  amountCents: bigint
}

export interface ChangePlanResult {
  subscription: BillingSubscriptionRow
  /** `immediate` = upgrade já valendo; `scheduled` = downgrade a partir de `effectiveAt`. */
  applied: 'immediate' | 'scheduled'
  effectiveAt: Date
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export function createBillingService(deps: BillingServiceDeps) {
  const now = deps.now ?? (() => new Date())
  const { prisma, gateway } = deps

  async function requirePlan(slug: string): Promise<BillingPlanRow> {
    const plan = await prisma.plan.findUnique({ where: { slug } })
    if (!plan) {
      throw new BillingError('NOT_FOUND', `Plano "${slug}" não encontrado.`)
    }
    return plan
  }

  async function requireSubscription(userId: string): Promise<BillingSubscriptionRow> {
    const subscription = await prisma.subscription.findUnique({ where: { userId } })
    if (!subscription) {
      throw new BillingError('NOT_FOUND', 'Você ainda não tem uma assinatura.')
    }
    return subscription
  }

  /** Envolve chamadas ao Asaas para o erro chegar ao usuário como falha de gateway, não 500 cru. */
  async function callGateway<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (cause) {
      throw new BillingError(
        'GATEWAY_ERROR',
        `Falha na comunicação com o provedor de pagamento (${operation}). Tente novamente em alguns instantes.`,
        { cause },
      )
    }
  }

  /**
   * docs/05 §5.5, decisão 4 — boleto só faz sentido no plano anual (custo fixo diluído).
   * Regra de negócio explícita para não virar surpresa de margem.
   */
  function assertMethodAllowed(method: PaymentMethod, cycle: BillingCycle): void {
    if (method === PaymentMethod.BOLETO && cycle !== BillingCycle.YEARLY) {
      throw new BillingError(
        'BAD_REQUEST',
        'Boleto está disponível apenas no plano anual. Escolha Pix Automático ou cartão para a cobrança mensal.',
      )
    }
  }

  function assertPlanIsSelfService(plan: BillingPlanRow): void {
    if (plan.slug === FREE_PLAN_SLUG) {
      throw new BillingError(
        'BAD_REQUEST',
        'O plano gratuito não é assinado: para voltar a ele, cancele a assinatura atual.',
      )
    }
    if (!plan.isPublic) {
      throw new BillingError(
        'FORBIDDEN',
        `O plano ${plan.name} é vendido sob consulta comercial — fale com a equipe.`,
      )
    }
  }

  return {
    /**
     * CL-105 / docs/05 §5.4 — 14 dias de Pro, SEM cartão e SEM gateway. Nenhuma chamada
     * ao Asaas acontece aqui (é justamente o ponto: zero atrito de ativação).
     * Uma vez por usuário: `Subscription.userId` é `@unique`, então a existência de
     * qualquer linha (mesmo expirada) significa que o trial já foi consumido.
     */
    async startTrial(userId: string): Promise<BillingSubscriptionRow> {
      const existing = await prisma.subscription.findUnique({ where: { userId } })
      if (existing) {
        throw new BillingError(
          'CONFLICT',
          'Seu período de teste já foi usado. Escolha um plano para continuar.',
        )
      }

      const plan = await requirePlan(TRIAL_PLAN_SLUG)
      const startedAt = now()
      const endsAt = addDays(startedAt, TRIAL_DAYS)

      return prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: SubStatus.TRIALING,
          billingCycle: BillingCycle.MONTHLY,
          // Sem meio de pagamento escolhido ainda; o padrão do produto é Pix Automático
          // (docs/05 §5.5, decisão 1) e `subscribe` sobrescreve com a escolha real.
          paymentMethod: PaymentMethod.PIX_AUTOMATIC,
          gatewaySubscriptionId: null,
          currentPeriodStart: startedAt,
          currentPeriodEnd: endsAt,
          trialEndsAt: endsAt,
        },
      })
    },

    /**
     * CL-105 — assina um plano pago. Cria (ou reaproveita) o customer no Asaas, cria a
     * assinatura lá e persiste `Subscription` + primeira `Invoice` PENDING.
     *
     * A `Invoice` nasce sem `gatewayInvoiceId` porque `createSubscription` não devolve o
     * id do primeiro pagamento; o webhook adota essa linha ao receber o primeiro
     * `PAYMENT_*` da assinatura (ver `webhook.ts`, `resolveInvoice`).
     */
    async subscribe(input: SubscribeInput): Promise<SubscribeResult> {
      const plan = await requirePlan(input.planSlug)
      assertPlanIsSelfService(plan)
      assertMethodAllowed(input.method, input.cycle)

      const user = await prisma.user.findUnique({ where: { id: input.userId } })
      if (!user) {
        throw new BillingError('NOT_FOUND', 'Usuário não encontrado.')
      }

      const existing = await prisma.subscription.findUnique({ where: { userId: input.userId } })
      if (existing?.gatewaySubscriptionId != null && existing.status !== SubStatus.CANCELED) {
        throw new BillingError(
          'CONFLICT',
          'Você já tem uma assinatura ativa. Use a troca de plano para mudar de plano ou ciclo.',
        )
      }

      const amountCents = chargeAmountCents(plan, input.cycle, input.method)
      const startedAt = now()

      const customerId =
        existing?.gatewayCustomerId ??
        (
          await callGateway('createCustomer', () =>
            gateway.createCustomer({
              name: user.name,
              email: user.email,
              externalReference: user.id,
            }),
          )
        ).id

      const gatewaySubscription = await callGateway('createSubscription', () =>
        gateway.createSubscription({
          customerId,
          billingType: toAsaasBillingType(input.method),
          valueCents: amountCents,
          nextDueDate: formatDueDate(startedAt),
          cycle: toAsaasCycle(input.cycle),
          description: `LotoPro ${plan.name} (${input.cycle === BillingCycle.YEARLY ? 'anual' : 'mensal'})`,
          externalReference: user.id,
        }),
      )

      const periodEnd = addCycle(startedAt, input.cycle)
      const status = mapGatewaySubscriptionStatus(gatewaySubscription.status)

      const subscription = existing
        ? await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              planId: plan.id,
              status,
              billingCycle: input.cycle,
              paymentMethod: input.method,
              gatewaySubscriptionId: gatewaySubscription.id,
              gatewayCustomerId: customerId,
              currentPeriodStart: startedAt,
              currentPeriodEnd: periodEnd,
              trialEndsAt: null,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              cancelReason: null,
            },
          })
        : await prisma.subscription.create({
            data: {
              userId: user.id,
              planId: plan.id,
              status,
              billingCycle: input.cycle,
              paymentMethod: input.method,
              gatewaySubscriptionId: gatewaySubscription.id,
              gatewayCustomerId: customerId,
              currentPeriodStart: startedAt,
              currentPeriodEnd: periodEnd,
            },
          })

      const invoice = await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amountCents,
          status: InvoiceStatus.PENDING,
          method: input.method,
          gatewayInvoiceId: null,
          dueAt: startedAt,
        },
      })

      return { subscription, invoice, amountCents }
    },

    /**
     * CL-105 — troca de plano/ciclo.
     *  · UPGRADE (valor maior): imediato. `updateSubscription` no Asaas e `planId` local já
     *    trocado. SEM pró-rata nesta fase — o Asaas cobra o novo valor no próximo
     *    vencimento e o usuário ganha o restante do período; documentado como pendência.
     *  · DOWNGRADE (valor menor ou igual): agendado para `currentPeriodEnd`. O valor no
     *    gateway JÁ é atualizado (a próxima cobrança sai menor) e o `planId` local só muda
     *    quando o job `billing-dunning` aplica a mudança agendada. Assim o usuário usa até
     *    o fim o que já pagou — e nenhum dado é apagado (docs/05 §5.4).
     */
    async changePlan(input: ChangePlanInput): Promise<ChangePlanResult> {
      const subscription = await requireSubscription(input.userId)
      const gatewaySubscriptionId = subscription.gatewaySubscriptionId
      if (gatewaySubscriptionId === null) {
        throw new BillingError(
          'BAD_REQUEST',
          'Você ainda não tem uma assinatura paga. Escolha um plano para assinar.',
        )
      }
      if (subscription.status === SubStatus.EXPIRED || subscription.status === SubStatus.CANCELED) {
        throw new BillingError(
          'BAD_REQUEST',
          'Sua assinatura não está mais ativa. Assine novamente para escolher um plano.',
        )
      }

      const targetCycle = input.cycle ?? subscription.billingCycle

      if (input.planSlug === FREE_PLAN_SLUG) {
        throw new BillingError(
          'BAD_REQUEST',
          'Para voltar ao plano gratuito, use o cancelamento — o acesso continua até o fim do período pago.',
        )
      }

      const targetPlan = await requirePlan(input.planSlug)
      assertPlanIsSelfService(targetPlan)
      assertMethodAllowed(subscription.paymentMethod, targetCycle)

      // O plano atual é conhecido por `planId`, e a porta mínima só expõe busca por slug —
      // a tabela `Plan` tem 4 linhas (docs/05 §5.2), então varrer todas é mais barato que
      // alargar a porta com um `findUnique({ id })` usado uma vez só.
      const allPlans = await prisma.plan.findMany({})
      const currentPlanRow = allPlans.find((plan) => plan.id === subscription.planId)
      if (!currentPlanRow) {
        throw new BillingError('NOT_FOUND', 'Plano atual não encontrado.')
      }

      if (currentPlanRow.id === targetPlan.id && subscription.billingCycle === targetCycle) {
        throw new BillingError('BAD_REQUEST', `Você já está no plano ${targetPlan.name}.`)
      }

      const currentAmount = chargeAmountCents(
        currentPlanRow,
        subscription.billingCycle,
        subscription.paymentMethod,
      )
      const targetAmount = chargeAmountCents(targetPlan, targetCycle, subscription.paymentMethod)

      await callGateway('updateSubscription', () =>
        gateway.updateSubscription(gatewaySubscriptionId, { valueCents: targetAmount }),
      )

      if (targetAmount > currentAmount) {
        const updated = await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: targetPlan.id,
            billingCycle: targetCycle,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            cancelReason: null,
          },
        })
        return { subscription: updated, applied: 'immediate', effectiveAt: now() }
      }

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: null,
          cancelReason: encodeScheduledDowngrade(targetPlan.slug),
        },
      })
      return {
        subscription: updated,
        applied: 'scheduled',
        effectiveAt: subscription.currentPeriodEnd,
      }
    },

    /**
     * CL-105 — cancelamento. DECISÃO desta fase: cancelamos no gateway IMEDIATAMENTE
     * (não há job de "cancelar no fim do período", e deixar a assinatura viva no Asaas
     * arriscaria uma cobrança a mais), mas o acesso local continua até `currentPeriodEnd`
     * — `cancelAtPeriodEnd = true` com o status atual preservado. Quem finaliza é o
     * `billing-dunning` (passe de mudanças agendadas), que no fim do período move para
     * `CANCELED` + plano free. Nenhum dado é apagado.
     */
    async cancel(input: CancelInput): Promise<BillingSubscriptionRow> {
      const subscription = await requireSubscription(input.userId)
      if (subscription.status === SubStatus.CANCELED || subscription.status === SubStatus.EXPIRED) {
        throw new BillingError('CONFLICT', 'Esta assinatura já está encerrada.')
      }
      if (subscription.cancelAtPeriodEnd && subscription.canceledAt !== null) {
        throw new BillingError('CONFLICT', 'Sua assinatura já está marcada para cancelamento.')
      }

      const gatewaySubscriptionId = subscription.gatewaySubscriptionId
      if (gatewaySubscriptionId !== null) {
        await callGateway('cancelSubscription', () =>
          gateway.cancelSubscription(gatewaySubscriptionId),
        )
      }

      return prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: now(),
          cancelReason: input.reason ?? null,
        },
      })
    },

    /**
     * CL-105 — desfaz um cancelamento (ou downgrade agendado) enquanto o período pago
     * ainda corre. Como o cancelamento derruba a assinatura no Asaas na hora, reativar
     * significa CRIAR UMA NOVA assinatura no gateway, com a primeira cobrança no dia em
     * que o período atual termina (o usuário não paga duas vezes o mesmo mês).
     */
    async reactivate(input: { userId: string }): Promise<BillingSubscriptionRow> {
      const subscription = await requireSubscription(input.userId)
      const instant = now()

      if (!subscription.cancelAtPeriodEnd) {
        throw new BillingError('CONFLICT', 'Sua assinatura não está marcada para encerrar.')
      }
      if (!hasActiveAccess(subscription, instant)) {
        throw new BillingError(
          'CONFLICT',
          'O período da sua assinatura já terminou. Assine novamente para voltar a um plano pago.',
        )
      }

      // Trial cancelado: não há nada no gateway para recriar.
      if (subscription.gatewaySubscriptionId === null) {
        return prisma.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: false, canceledAt: null, cancelReason: null },
        })
      }

      const allPlans = await prisma.plan.findMany({})
      const plan = allPlans.find((row) => row.id === subscription.planId)
      if (!plan) {
        throw new BillingError('NOT_FOUND', 'Plano atual não encontrado.')
      }

      const user = await prisma.user.findUnique({ where: { id: input.userId } })
      if (!user) {
        throw new BillingError('NOT_FOUND', 'Usuário não encontrado.')
      }

      const amountCents = chargeAmountCents(
        plan,
        subscription.billingCycle,
        subscription.paymentMethod,
      )
      const customerId =
        subscription.gatewayCustomerId ??
        (
          await callGateway('createCustomer', () =>
            gateway.createCustomer({
              name: user.name,
              email: user.email,
              externalReference: user.id,
            }),
          )
        ).id

      const gatewaySubscription = await callGateway('createSubscription', () =>
        gateway.createSubscription({
          customerId,
          billingType: toAsaasBillingType(subscription.paymentMethod),
          valueCents: amountCents,
          // Próxima cobrança no fim do período já pago — nunca cobra duas vezes o mesmo ciclo.
          nextDueDate: formatDueDate(subscription.currentPeriodEnd),
          cycle: toAsaasCycle(subscription.billingCycle),
          description: `LotoPro ${plan.name} (reativação)`,
          externalReference: user.id,
        }),
      )

      return prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: mapGatewaySubscriptionStatus(gatewaySubscription.status),
          gatewaySubscriptionId: gatewaySubscription.id,
          gatewayCustomerId: customerId,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          cancelReason: null,
        },
      })
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>

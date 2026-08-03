/**
 * Router `billing` — CL-104 (plano atual), CL-105 (assinar/trocar/cancelar), CL-106
 * (histórico de faturas). Camada fina: valida entrada com Zod, delega a
 * `server/lib/billing/service.ts` e traduz `BillingError` para `TRPCError`.
 *
 * ⛔ CLAUDE.md: nenhuma procedure aqui recebe ou repassa valor de aposta/bolão. O único
 * dinheiro que trafega é o preço da ASSINATURA, que sai de (plano × ciclo × meio).
 *
 * As leituras (`plans.list`, `subscription.current`, `invoices.list`) vão direto ao
 * Prisma do contexto — não precisam de gateway nem de regra de domínio. As mutations
 * passam pelo serviço e só elas carregam o cliente Asaas (`getBillingGateway`, tardio).
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { BillingCycle, PaymentMethod, SubStatus } from '@lotopro/db'
import { protectedProcedure, publicProcedure, router } from '@/server/trpc'
import {
  FREE_PLAN_SLUG,
  createBillingService,
  hasActiveAccess,
  resolveScheduledPlanSlug,
} from '@/server/lib/billing/service'
import { createBillingPrismaAdapter } from '@/server/lib/billing/prisma-adapter'
import { getBillingGateway } from '@/server/lib/billing/gateway'
import { BillingError, type BillingGateway } from '@/server/lib/billing/types'
import { chargeAmountCents, planPriceCents } from '@/server/lib/billing/period'
import type { PrismaClient } from '@lotopro/db'

const DEFAULT_INVOICE_LIMIT = 12
const MAX_INVOICE_LIMIT = 50

const planSlugSchema = z
  .string()
  .min(1, 'Informe o plano.')
  .max(50)
  // Planos são DADO (tabela `Plan`), não código — nada de enum literal aqui: um plano
  // novo entra por INSERT, sem deploy (mesmo princípio de CLAUDE.md §6 p/ modalidades).
  .regex(/^[a-z0-9-]+$/, 'Plano inválido.')

const billingCycleSchema = z.nativeEnum(BillingCycle)
const paymentMethodSchema = z.nativeEnum(PaymentMethod)

/** `BillingError.code` → código tRPC. Mantém a mensagem em PT-BR do domínio. */
function toTRPCError(error: unknown): never {
  if (error instanceof BillingError) {
    const code =
      error.code === 'GATEWAY_ERROR'
        ? ('BAD_GATEWAY' as const)
        : error.code === 'CONFLICT'
          ? ('CONFLICT' as const)
          : error.code === 'FORBIDDEN'
            ? ('FORBIDDEN' as const)
            : error.code === 'NOT_FOUND'
              ? ('NOT_FOUND' as const)
              : ('BAD_REQUEST' as const)
    throw new TRPCError({ code, message: error.message, cause: error })
  }
  throw error
}

async function withService<T>(
  prisma: PrismaClient,
  run: (service: ReturnType<typeof createBillingService>) => Promise<T>,
): Promise<T> {
  try {
    const gateway = await getBillingGateway()
    const service = createBillingService({ prisma: createBillingPrismaAdapter(prisma), gateway })
    return await run(service)
  } catch (error) {
    return toTRPCError(error)
  }
}

export const billingRouter = router({
  plans: router({
    /**
     * CL-104 / landing — planos públicos com os DOIS preços relevantes por ciclo: o de
     * tabela e o com o incentivo de 5% do Pix Automático (docs/05 §5.5). Assim a UI de
     * checkout não recalcula desconto (e não diverge da cobrança real).
     */
    list: publicProcedure.query(async ({ ctx }) => {
      const plans = await ctx.prisma.plan.findMany({
        where: { isPublic: true },
        orderBy: { displayOrder: 'asc' },
      })

      return plans.map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        entitlements: plan.entitlements,
        displayOrder: plan.displayOrder,
        priceMonthlyCents: planPriceCents(plan, BillingCycle.MONTHLY),
        priceYearlyCents: planPriceCents(plan, BillingCycle.YEARLY),
        pixMonthlyCents: chargeAmountCents(plan, BillingCycle.MONTHLY, PaymentMethod.PIX_AUTOMATIC),
        pixYearlyCents: chargeAmountCents(plan, BillingCycle.YEARLY, PaymentMethod.PIX_AUTOMATIC),
      }))
    }),
  }),

  subscription: router({
    /**
     * CL-104 — plano atual. Devolve `null` para quem nunca assinou (o cliente trata como
     * plano gratuito). `scheduledPlanSlug` avisa a UI que já existe um downgrade/
     * cancelamento marcado para `currentPeriodEnd`.
     */
    current: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await ctx.prisma.subscription.findUnique({
        where: { userId: ctx.session.user.id },
        include: { plan: true },
      })
      if (!subscription) return null

      const now = new Date()
      return {
        id: subscription.id,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        paymentMethod: subscription.paymentMethod,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        isTrialing: subscription.status === SubStatus.TRIALING,
        hasAccess: hasActiveAccess(subscription, now),
        scheduledPlanSlug: resolveScheduledPlanSlug(subscription),
        plan: {
          id: subscription.plan.id,
          slug: subscription.plan.slug,
          name: subscription.plan.name,
          entitlements: subscription.plan.entitlements,
        },
        amountCents: chargeAmountCents(
          subscription.plan,
          subscription.billingCycle,
          subscription.paymentMethod,
        ),
      }
    }),
  }),

  invoices: router({
    /** CL-106 — histórico de faturas do usuário, mais recentes primeiro. */
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(MAX_INVOICE_LIMIT).default(DEFAULT_INVOICE_LIMIT),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        const subscription = await ctx.prisma.subscription.findUnique({
          where: { userId: ctx.session.user.id },
          select: { id: true },
        })
        if (!subscription) return { invoices: [], total: 0 }

        const [invoices, total] = await Promise.all([
          ctx.prisma.invoice.findMany({
            where: { subscriptionId: subscription.id },
            orderBy: { dueAt: 'desc' },
            take: input.limit,
            skip: input.offset,
            select: {
              id: true,
              amountCents: true,
              status: true,
              method: true,
              dueAt: true,
              paidAt: true,
              attempts: true,
              failureReason: true,
              createdAt: true,
            },
          }),
          ctx.prisma.invoice.count({ where: { subscriptionId: subscription.id } }),
        ])

        return { invoices, total }
      }),
  }),

  /**
   * docs/05 §5.4 — 14 dias de Pro grátis, SEM cartão, disparado no primeiro paywall.
   * Não toca no gateway: nenhuma chamada externa, nenhum dado de pagamento.
   */
  startTrial: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // Sem gateway: `startTrial` não faz chamada externa. A porta exige um objeto, então
      // passamos um que falha alto se alguém adicionar uma chamada por engano.
      const service = createBillingService({
        prisma: createBillingPrismaAdapter(ctx.prisma),
        gateway: unavailableGateway(),
      })
      const subscription = await service.startTrial(ctx.session.user.id)
      return { subscriptionId: subscription.id, trialEndsAt: subscription.trialEndsAt }
    } catch (error) {
      return toTRPCError(error)
    }
  }),

  /** CL-105 — assina um plano pago (cria customer + assinatura no Asaas). */
  subscribe: protectedProcedure
    .input(
      z.object({
        planSlug: planSlugSchema,
        cycle: billingCycleSchema.default(BillingCycle.MONTHLY),
        // docs/05 §5.5, decisão 1 — Pix Automático é o padrão do produto.
        method: paymentMethodSchema.default(PaymentMethod.PIX_AUTOMATIC),
      }),
    )
    .mutation(({ ctx, input }) =>
      withService(ctx.prisma, async (service) => {
        const result = await service.subscribe({
          userId: ctx.session.user.id,
          planSlug: input.planSlug,
          cycle: input.cycle,
          method: input.method,
        })
        return {
          subscriptionId: result.subscription.id,
          status: result.subscription.status,
          invoiceId: result.invoice.id,
          amountCents: result.amountCents,
          currentPeriodEnd: result.subscription.currentPeriodEnd,
        }
      }),
    ),

  /**
   * CL-105 — troca de plano/ciclo. Upgrade vale na hora; downgrade é agendado para o fim
   * do período já pago (nada é apagado — docs/05 §5.4).
   */
  changePlan: protectedProcedure
    .input(z.object({ planSlug: planSlugSchema, cycle: billingCycleSchema.optional() }))
    .mutation(({ ctx, input }) =>
      withService(ctx.prisma, async (service) => {
        const result = await service.changePlan({
          userId: ctx.session.user.id,
          planSlug: input.planSlug,
          ...(input.cycle !== undefined ? { cycle: input.cycle } : {}),
        })
        return {
          applied: result.applied,
          effectiveAt: result.effectiveAt,
          scheduledPlanSlug: resolveScheduledPlanSlug(result.subscription),
        }
      }),
    ),

  /** CL-105 — cancela. Acesso mantido até `currentPeriodEnd`; depois cai para o free. */
  cancel: protectedProcedure
    .input(z.object({ reason: z.string().trim().max(500).optional() }))
    .mutation(({ ctx, input }) =>
      withService(ctx.prisma, async (service) => {
        const subscription = await service.cancel({
          userId: ctx.session.user.id,
          ...(input.reason !== undefined && input.reason.length > 0
            ? { reason: input.reason }
            : {}),
        })
        return {
          canceledAt: subscription.canceledAt,
          accessUntil: subscription.currentPeriodEnd,
          fallbackPlanSlug: FREE_PLAN_SLUG,
        }
      }),
    ),

  /** CL-105 — desfaz o cancelamento/downgrade enquanto o período pago ainda corre. */
  reactivate: protectedProcedure.mutation(({ ctx }) =>
    withService(ctx.prisma, async (service) => {
      const subscription = await service.reactivate({ userId: ctx.session.user.id })
      return {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }
    }),
  ),
})

/**
 * Gateway "explosivo" para os fluxos que, por definição, NÃO podem falar com o Asaas
 * (hoje: `startTrial`, docs/05 §5.4 "sem cartão"). Se alguém adicionar uma chamada
 * externa nesse caminho, o erro aparece no teste/log em vez de virar uma cobrança
 * indevida em produção.
 */
function unavailableGateway(): BillingGateway {
  const fail = (): never => {
    throw new BillingError(
      'BAD_REQUEST',
      'Esta operação não deve chamar o provedor de pagamento.',
    )
  }
  return {
    createCustomer: fail,
    createSubscription: fail,
    updateSubscription: fail,
    cancelSubscription: fail,
    getSubscription: fail,
    getPayment: fail,
    listPaymentsBySubscription: fail,
  }
}

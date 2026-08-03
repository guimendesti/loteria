/**
 * Adapta o `PrismaClient` real (`@lotopro/db`) para as portas mínimas do billing
 * (`BillingPrisma` em `service.ts`, `WebhookPrisma` em `webhook.ts`) — mesmo padrão de
 * `apps/worker/src/lib/prisma-adapters.ts`. Só este arquivo conhece o Prisma de verdade;
 * serviço, webhook e testes vivem em cima das interfaces.
 *
 * Os campos são copiados um a um (nada de espalhar `data` direto no Prisma): a porta tem
 * campos que o schema ainda não tem (`gatewayCustomerId`) e o `exactOptionalPropertyTypes`
 * do tsconfig proíbe passar `undefined` explícito para propriedades opcionais.
 */
import type { PrismaClient } from '@lotopro/db'
import { InvoiceStatus, Prisma } from '@lotopro/db'
import type {
  BillingPrisma,
  BillingSubscriptionCreateData,
  BillingSubscriptionUpdateData,
} from './service'
import type { WebhookInvoiceUpdateData, WebhookPrisma } from './webhook'

/**
 * `Subscription.gatewayCustomerId` AINDA NÃO EXISTE no schema (docs/07 §7.4). A porta já
 * o carrega como opcional; aqui ele é descartado na escrita e nunca aparece na leitura.
 * Consequência: cada `subscribe` cria um customer novo no Asaas (com
 * `externalReference = userId`, então o Asaas ainda consegue correlacionar).
 *
 * PARA RESOLVER: adicionar `gatewayCustomerId String?` a `Subscription` e trocar as duas
 * marcações `<gatewayCustomerId>` abaixo por `gatewayCustomerId: data.gatewayCustomerId`
 * (e incluir o campo no `select`). Nada mais muda.
 */
function subscriptionCreateData(data: BillingSubscriptionCreateData) {
  return {
    userId: data.userId,
    planId: data.planId,
    status: data.status,
    billingCycle: data.billingCycle,
    paymentMethod: data.paymentMethod,
    currentPeriodStart: data.currentPeriodStart,
    currentPeriodEnd: data.currentPeriodEnd,
    ...(data.gatewaySubscriptionId !== undefined
      ? { gatewaySubscriptionId: data.gatewaySubscriptionId }
      : {}),
    ...(data.trialEndsAt !== undefined ? { trialEndsAt: data.trialEndsAt } : {}),
    ...(data.cancelAtPeriodEnd !== undefined
      ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd }
      : {}),
    ...(data.canceledAt !== undefined ? { canceledAt: data.canceledAt } : {}),
    ...(data.cancelReason !== undefined ? { cancelReason: data.cancelReason } : {}),
    // <gatewayCustomerId> — ver comentário acima.
  }
}

function subscriptionUpdateData(data: BillingSubscriptionUpdateData) {
  return {
    ...(data.planId !== undefined ? { planId: data.planId } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle } : {}),
    ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
    ...(data.gatewaySubscriptionId !== undefined
      ? { gatewaySubscriptionId: data.gatewaySubscriptionId }
      : {}),
    ...(data.currentPeriodStart !== undefined
      ? { currentPeriodStart: data.currentPeriodStart }
      : {}),
    ...(data.currentPeriodEnd !== undefined ? { currentPeriodEnd: data.currentPeriodEnd } : {}),
    ...(data.trialEndsAt !== undefined ? { trialEndsAt: data.trialEndsAt } : {}),
    ...(data.cancelAtPeriodEnd !== undefined
      ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd }
      : {}),
    ...(data.canceledAt !== undefined ? { canceledAt: data.canceledAt } : {}),
    ...(data.cancelReason !== undefined ? { cancelReason: data.cancelReason } : {}),
    // <gatewayCustomerId> — ver comentário acima.
  }
}

function invoiceUpdateData(data: WebhookInvoiceUpdateData) {
  return {
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.paidAt !== undefined ? { paidAt: data.paidAt } : {}),
    ...(data.amountCents !== undefined ? { amountCents: data.amountCents } : {}),
    ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
    ...(data.gatewayInvoiceId !== undefined ? { gatewayInvoiceId: data.gatewayInvoiceId } : {}),
    ...(data.attempts !== undefined ? { attempts: data.attempts } : {}),
    ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
  }
}

export function createBillingPrismaAdapter(prisma: PrismaClient): BillingPrisma {
  return {
    plan: {
      findUnique: ({ where }) => prisma.plan.findUnique({ where: { slug: where.slug } }),
      findMany: ({ where }) =>
        prisma.plan.findMany({
          ...(where?.isPublic !== undefined ? { where: { isPublic: where.isPublic } } : {}),
          orderBy: { displayOrder: 'asc' },
        }),
    },
    user: {
      findUnique: ({ where }) =>
        prisma.user.findUnique({
          where: { id: where.id },
          select: { id: true, name: true, email: true },
        }),
    },
    subscription: {
      findUnique: ({ where }) => prisma.subscription.findUnique({ where: { userId: where.userId } }),
      create: ({ data }) => prisma.subscription.create({ data: subscriptionCreateData(data) }),
      update: ({ where, data }) =>
        prisma.subscription.update({ where: { id: where.id }, data: subscriptionUpdateData(data) }),
    },
    invoice: {
      create: ({ data }) =>
        prisma.invoice.create({
          data: {
            subscriptionId: data.subscriptionId,
            amountCents: data.amountCents,
            status: data.status,
            method: data.method,
            dueAt: data.dueAt,
            ...(data.gatewayInvoiceId !== undefined
              ? { gatewayInvoiceId: data.gatewayInvoiceId }
              : {}),
          },
        }),
      findMany: ({ where, take, skip }) =>
        prisma.invoice.findMany({
          where: { subscriptionId: where.subscriptionId },
          orderBy: { dueAt: 'desc' },
          take,
          skip,
        }),
    },
  }
}

export function createWebhookPrismaAdapter(prisma: PrismaClient): WebhookPrisma {
  return {
    webhookEvent: {
      findUnique: ({ where }) =>
        prisma.webhookEvent.findUnique({
          where: { provider_externalId: where.provider_externalId },
          select: { id: true, processedAt: true },
        }),
      create: ({ data }) =>
        prisma.webhookEvent.create({
          data: {
            provider: data.provider,
            externalId: data.externalId,
            eventType: data.eventType,
            payload: (data.payload ?? {}) as Prisma.InputJsonValue,
          },
          select: { id: true, processedAt: true },
        }),
      update: ({ where, data }) =>
        prisma.webhookEvent.update({
          where: { id: where.id },
          data: {
            ...(data.processedAt !== undefined ? { processedAt: data.processedAt } : {}),
            ...(data.error !== undefined ? { error: data.error } : {}),
          },
        }),
    },
    subscription: {
      findFirst: ({ where }) =>
        prisma.subscription.findFirst({
          where: { gatewaySubscriptionId: where.gatewaySubscriptionId },
        }),
      findUnique: ({ where }) => prisma.subscription.findUnique({ where: { id: where.id } }),
      update: ({ where, data }) =>
        prisma.subscription.update({ where: { id: where.id }, data: subscriptionUpdateData(data) }),
    },
    invoice: {
      findUnique: ({ where }) =>
        prisma.invoice.findUnique({ where: { gatewayInvoiceId: where.gatewayInvoiceId } }),
      findFirstUnlinked: ({ where }) =>
        prisma.invoice.findFirst({
          where: {
            subscriptionId: where.subscriptionId,
            gatewayInvoiceId: null,
            status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
          },
          orderBy: { dueAt: 'asc' },
        }),
      create: ({ data }) =>
        prisma.invoice.create({
          data: {
            subscriptionId: data.subscriptionId,
            amountCents: data.amountCents,
            status: data.status,
            method: data.method,
            gatewayInvoiceId: data.gatewayInvoiceId,
            dueAt: data.dueAt,
            ...(data.paidAt !== undefined ? { paidAt: data.paidAt } : {}),
          },
        }),
      update: ({ where, data }) =>
        prisma.invoice.update({ where: { id: where.id }, data: invoiceUpdateData(data) }),
    },
  }
}

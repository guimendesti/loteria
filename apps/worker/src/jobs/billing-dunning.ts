/**
 * SY-09 — `billing-dunning`: cobrança de assinaturas em atraso e transições de fim de
 * período. Roda 1x/dia (ver `registerBillingDunningSchedule`).
 *
 * ── Por que "dunning" aqui é RECONCILIAÇÃO, não retentativa ───────────────────────────
 *
 * Com Pix Automático (docs/05 §5.5) a retentativa real é do BANCO do assinante — a falha
 * é por saldo insuficiente, não por cartão expirado, e nós não temos como "tentar de novo"
 * um débito automático por conta própria. Este job então faz duas coisas em cada marco:
 *   1. RECONCILIA: pergunta ao Asaas se aquele pagamento já foi liquidado (o webhook pode
 *      ter se perdido) e, se foi, conserta o estado local;
 *   2. AVISA: enfileira `notify` (`billing.payment_failed`) para o assinante em D+1, D+3 e
 *      D+5 a partir de `Invoice.dueAt`.
 * Em D+7 sem pagamento, aplica o DOWNGRADE: `Subscription` vira `EXPIRED` e `planId`
 * aponta para o plano `free`.
 *
 * ⛔ CLAUDE.md / docs/05 §5.4: downgrade NUNCA apaga dado. Só o plano muda — jogos,
 * bolões, histórico e estatísticas continuam no banco, apenas com os limites do free.
 *
 * ── Passe 2: mudanças agendadas ───────────────────────────────────────────────────────
 *
 * O mesmo job aplica o que ficou marcado para o fim do período: cancelamento
 * (`cancelAtPeriodEnd` + `canceledAt`), downgrade agendado (`cancelReason =
 * "scheduled_downgrade:<slug>"`) e fim de trial (`trialEndsAt` vencido). Sem isso,
 * cancelamento e trial nunca terminariam — o webhook do Asaas não fala sobre nenhum dos
 * dois. Ver `apps/web/src/server/lib/billing/service.ts` (mesma convenção de codificação).
 *
 * Idempotência: `Invoice.attempts` guarda quantos marcos já foram notificados; rodar duas
 * vezes no mesmo dia não notifica duas vezes. As transições são convergentes (definem
 * estado final) e saem do conjunto varrido depois de aplicadas.
 */
import { BillingCycle, InvoiceStatus, PaymentMethod, SubStatus } from '@lotopro/db'
import type { PrismaClient } from '@lotopro/db'
import type { NotifyJobData } from '../queues'
import { centsToBRL } from '../lib/money'
import type { Logger } from '../lib/logger'
import type { Queue } from 'bullmq'

// ─── Regra de dunning (docs/05 §5.5) ──────────────────────────────────────────

/** Marcos de aviso, em dias inteiros após `Invoice.dueAt`. */
export const DUNNING_RETRY_DAYS = [1, 3, 5] as const
/** Sem pagamento até aqui, o plano cai para o free. */
export const DUNNING_DOWNGRADE_DAY = 7

export const FREE_PLAN_SLUG = 'free'

/** Quantos marcos de aviso já venceram para uma fatura com `daysOverdue` dias de atraso. */
export function expectedAttempts(daysOverdue: number): number {
  return DUNNING_RETRY_DAYS.filter((day) => daysOverdue >= day).length
}

// ─── Aritmética de período ────────────────────────────────────────────────────
// ESPELHA `apps/web/src/server/lib/billing/period.ts`. A duplicação é consciente:
// `apps/worker` não importa de `apps/web` e não existe (ainda) um módulo de billing em
// `packages/core`. Quando houver, estas três funções devem migrar para lá — são as
// únicas compartilhadas.

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)
}

export function addMonths(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

export function addCycle(date: Date, cycle: BillingCycle): Date {
  return addMonths(date, cycle === BillingCycle.YEARLY ? 12 : 1)
}

const SCHEDULED_DOWNGRADE_PREFIX = 'scheduled_downgrade:'

/**
 * ESPELHA `resolveScheduledPlanSlug` de `apps/web/.../service.ts` — mesma convenção:
 * `cancelAtPeriodEnd` + `canceledAt != null` = cancelamento (alvo: free);
 * `cancelReason = "scheduled_downgrade:<slug>"` = downgrade para `<slug>`.
 */
export function resolveScheduledPlanSlug(subscription: {
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  cancelReason: string | null
}): string | null {
  if (!subscription.cancelAtPeriodEnd) return null
  if (subscription.canceledAt !== null) return FREE_PLAN_SLUG
  const reason = subscription.cancelReason ?? ''
  if (reason.startsWith(SCHEDULED_DOWNGRADE_PREFIX)) {
    const slug = reason.slice(SCHEDULED_DOWNGRADE_PREFIX.length).trim()
    if (slug.length > 0) return slug
  }
  return FREE_PLAN_SLUG
}

// ─── Portas mínimas ───────────────────────────────────────────────────────────

export interface DunningSubscriptionRow {
  id: string
  userId: string
  planId: string
  status: SubStatus
  billingCycle: BillingCycle
  paymentMethod: PaymentMethod
  gatewaySubscriptionId: string | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt: Date | null
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  cancelReason: string | null
}

export interface DunningInvoiceRow {
  id: string
  subscriptionId: string
  amountCents: bigint
  status: InvoiceStatus
  gatewayInvoiceId: string | null
  dueAt: Date
  attempts: number
}

export interface DunningPlanRow {
  id: string
  slug: string
  name: string
}

export interface DunningSubscriptionUpdateData {
  status?: SubStatus
  planId?: string
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
  canceledAt?: Date | null
  cancelReason?: string | null
  trialEndsAt?: Date | null
}

export interface DunningInvoiceUpdateData {
  status?: InvoiceStatus
  attempts?: number
  paidAt?: Date | null
  failureReason?: string | null
}

export interface BillingDunningPrisma {
  subscription: {
    /** `status = PAST_DUE`. */
    findManyPastDue(): Promise<DunningSubscriptionRow[]>
    /**
     * Assinaturas cuja transição de fim de período já venceu: `cancelAtPeriodEnd = true`
     * com `currentPeriodEnd <= now`, OU trial (`TRIALING`) com `trialEndsAt <= now`.
     */
    findManyDueForTransition(args: { now: Date }): Promise<DunningSubscriptionRow[]>
    update(args: { where: { id: string }; data: DunningSubscriptionUpdateData }): Promise<unknown>
  }
  invoice: {
    /** Fatura mais antiga em PENDING/FAILED da assinatura. */
    findOldestUnpaid(args: { where: { subscriptionId: string } }): Promise<DunningInvoiceRow | null>
    update(args: { where: { id: string }; data: DunningInvoiceUpdateData }): Promise<unknown>
  }
  plan: {
    findUnique(args: { where: { slug: string } }): Promise<DunningPlanRow | null>
  }
}

/** Pagamento como o cliente Asaas o devolve (valor já em centavos). */
export interface DunningPayment {
  id: string
  status: string
  valueCents: bigint
  dueDate: string
  paymentDate?: string | null
  subscription?: string | null
}

/**
 * Só o que o dunning usa do `AsaasClient`. OPCIONAL nas deps: sem gateway cabeado, o job
 * ainda avisa e faz o downgrade em D+7 — apenas não reconcilia pagamentos cujo webhook se
 * perdeu (e registra isso no log).
 */
export interface BillingDunningGateway {
  getPayment(id: string): Promise<DunningPayment>
  listPaymentsBySubscription(id: string): Promise<DunningPayment[]>
}

export interface BillingDunningNotifyQueue {
  add(name: string, data: NotifyJobData): Promise<unknown>
}

export interface BillingDunningDeps {
  prisma: BillingDunningPrisma
  notifyQueue: BillingDunningNotifyQueue
  gateway?: BillingDunningGateway
  logger?: Logger
  now?: () => Date
}

export interface BillingDunningResult {
  scannedPastDue: number
  /** Pagamentos achados no gateway que o webhook não trouxe. */
  reconciled: number
  /** Avisos D+1/D+3/D+5 enfileirados nesta corrida. */
  notified: number
  /** Assinaturas rebaixadas para o free em D+7. */
  downgraded: number
  /** Cancelamentos/downgrades agendados e trials aplicados no fim do período. */
  transitions: number
}

// ─── Status de pagamento liquidado no Asaas ───────────────────────────────────

const PAID_GATEWAY_STATUSES = new Set([
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
  'DUNNING_RECEIVED',
])

export function isPaidGatewayStatus(status: string): boolean {
  return PAID_GATEWAY_STATUSES.has(status.trim().toUpperCase())
}

// ─── Payloads de notificação ──────────────────────────────────────────────────
// `NotifyJobData.type` é string livre (`queues.ts`), então nenhum schema de fila precisa
// mudar. `payload` vira JSON no Redis: valores em centavos vão como STRING (BigInt não é
// serializável por JSON.stringify).

function paymentFailedNotification(
  subscription: DunningSubscriptionRow,
  invoice: DunningInvoiceRow,
  daysOverdue: number,
): NotifyJobData {
  const remainingDays = Math.max(DUNNING_DOWNGRADE_DAY - daysOverdue, 0)
  return {
    userId: subscription.userId,
    type: 'billing.payment_failed',
    title: 'Não conseguimos confirmar o pagamento da sua assinatura',
    body:
      `A cobrança de ${centsToBRL(invoice.amountCents)} venceu há ${daysOverdue} ` +
      `dia${daysOverdue === 1 ? '' : 's'}. Regularize em até ${remainingDays} ` +
      `dia${remainingDays === 1 ? '' : 's'} para manter seu plano — seus dados continuam salvos.`,
    payload: {
      invoiceId: invoice.id,
      amountCents: invoice.amountCents.toString(),
      dueAt: invoice.dueAt.toISOString(),
      daysOverdue,
      downgradeInDays: remainingDays,
    },
  }
}

function downgradedNotification(
  subscription: DunningSubscriptionRow,
  reason: 'payment_failed' | 'canceled' | 'scheduled_downgrade' | 'trial_ended',
  targetPlanName: string,
): NotifyJobData {
  const bodyByReason: Record<typeof reason, string> = {
    payment_failed: `Como a cobrança não foi confirmada, seu acesso passou para o plano ${targetPlanName}.`,
    canceled: `Seu cancelamento foi concluído e você está no plano ${targetPlanName}.`,
    scheduled_downgrade: `A troca que você agendou foi aplicada: você está no plano ${targetPlanName}.`,
    trial_ended: `Seu período de teste terminou e você voltou para o plano ${targetPlanName}.`,
  }
  return {
    userId: subscription.userId,
    type: reason === 'trial_ended' ? 'billing.trial_ended' : 'billing.downgraded',
    title: `Seu plano agora é ${targetPlanName}`,
    // docs/05 §5.4 — "nunca apagar dados por downgrade": a mensagem diz isso explicitamente.
    body: `${bodyByReason[reason]} Nenhum dado foi apagado: seus jogos e seu histórico continuam disponíveis.`,
    payload: { reason, planSlug: FREE_PLAN_SLUG, targetPlanName },
  }
}

// ─── Job ──────────────────────────────────────────────────────────────────────

export function createBillingDunningJob(deps: BillingDunningDeps) {
  const now = deps.now ?? (() => new Date())
  const logger = deps.logger
  const { prisma, notifyQueue } = deps

  async function findFreePlan(): Promise<DunningPlanRow | null> {
    const plan = await prisma.plan.findUnique({ where: { slug: FREE_PLAN_SLUG } })
    if (!plan) {
      logger?.error('billing-dunning.free-plan.missing', { slug: FREE_PLAN_SLUG })
    }
    return plan
  }

  /**
   * Pergunta ao gateway se a fatura foi paga (webhook perdido). Erro de rede aqui NÃO
   * derruba a corrida: sem resposta, seguimos pela regra de tempo — o pior caso é um
   * aviso a mais, nunca uma cobrança a mais.
   */
  async function findSettledPayment(
    subscription: DunningSubscriptionRow,
    invoice: DunningInvoiceRow,
  ): Promise<DunningPayment | null> {
    const gateway = deps.gateway
    if (!gateway) return null

    try {
      if (invoice.gatewayInvoiceId !== null) {
        const payment = await gateway.getPayment(invoice.gatewayInvoiceId)
        return isPaidGatewayStatus(payment.status) ? payment : null
      }
      if (subscription.gatewaySubscriptionId !== null) {
        const payments = await gateway.listPaymentsBySubscription(
          subscription.gatewaySubscriptionId,
        )
        return payments.find((payment) => isPaidGatewayStatus(payment.status)) ?? null
      }
      return null
    } catch (error) {
      logger?.warn('billing-dunning.reconcile.failed', { subscriptionId: subscription.id, error })
      return null
    }
  }

  /** Conserta o estado local de uma fatura que o gateway já deu como paga. */
  async function applyReconciledPayment(
    subscription: DunningSubscriptionRow,
    invoice: DunningInvoiceRow,
    payment: DunningPayment,
    instant: Date,
  ): Promise<void> {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PAID, paidAt: instant, failureReason: null },
    })

    // Mesma regra monotônica do webhook: o período nunca encolhe e nunca é somado duas vezes.
    const candidate = addCycle(invoice.dueAt, subscription.billingCycle)
    const extends_ = candidate.getTime() > subscription.currentPeriodEnd.getTime()

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubStatus.ACTIVE,
        ...(extends_ ? { currentPeriodStart: invoice.dueAt, currentPeriodEnd: candidate } : {}),
      },
    })

    logger?.info('billing-dunning.reconciled', {
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
    })
  }

  async function applyDowngradeToFree(
    subscription: DunningSubscriptionRow,
    freePlan: DunningPlanRow,
    reason: 'payment_failed' | 'canceled' | 'scheduled_downgrade' | 'trial_ended',
    status: SubStatus,
  ): Promise<void> {
    // ⛔ Só troca o plano. Nenhum delete, nenhum arquivamento de aposta/bolão.
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status,
        planId: freePlan.id,
        cancelAtPeriodEnd: false,
        ...(reason === 'trial_ended' ? { trialEndsAt: null } : {}),
      },
    })
    await notifyQueue.add('notify', downgradedNotification(subscription, reason, freePlan.name))
  }

  // ── Passe 1: assinaturas em atraso ──────────────────────────────────────────
  async function runDunningPass(instant: Date, result: BillingDunningResult): Promise<void> {
    const subscriptions = await prisma.subscription.findManyPastDue()
    result.scannedPastDue = subscriptions.length

    for (const subscription of subscriptions) {
      const invoice = await prisma.invoice.findOldestUnpaid({
        where: { subscriptionId: subscription.id },
      })
      if (!invoice) {
        logger?.warn('billing-dunning.past-due.without-invoice', { subscriptionId: subscription.id })
        continue
      }

      const daysOverdue = daysBetween(invoice.dueAt, instant)
      if (daysOverdue < DUNNING_RETRY_DAYS[0]) continue

      const settled = await findSettledPayment(subscription, invoice)
      if (settled) {
        await applyReconciledPayment(subscription, invoice, settled, instant)
        result.reconciled += 1
        continue
      }

      if (daysOverdue >= DUNNING_DOWNGRADE_DAY) {
        const freePlan = await findFreePlan()
        if (!freePlan) continue
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.FAILED,
            failureReason: `Sem pagamento em D+${DUNNING_DOWNGRADE_DAY}; plano rebaixado para ${FREE_PLAN_SLUG}.`,
          },
        })
        await applyDowngradeToFree(subscription, freePlan, 'payment_failed', SubStatus.EXPIRED)
        result.downgraded += 1
        logger?.info('billing-dunning.downgraded', {
          subscriptionId: subscription.id,
          daysOverdue,
        })
        continue
      }

      // Idempotência do aviso: `attempts` já cobre este marco?
      const expected = expectedAttempts(daysOverdue)
      if (invoice.attempts >= expected) continue

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.FAILED,
          attempts: expected,
          failureReason: `Cobrança em atraso (D+${daysOverdue}).`,
        },
      })
      await notifyQueue.add(
        'notify',
        paymentFailedNotification(subscription, invoice, daysOverdue),
      )
      result.notified += 1
    }
  }

  // ── Passe 2: transições de fim de período ───────────────────────────────────
  async function runTransitionPass(instant: Date, result: BillingDunningResult): Promise<void> {
    const subscriptions = await prisma.subscription.findManyDueForTransition({ now: instant })

    for (const subscription of subscriptions) {
      const isExpiredTrial =
        subscription.status === SubStatus.TRIALING &&
        subscription.trialEndsAt !== null &&
        subscription.trialEndsAt.getTime() <= instant.getTime()

      const scheduledSlug = resolveScheduledPlanSlug(subscription)
      if (scheduledSlug === null && !isExpiredTrial) continue

      const targetSlug = scheduledSlug ?? FREE_PLAN_SLUG

      if (targetSlug === FREE_PLAN_SLUG) {
        const freePlan = await findFreePlan()
        if (!freePlan) continue
        const reason = isExpiredTrial
          ? ('trial_ended' as const)
          : subscription.canceledAt !== null
            ? ('canceled' as const)
            : ('scheduled_downgrade' as const)
        await applyDowngradeToFree(
          subscription,
          freePlan,
          reason,
          subscription.canceledAt !== null ? SubStatus.CANCELED : SubStatus.EXPIRED,
        )
        result.transitions += 1
        continue
      }

      // Downgrade para outro plano PAGO: a assinatura no Asaas segue viva com o valor
      // menor (já atualizado em `changePlan`), então só trocamos o plano e abrimos o
      // novo período local.
      const targetPlan = await prisma.plan.findUnique({ where: { slug: targetSlug } })
      if (!targetPlan) {
        logger?.error('billing-dunning.scheduled-plan.missing', {
          subscriptionId: subscription.id,
          slug: targetSlug,
        })
        continue
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: targetPlan.id,
          cancelAtPeriodEnd: false,
          cancelReason: null,
          currentPeriodStart: instant,
          currentPeriodEnd: addCycle(instant, subscription.billingCycle),
        },
      })
      await notifyQueue.add(
        'notify',
        downgradedNotification(subscription, 'scheduled_downgrade', targetPlan.name),
      )
      result.transitions += 1
    }
  }

  return async function billingDunning(): Promise<BillingDunningResult> {
    const instant = now()
    const result: BillingDunningResult = {
      scannedPastDue: 0,
      reconciled: 0,
      notified: 0,
      downgraded: 0,
      transitions: 0,
    }

    await runDunningPass(instant, result)
    await runTransitionPass(instant, result)

    logger?.info('billing-dunning.done', { ...result })
    return result
  }
}

// ─── Registro do job repetível ────────────────────────────────────────────────

export const BILLING_DUNNING_SCHEDULER_ID = 'billing-dunning-daily'
/** 1x/dia: os marcos são em dias inteiros, não há ganho em rodar mais vezes. */
export const BILLING_DUNNING_INTERVAL_MS = 24 * 60 * 60 * 1000

export async function registerBillingDunningSchedule(
  queue: Pick<Queue<{ triggeredAt: string }>, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    BILLING_DUNNING_SCHEDULER_ID,
    { every: BILLING_DUNNING_INTERVAL_MS },
    { name: 'billing-dunning', data: { triggeredAt: new Date().toISOString() } },
  )
}

// ─── Adapter de Prisma ────────────────────────────────────────────────────────
// Mora aqui (e não em `lib/prisma-adapters.ts`) para o job chegar completo e cabeável em
// uma linha no bootstrap. Mover para lá é um copy/paste quando fizer sentido agrupar.

export function createBillingDunningPrismaAdapter(prisma: PrismaClient): BillingDunningPrisma {
  return {
    subscription: {
      findManyPastDue: () => prisma.subscription.findMany({ where: { status: SubStatus.PAST_DUE } }),
      findManyDueForTransition: ({ now }) =>
        prisma.subscription.findMany({
          where: {
            OR: [
              // Cancelamento ou downgrade agendado cujo período já terminou.
              {
                cancelAtPeriodEnd: true,
                currentPeriodEnd: { lte: now },
                status: { in: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] },
              },
              // Trial vencido (docs/05 §5.4) — sem isso, o teste de 14 dias nunca acaba.
              { status: SubStatus.TRIALING, trialEndsAt: { lte: now } },
            ],
          },
        }),
      update: ({ where, data }) => prisma.subscription.update({ where: { id: where.id }, data }),
    },
    invoice: {
      findOldestUnpaid: ({ where }) =>
        prisma.invoice.findFirst({
          where: {
            subscriptionId: where.subscriptionId,
            status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
          },
          orderBy: { dueAt: 'asc' },
        }),
      update: ({ where, data }) => prisma.invoice.update({ where: { id: where.id }, data }),
    },
    plan: {
      findUnique: ({ where }) =>
        prisma.plan.findUnique({
          where: { slug: where.slug },
          select: { id: true, slug: true, name: true },
        }),
    },
  }
}

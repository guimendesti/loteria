/**
 * Router `admin.finance` — docs/08 §D.5 (BO-30 assinaturas, BO-31 faturas, BO-32 retry,
 * BO-34 MRR, BO-36 webhooks + replay).
 *
 * Reaproveita `@/server/lib/billing/*` (mesma pasta que o billing do cliente usa) em vez de
 * duplicar regra: `replayWebhook` chama `createAsaasWebhookHandler` (função pura de
 * `server/lib/billing/webhook.ts`) com o MESMO adapter (`createWebhookPrismaAdapter`) que a
 * rota `app/api/webhooks/asaas/route.ts` usa — não precisamos editar essa rota nem fazer uma
 * chamada HTTP interna, porque o handler já era exportado e puro (sem `Request`/`Response`).
 * A idempotência por `WebhookEvent(provider, externalId)` do handler faz o "replay" convergir
 * para o mesmo id de evento: se ele já foi processado com sucesso, o handler devolve
 * `outcome: 'duplicate'` (nada muda); se falhou antes (`processedAt` nulo), reprocessa de
 * verdade.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { BillingCycle, InvoiceStatus, Prisma, SubStatus, UserRole, type PrismaClient } from '@lotopro/db'
import { router } from '@/server/trpc'
import { adminProcedure } from '@/server/lib/admin/rbac'
import { writeAudit } from '@/server/lib/admin/audit'
import { createWebhookPrismaAdapter } from '@/server/lib/billing/prisma-adapter'
import { createAsaasWebhookHandler } from '@/server/lib/billing/webhook'

// ─── MRR (BO-34) — cálculo puro, testável sem Prisma ──────────────────────────────────────

/**
 * Um evento de fatura PAGA, já normalizado para o valor MENSAL EQUIVALENTE
 * (`monthlyEquivalentCents`) — cobrança anual conta como 1/12 por mês, aproximação padrão de
 * relatório de MRR. `subscriptionId` agrupa os eventos da mesma assinatura ao longo do tempo.
 */
export interface MrrPaidEvent {
  subscriptionId: string
  paidAt: Date
  mrrCents: bigint
}

export interface MrrCancelEvent {
  subscriptionId: string
  canceledAt: Date
}

export interface MrrReport {
  newCents: bigint
  expansionCents: bigint
  contractionCents: bigint
  churnCents: bigint
  /** novo + expansão − contração − churn. */
  netNewCents: bigint
}

/** Cobrança anual vira 1/12 por mês (truncado) — mesma convenção de "dinheiro em centavos inteiros". */
export function monthlyEquivalentCents(amountCents: bigint, cycle: BillingCycle): bigint {
  return cycle === BillingCycle.YEARLY ? amountCents / 12n : amountCents
}

/**
 * MRR novo/expansão/contração/churn de um mês (docs/08 BO-34), a partir do HISTÓRICO de
 * pagamentos por assinatura:
 *
 * - **Novo**: a PRIMEIRA fatura paga de uma assinatura, se cair dentro do mês.
 * - **Expansão/Contração**: a diferença entre uma fatura paga dentro do mês e a fatura paga
 *   ANTERIOR da mesma assinatura (qualquer mês) — aumentou = expansão, diminuiu = contração.
 *   Aproximação conhecida: sem uma tabela de histórico de troca de plano, usamos a série de
 *   valores efetivamente cobrados (Invoice.amountCents) como proxy do "MRR efetivo" da
 *   assinatura ao longo do tempo.
 * - **Churn**: assinaturas com `canceledAt` dentro do mês perdem o ÚLTIMO valor pago
 *   conhecido (antes do fim do mês) como MRR perdido.
 *
 * `monthStart` inclusivo, `monthEnd` exclusivo.
 */
export function computeMrrReport(
  paidEvents: readonly MrrPaidEvent[],
  cancelEvents: readonly MrrCancelEvent[],
  monthStart: Date,
  monthEnd: Date,
): MrrReport {
  const bySubscription = new Map<string, MrrPaidEvent[]>()
  for (const event of paidEvents) {
    const list = bySubscription.get(event.subscriptionId) ?? []
    list.push(event)
    bySubscription.set(event.subscriptionId, list)
  }
  for (const list of bySubscription.values()) {
    list.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
  }

  const inMonth = (date: Date): boolean =>
    date.getTime() >= monthStart.getTime() && date.getTime() < monthEnd.getTime()

  let newCents = 0n
  let expansionCents = 0n
  let contractionCents = 0n

  for (const events of bySubscription.values()) {
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]
      if (event === undefined || !inMonth(event.paidAt)) continue

      if (index === 0) {
        newCents += event.mrrCents
        continue
      }
      const previous = events[index - 1]
      if (previous === undefined) continue
      const delta = event.mrrCents - previous.mrrCents
      if (delta > 0n) expansionCents += delta
      else if (delta < 0n) contractionCents += -delta
    }
  }

  const lastKnownMrrBeforeMonthEnd = new Map<string, bigint>()
  for (const [subscriptionId, events] of bySubscription) {
    const before = events.filter((event) => event.paidAt.getTime() < monthEnd.getTime())
    const last = before[before.length - 1]
    if (last !== undefined) lastKnownMrrBeforeMonthEnd.set(subscriptionId, last.mrrCents)
  }

  let churnCents = 0n
  for (const cancelEvent of cancelEvents) {
    if (!inMonth(cancelEvent.canceledAt)) continue
    const lastMrr = lastKnownMrrBeforeMonthEnd.get(cancelEvent.subscriptionId)
    if (lastMrr !== undefined) churnCents += lastMrr
  }

  return {
    newCents,
    expansionCents,
    contractionCents,
    churnCents,
    netNewCents: newCents + expansionCents - contractionCents - churnCents,
  }
}

/** 'YYYY-MM' → [monthStart, monthEnd) em UTC. Formato inválido lança (o router valida com zod antes). */
export function parseMonth(month: string): { monthStart: Date; monthEnd: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match?.[1] || !match[2]) throw new RangeError(`Mês inválido: "${month}" (esperado "YYYY-MM").`)
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  return {
    monthStart: new Date(Date.UTC(year, monthIndex, 1)),
    monthEnd: new Date(Date.UTC(year, monthIndex + 1, 1)),
  }
}

function currentMonthSlug(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

// ─── Router ────────────────────────────────────────────────────────────────────────────

const subscriptionsListInput = z.object({
  status: z.nativeEnum(SubStatus).optional(),
  planSlug: z.string().min(1).optional(),
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

const invoicesListInput = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  subscriptionId: z.string().min(1).optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

const retryInvoiceInput = z.object({ invoiceId: z.string().min(1) })

const mrrReportInput = z.object({
  /** 'YYYY-MM'; ausente = mês corrente (relógio do servidor). */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use o formato "YYYY-MM".')
    .optional(),
})

const webhookEventsListInput = z.object({
  provider: z.string().min(1).optional(),
  /** `true` = já processado (`processedAt` não nulo); `false` = pendente. */
  processed: z.boolean().optional(),
  hasError: z.boolean().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

const replayWebhookInput = z.object({ id: z.string().min(1) })

const subscriptionInclude = {
  user: { select: { id: true, name: true, email: true } },
  plan: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.SubscriptionInclude

/** MRR: soma das faturas PAGAS de todas as assinaturas até `monthEnd`, normalizadas por ciclo. */
async function loadPaidEvents(prisma: PrismaClient, monthEnd: Date): Promise<MrrPaidEvent[]> {
  const invoices = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.PAID, paidAt: { lt: monthEnd, not: null } },
    select: {
      subscriptionId: true,
      amountCents: true,
      paidAt: true,
      subscription: { select: { billingCycle: true } },
    },
  })
  return invoices
    .filter((invoice): invoice is typeof invoice & { paidAt: Date } => invoice.paidAt !== null)
    .map((invoice) => ({
      subscriptionId: invoice.subscriptionId,
      paidAt: invoice.paidAt,
      mrrCents: monthlyEquivalentCents(invoice.amountCents, invoice.subscription.billingCycle),
    }))
}

export const adminFinanceRouter = router({
  /** BO-30 — assinaturas com filtro de status/plano/ciclo, paginação cursor. */
  subscriptions: adminProcedure(UserRole.FINANCE).input(subscriptionsListInput).query(async ({ ctx, input }) => {
    const where: Prisma.SubscriptionWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
      ...(input.planSlug ? { plan: { slug: input.planSlug } } : {}),
    }

    const rows = await ctx.prisma.subscription.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: subscriptionInclude,
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) nextCursor = rows.pop()?.id

    return { items: rows, nextCursor }
  }),

  /** BO-31 — faturas com filtro de status/período (`dueAt`), paginação cursor. */
  invoices: adminProcedure(UserRole.FINANCE).input(invoicesListInput).query(async ({ ctx, input }) => {
    const where: Prisma.InvoiceWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
      ...(input.dueFrom || input.dueTo
        ? {
            dueAt: {
              ...(input.dueFrom ? { gte: input.dueFrom } : {}),
              ...(input.dueTo ? { lte: input.dueTo } : {}),
            },
          }
        : {}),
    }

    const rows = await ctx.prisma.invoice.findMany({
      where,
      orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { subscription: { include: subscriptionInclude } },
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) nextCursor = rows.pop()?.id

    return { items: rows, nextCursor }
  }),

  /**
   * BO-32 — retry manual de cobrança. Escopo desta onda: reabre a fatura localmente
   * (`FAILED` → `PENDING`, limpa `failureReason`) para o próximo ciclo de conciliação/dunning
   * pegá-la; NÃO dispara uma nova cobrança no Asaas nesta chamada (isso exigiria criar um novo
   * pagamento no gateway a partir de uma fatura — fora do escopo pedido). Documentado como
   * pendência: um retry "de verdade" chamaria `BillingGateway` (server/lib/billing/gateway.ts)
   * para reemitir a cobrança e atualizar `gatewayInvoiceId`.
   */
  retryInvoice: adminProcedure(UserRole.FINANCE).input(retryInvoiceInput).mutation(async ({ ctx, input }) => {
    const actor = ctx.session.user
    const invoice = await ctx.prisma.invoice.findUnique({ where: { id: input.invoiceId } })
    if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fatura não encontrada.' })
    if (invoice.status !== InvoiceStatus.FAILED) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Só é possível marcar para nova tentativa faturas com status "Falhou".',
      })
    }

    const updated = await ctx.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PENDING, failureReason: null },
    })

    await writeAudit(ctx.prisma, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin.invoice.retry_requested',
      entityType: 'Invoice',
      entityId: invoice.id,
      before: { status: invoice.status, failureReason: invoice.failureReason, attempts: invoice.attempts },
      after: { status: updated.status },
    })

    return updated
  }),

  /** BO-34 — MRR novo/expansão/contração/churn do mês (default: mês corrente), em centavos. */
  mrrReport: adminProcedure(UserRole.FINANCE).input(mrrReportInput).query(async ({ ctx, input }) => {
    const now = new Date()
    const month = input.month ?? currentMonthSlug(now)
    const { monthStart, monthEnd } = parseMonth(month)

    const [paidEvents, cancelSubscriptions] = await Promise.all([
      loadPaidEvents(ctx.prisma, monthEnd),
      ctx.prisma.subscription.findMany({
        where: { canceledAt: { gte: monthStart, lt: monthEnd } },
        select: { id: true, canceledAt: true },
      }),
    ])

    const cancelEvents: MrrCancelEvent[] = cancelSubscriptions
      .filter((row): row is typeof row & { canceledAt: Date } => row.canceledAt !== null)
      .map((row) => ({ subscriptionId: row.id, canceledAt: row.canceledAt }))

    const report = computeMrrReport(paidEvents, cancelEvents, monthStart, monthEnd)
    return { month, ...report }
  }),

  /** BO-36 — log de webhooks recebidos, com filtro de processado/erro. */
  webhookEvents: adminProcedure(UserRole.FINANCE).input(webhookEventsListInput).query(async ({ ctx, input }) => {
    const where: Prisma.WebhookEventWhereInput = {
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.processed === true ? { processedAt: { not: null } } : {}),
      ...(input.processed === false ? { processedAt: null } : {}),
      ...(input.hasError === true ? { error: { not: null } } : {}),
      ...(input.hasError === false ? { error: null } : {}),
    }

    const rows = await ctx.prisma.webhookEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) nextCursor = rows.pop()?.id

    return { items: rows, nextCursor }
  }),

  /**
   * BO-36 — replay manual. Reaproveita `createAsaasWebhookHandler` (server/lib/billing/webhook.ts)
   * chamando com o payload já persistido em `WebhookEvent.payload` — a MESMA barreira de
   * idempotência por `(provider, externalId)` do endpoint real decide se reprocessa (evento
   * anterior falhou, `processedAt` nulo) ou devolve `outcome: 'duplicate'` (já processado).
   * Só Asaas é suportado nesta onda (único provider integrado — ver `WebhookEvent.provider`).
   */
  replayWebhook: adminProcedure(UserRole.FINANCE).input(replayWebhookInput).mutation(async ({ ctx, input }) => {
    const actor = ctx.session.user
    const event = await ctx.prisma.webhookEvent.findUnique({ where: { id: input.id } })
    if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento de webhook não encontrado.' })
    if (event.provider !== 'asaas') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Replay não implementado para o provedor "${event.provider}" — só "asaas" nesta onda.`,
      })
    }

    const expectedToken = process.env['ASAAS_WEBHOOK_TOKEN'] ?? ''
    if (expectedToken.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'ASAAS_WEBHOOK_TOKEN não configurado neste ambiente — não é possível reprocessar.',
      })
    }

    const handle = createAsaasWebhookHandler({
      prisma: createWebhookPrismaAdapter(ctx.prisma),
      expectedToken,
      logger: { warn: (message, meta) => console.warn(message, meta ?? {}) },
    })

    const result = await handle({ token: expectedToken, body: event.payload })

    await writeAudit(ctx.prisma, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin.webhook_event.replayed',
      entityType: 'WebhookEvent',
      entityId: event.id,
      before: { outcome: 'requested' },
      after: { outcome: result.outcome, message: result.message },
    })

    return result
  }),
})

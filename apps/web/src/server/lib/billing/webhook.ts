/**
 * SY-13 — handler do webhook do Asaas: validação de token, parsing, IDEMPOTÊNCIA por
 * `WebhookEvent(provider, externalId)` e aplicação do efeito em `Subscription`/`Invoice`.
 *
 * Extraído da rota (`app/api/webhooks/asaas/route.ts`) de propósito: aqui não há `Request`,
 * `Response` nem `PrismaClient` — só a porta mínima e um relógio. É o que permite testar
 * token inválido, evento duplicado e cada tipo de evento sem subir nada.
 *
 * ── Por que `parseAsaasWebhookBody` e `isValidWebhookToken` são locais ──────────────────
 *
 * O contrato de `packages/integrations/src/asaas` expõe `parseAsaasWebhook` e
 * `isValidWebhookToken` equivalentes, mas `apps/web` ainda não declara
 * `@lotopro/integrations` (ver `types.ts`). As implementações abaixo são um SUPERSET do
 * contrato — `{ id, event, paymentId, subscriptionId, raw }` mais o objeto `payment` já
 * normalizado — justamente para o webhook não precisar chamar o Asaas de volta
 * (`getPayment`) só para saber valor e vencimento. Quando a dependência for costurada,
 * trocar por importações do pacote é seguro desde que `payment` continue sendo lido de
 * `raw`. Ver relatório de wiring.
 *
 * ── Idempotência (CLAUDE.md: "todo webhook é idempotente por event_id") ────────────────
 *
 * 1. `create` em `WebhookEvent` é a barreira: a unique `(provider, externalId)` faz a
 *    SEGUNDA entrega falhar com P2002 em vez de reprocessar.
 * 2. Numa colisão, relemos a linha: se já tem `processedAt`, é duplicata → 200 e sai. Se
 *    não tem (entrega anterior falhou no meio), REPROCESSAMOS — e todas as operações
 *    abaixo são convergentes (definem estado final, nunca incrementam algo já contado),
 *    exceto `Invoice.attempts` no OVERDUE, que é protegido pelo mesmo `processedAt`.
 */
import { InvoiceStatus, SubStatus } from '@lotopro/db'
import { addCycle, parseDueDate } from './period'
import type {
  BillingInvoiceRow,
  BillingSubscriptionRow,
  BillingSubscriptionUpdateData,
} from './service'

export const WEBHOOK_PROVIDER = 'asaas'

/** Header em que o Asaas envia o token configurado no painel (SY-13). */
export const ASAAS_TOKEN_HEADER = 'asaas-access-token'

// ─── Validação do token ───────────────────────────────────────────────────────

/**
 * Comparação de token em tempo constante no comprimento do esperado — evita distinguir
 * "errou no primeiro caractere" de "errou no último" por tempo de resposta. Token
 * esperado vazio/ausente = SEMPRE inválido (falha fechada: um deploy sem
 * `ASAAS_WEBHOOK_TOKEN` não pode virar endpoint aberto).
 */
export function isValidWebhookToken(received: string | null | undefined, expected: string): boolean {
  if (expected.length === 0) return false
  if (typeof received !== 'string' || received.length !== expected.length) return false

  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= received.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return diff === 0
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface AsaasWebhookPayment {
  id: string
  subscriptionId: string | null
  customerId: string | null
  status: string | null
  /** Convertido de reais (float do Asaas) para centavos inteiros — CLAUDE.md §5. */
  valueCents: bigint | null
  dueAt: Date | null
  paidAt: Date | null
}

export interface ParsedAsaasWebhook {
  /** `externalId` da idempotência. */
  id: string
  event: string
  paymentId: string | null
  subscriptionId: string | null
  payment: AsaasWebhookPayment | null
  raw: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * Reais (número decimal do Asaas) → centavos inteiros. `24.9 * 100` dá
 * `2489.9999999999995` em ponto flutuante; o `Math.round` resolve para toda faixa de
 * valor de assinatura. Fora dessa faixa (valor não finito), devolve `null` em vez de
 * inventar um número.
 */
export function reaisToCents(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return BigInt(Math.round(value * 100))
}

function parsePayment(raw: unknown): AsaasWebhookPayment | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = asString(record['id'])
  if (id === null) return null

  const dueDate = asString(record['dueDate'])
  const paymentDate = asString(record['paymentDate']) ?? asString(record['clientPaymentDate'])

  return {
    id,
    subscriptionId: asString(record['subscription']),
    customerId: asString(record['customer']),
    status: asString(record['status']),
    valueCents: reaisToCents(record['value']),
    dueAt: dueDate === null ? null : parseDueDate(dueDate),
    paidAt: paymentDate === null ? null : parseDueDate(paymentDate),
  }
}

/**
 * Corpo do webhook → evento normalizado, ou `null` se não for reconhecível como evento
 * do Asaas (sem `event`).
 *
 * `id`: alguns eventos do Asaas chegam sem `id` de evento. Nesse caso derivamos um
 * identificador DETERMINÍSTICO a partir de `event` + id do pagamento/assinatura — a
 * idempotência continua valendo entre reentregas do mesmo evento.
 */
export function parseAsaasWebhookBody(body: unknown): ParsedAsaasWebhook | null {
  const record = asRecord(body)
  if (!record) return null

  const event = asString(record['event'])
  if (event === null) return null

  const payment = parsePayment(record['payment'])
  const subscriptionFromRoot = asString(record['subscription'])
  const paymentId = payment?.id ?? null
  const subscriptionId = payment?.subscriptionId ?? subscriptionFromRoot

  const id = asString(record['id']) ?? `${event}:${paymentId ?? subscriptionId ?? 'unknown'}`

  return { id, event, paymentId, subscriptionId, payment, raw: body }
}

// ─── Porta mínima de Prisma ───────────────────────────────────────────────────

export interface WebhookEventRow {
  id: string
  processedAt: Date | null
}

export interface WebhookInvoiceUpdateData {
  status?: InvoiceStatus
  paidAt?: Date | null
  amountCents?: bigint
  dueAt?: Date
  gatewayInvoiceId?: string | null
  attempts?: number
  failureReason?: string | null
}

export interface WebhookPrisma {
  webhookEvent: {
    findUnique(args: {
      where: { provider_externalId: { provider: string; externalId: string } }
    }): Promise<WebhookEventRow | null>
    create(args: {
      data: { provider: string; externalId: string; eventType: string; payload: unknown }
    }): Promise<WebhookEventRow>
    update(args: {
      where: { id: string }
      data: { processedAt?: Date; error?: string | null }
    }): Promise<unknown>
  }
  subscription: {
    findFirst(args: {
      where: { gatewaySubscriptionId: string }
    }): Promise<BillingSubscriptionRow | null>
    findUnique(args: { where: { id: string } }): Promise<BillingSubscriptionRow | null>
    update(args: {
      where: { id: string }
      data: BillingSubscriptionUpdateData
    }): Promise<BillingSubscriptionRow>
  }
  invoice: {
    findUnique(args: { where: { gatewayInvoiceId: string } }): Promise<BillingInvoiceRow | null>
    /** Fatura ainda não casada com um pagamento do gateway, a mais antiga primeiro. */
    findFirstUnlinked(args: { where: { subscriptionId: string } }): Promise<BillingInvoiceRow | null>
    create(args: {
      data: {
        subscriptionId: string
        amountCents: bigint
        status: InvoiceStatus
        method: BillingSubscriptionRow['paymentMethod']
        gatewayInvoiceId: string | null
        dueAt: Date
        paidAt?: Date | null
      }
    }): Promise<BillingInvoiceRow>
    update(args: {
      where: { id: string }
      data: WebhookInvoiceUpdateData
    }): Promise<BillingInvoiceRow>
  }
}

export interface WebhookHandlerDeps {
  prisma: WebhookPrisma
  /** `process.env.ASAAS_WEBHOOK_TOKEN` na rota; string vazia = endpoint fechado. */
  expectedToken: string
  now?: () => Date
  /** Default reconhece o P2002 do Prisma sem importar `Prisma` aqui. */
  isUniqueViolation?: (error: unknown) => boolean
  logger?: { warn(message: string, meta?: Record<string, unknown>): void }
}

export type WebhookOutcome =
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'unauthorized'
  | 'invalid'
  | 'error'

export interface WebhookHandlerResult {
  httpStatus: number
  outcome: WebhookOutcome
  message: string
}

export interface WebhookHandlerInput {
  token: string | null
  body: unknown
}

function defaultIsUniqueViolation(error: unknown): boolean {
  return asRecord(error)?.['code'] === 'P2002'
}

// ─── Classificação de eventos ─────────────────────────────────────────────────

const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH'])
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE'])
const REFUNDED_EVENTS = new Set(['PAYMENT_REFUNDED'])
const SUBSCRIPTION_DELETED_EVENTS = new Set(['SUBSCRIPTION_DELETED'])

// ─── Handler ──────────────────────────────────────────────────────────────────

export function createAsaasWebhookHandler(deps: WebhookHandlerDeps) {
  const now = deps.now ?? (() => new Date())
  const isUniqueViolation = deps.isUniqueViolation ?? defaultIsUniqueViolation
  const { prisma } = deps

  /**
   * Acha a assinatura local do evento: pelo id do gateway, ou — quando o payload não
   * traz `subscription` (pagamento avulso reentregue) — pela fatura já vinculada.
   */
  async function resolveSubscription(
    parsed: ParsedAsaasWebhook,
    invoice: BillingInvoiceRow | null,
  ): Promise<BillingSubscriptionRow | null> {
    if (parsed.subscriptionId !== null) {
      const bySubscription = await prisma.subscription.findFirst({
        where: { gatewaySubscriptionId: parsed.subscriptionId },
      })
      if (bySubscription) return bySubscription
    }
    if (invoice !== null) {
      return prisma.subscription.findUnique({ where: { id: invoice.subscriptionId } })
    }
    return null
  }

  /**
   * Fatura local do pagamento. Ordem: (1) já vinculada por `gatewayInvoiceId`; (2) a
   * fatura criada por `subscribe` que ainda não conhece o id do pagamento — ADOTADA aqui
   * (é assim que a primeira cobrança do ciclo se liga ao pagamento real do Asaas);
   * (3) nenhuma — o chamador decide criar (renovação gerada pelo próprio Asaas).
   */
  async function resolveInvoice(
    parsed: ParsedAsaasWebhook,
    subscriptionId: string | null,
  ): Promise<{ invoice: BillingInvoiceRow | null; needsLink: boolean }> {
    if (parsed.paymentId !== null) {
      const linked = await prisma.invoice.findUnique({
        where: { gatewayInvoiceId: parsed.paymentId },
      })
      if (linked) return { invoice: linked, needsLink: false }
    }
    if (subscriptionId !== null) {
      const unlinked = await prisma.invoice.findFirstUnlinked({ where: { subscriptionId } })
      if (unlinked) return { invoice: unlinked, needsLink: parsed.paymentId !== null }
    }
    return { invoice: null, needsLink: false }
  }

  /**
   * Novo fim de período = MAIOR entre o atual e (vencimento pago + 1 ciclo). Monotônico e
   * idempotente: reentregar o mesmo `PAYMENT_CONFIRMED` não empurra o período de novo, e
   * a primeira fatura (vencimento = data da assinatura) não soma um ciclo extra, porque
   * `subscribe` já gravou exatamente esse fim de período.
   */
  function periodExtension(
    subscription: BillingSubscriptionRow,
    dueAt: Date,
  ): Pick<BillingSubscriptionUpdateData, 'currentPeriodStart' | 'currentPeriodEnd'> {
    const candidate = addCycle(dueAt, subscription.billingCycle)
    if (candidate.getTime() <= subscription.currentPeriodEnd.getTime()) return {}
    return { currentPeriodStart: dueAt, currentPeriodEnd: candidate }
  }

  async function handlePaid(parsed: ParsedAsaasWebhook): Promise<WebhookHandlerResult> {
    const instant = now()
    const firstPass = await resolveInvoice(parsed, null)
    const subscription = await resolveSubscription(parsed, firstPass.invoice)
    if (!subscription) {
      return {
        httpStatus: 200,
        outcome: 'ignored',
        message: 'Assinatura não encontrada para este pagamento.',
      }
    }

    const { invoice, needsLink } = firstPass.invoice
      ? firstPass
      : await resolveInvoice(parsed, subscription.id)

    const dueAt = parsed.payment?.dueAt ?? invoice?.dueAt ?? instant
    const paidAt = parsed.payment?.paidAt ?? instant
    const amountCents = parsed.payment?.valueCents ?? invoice?.amountCents ?? 0n

    if (invoice) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt,
          amountCents,
          dueAt,
          failureReason: null,
          ...(needsLink && parsed.paymentId !== null ? { gatewayInvoiceId: parsed.paymentId } : {}),
        },
      })
    } else {
      // Renovação gerada pelo Asaas: não existe linha local até o pagamento acontecer.
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amountCents,
          status: InvoiceStatus.PAID,
          method: subscription.paymentMethod,
          gatewayInvoiceId: parsed.paymentId,
          dueAt,
          paidAt,
        },
      })
    }

    // Assinatura já encerrada não "revive" por um pagamento atrasado — vira caso de
    // suporte (o downgrade em D+7 já trocou o plano). Fatura fica PAID de qualquer forma.
    const keepStatus =
      subscription.status === SubStatus.CANCELED || subscription.status === SubStatus.EXPIRED

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        ...(keepStatus ? {} : { status: SubStatus.ACTIVE }),
        ...periodExtension(subscription, dueAt),
      },
    })

    return { httpStatus: 200, outcome: 'processed', message: 'Pagamento confirmado.' }
  }

  async function handleOverdue(parsed: ParsedAsaasWebhook): Promise<WebhookHandlerResult> {
    const instant = now()
    const firstPass = await resolveInvoice(parsed, null)
    const subscription = await resolveSubscription(parsed, firstPass.invoice)
    if (!subscription) {
      return {
        httpStatus: 200,
        outcome: 'ignored',
        message: 'Assinatura não encontrada para este pagamento.',
      }
    }

    const { invoice, needsLink } = firstPass.invoice
      ? firstPass
      : await resolveInvoice(parsed, subscription.id)

    const dueAt = parsed.payment?.dueAt ?? invoice?.dueAt ?? instant
    const amountCents = parsed.payment?.valueCents ?? invoice?.amountCents ?? 0n

    if (invoice) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.FAILED,
          attempts: invoice.attempts + 1,
          failureReason: 'Cobrança vencida sem pagamento (Asaas: PAYMENT_OVERDUE).',
          dueAt,
          ...(needsLink && parsed.paymentId !== null ? { gatewayInvoiceId: parsed.paymentId } : {}),
        },
      })
    } else {
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amountCents,
          status: InvoiceStatus.FAILED,
          method: subscription.paymentMethod,
          gatewayInvoiceId: parsed.paymentId,
          dueAt,
        },
      })
    }

    if (subscription.status !== SubStatus.CANCELED && subscription.status !== SubStatus.EXPIRED) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubStatus.PAST_DUE },
      })
    }

    return { httpStatus: 200, outcome: 'processed', message: 'Cobrança marcada como vencida.' }
  }

  async function handleRefunded(parsed: ParsedAsaasWebhook): Promise<WebhookHandlerResult> {
    const { invoice } = await resolveInvoice(parsed, null)
    const target =
      invoice ??
      (await (async () => {
        const subscription = await resolveSubscription(parsed, null)
        if (!subscription) return null
        return (await resolveInvoice(parsed, subscription.id)).invoice
      })())

    if (!target) {
      return { httpStatus: 200, outcome: 'ignored', message: 'Fatura não encontrada para estorno.' }
    }

    await prisma.invoice.update({
      where: { id: target.id },
      data: {
        status: InvoiceStatus.REFUNDED,
        failureReason: 'Estorno registrado pelo gateway (Asaas: PAYMENT_REFUNDED).',
      },
    })

    // O status da assinatura NÃO muda aqui de propósito: estorno pode ser parcial ou
    // administrativo. Encerrar acesso é decisão de suporte (BO-*), não do webhook.
    return { httpStatus: 200, outcome: 'processed', message: 'Estorno registrado.' }
  }

  async function handleSubscriptionDeleted(
    parsed: ParsedAsaasWebhook,
  ): Promise<WebhookHandlerResult> {
    if (parsed.subscriptionId === null) {
      return { httpStatus: 200, outcome: 'ignored', message: 'Evento sem id de assinatura.' }
    }
    const subscription = await prisma.subscription.findFirst({
      where: { gatewaySubscriptionId: parsed.subscriptionId },
    })
    if (!subscription) {
      return { httpStatus: 200, outcome: 'ignored', message: 'Assinatura não encontrada.' }
    }

    const instant = now()

    // Cancelamento pedido POR NÓS (`service.cancel` derruba no gateway na hora, mas o
    // acesso local vai até o fim do período — ver `service.ts`). O eco do próprio
    // cancelamento não pode cortar o acesso antes da hora.
    if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd.getTime() > instant.getTime()) {
      return {
        httpStatus: 200,
        outcome: 'processed',
        message: 'Cancelamento já agendado; acesso mantido até o fim do período pago.',
      }
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubStatus.CANCELED,
        canceledAt: subscription.canceledAt ?? instant,
        cancelAtPeriodEnd: false,
      },
    })

    return { httpStatus: 200, outcome: 'processed', message: 'Assinatura cancelada.' }
  }

  async function dispatch(parsed: ParsedAsaasWebhook): Promise<WebhookHandlerResult> {
    if (PAID_EVENTS.has(parsed.event)) return handlePaid(parsed)
    if (OVERDUE_EVENTS.has(parsed.event)) return handleOverdue(parsed)
    if (REFUNDED_EVENTS.has(parsed.event)) return handleRefunded(parsed)
    if (SUBSCRIPTION_DELETED_EVENTS.has(parsed.event)) return handleSubscriptionDeleted(parsed)
    return { httpStatus: 200, outcome: 'ignored', message: `Evento ${parsed.event} não tratado.` }
  }

  return async function handleAsaasWebhook(
    input: WebhookHandlerInput,
  ): Promise<WebhookHandlerResult> {
    if (!isValidWebhookToken(input.token, deps.expectedToken)) {
      deps.logger?.warn('asaas.webhook.unauthorized')
      return { httpStatus: 401, outcome: 'unauthorized', message: 'Token inválido.' }
    }

    const parsed = parseAsaasWebhookBody(input.body)
    if (parsed === null) {
      return { httpStatus: 400, outcome: 'invalid', message: 'Corpo do webhook não reconhecido.' }
    }

    // ── Idempotência ──────────────────────────────────────────────────────────
    let eventRow: WebhookEventRow
    try {
      eventRow = await prisma.webhookEvent.create({
        data: {
          provider: WEBHOOK_PROVIDER,
          externalId: parsed.id,
          eventType: parsed.event,
          payload: parsed.raw,
        },
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      const existing = await prisma.webhookEvent.findUnique({
        where: {
          provider_externalId: { provider: WEBHOOK_PROVIDER, externalId: parsed.id },
        },
      })
      if (!existing || existing.processedAt !== null) {
        return { httpStatus: 200, outcome: 'duplicate', message: 'Evento já processado.' }
      }
      // Entrega anterior morreu no meio: reprocessa (as operações são convergentes).
      eventRow = existing
    }

    try {
      const result = await dispatch(parsed)
      await prisma.webhookEvent.update({
        where: { id: eventRow.id },
        data: { processedAt: now(), error: null },
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await prisma.webhookEvent.update({
        where: { id: eventRow.id },
        data: { error: message.slice(0, 500) },
      })
      deps.logger?.warn('asaas.webhook.failed', { event: parsed.event, error: message })
      // 5xx de propósito: `processedAt` fica nulo e o Asaas reentrega. Devolver 200 aqui
      // perderia o evento silenciosamente — o oposto do que "sempre 200" quer dizer
      // (que é: não fazer o Asaas esperar processamento pesado, não engolir falha).
      return {
        httpStatus: 500,
        outcome: 'error',
        message: 'Falha ao processar o evento; será reprocessado.',
      }
    }
  }
}

/**
 * Webhook do Asaas — SY-13 (docs/08, parte E) e CLAUDE.md ("todo webhook é idempotente
 * por `event_id`"; área de alto risco).
 *
 * ── Autenticação ──────────────────────────────────────────────────────────────
 * NOTA sobre docs/08 SY-13, que diz "validação HMAC": o Asaas **não** assina o corpo com
 * HMAC. Ele reenvia, no header `asaas-access-token`, o token estático que cadastramos na
 * configuração do webhook. Portanto a validação correta é comparar esse token com o nosso
 * segredo — em **tempo constante**, para não vazar o segredo por timing (um `===` de
 * string sai no primeiro byte diferente). É o que `isValidWebhookToken` faz.
 *
 * ── Idempotência ──────────────────────────────────────────────────────────────
 * `AsaasWebhookEvent.id` é o ID do evento no Asaas (ex.: `evt_8f...&123456`). O Asaas
 * REENVIA o mesmo evento até receber 200 — o handler tem que persistir esse id e ignorar
 * repetições. Por isso `id` é obrigatório no parse: sem ele não há como ser idempotente.
 *
 * ── Eventos que nos importam ──────────────────────────────────────────────────
 * (o Asaas manda dezenas; o handler de billing só reage a estes — ver `ASAAS_HANDLED_EVENTS`)
 * - `PAYMENT_CONFIRMED`  — pagamento confirmado (ainda não creditado) → `Invoice.PAID`,
 *                          libera o plano imediatamente;
 * - `PAYMENT_RECEIVED`   — valor creditado na conta → confirma o crédito;
 * - `PAYMENT_OVERDUE`    — venceu sem pagar → `Invoice.FAILED` + entra no dunning (SY-09:
 *                          retry D+1/D+3/D+5, downgrade para Free em D+7);
 * - `PAYMENT_REFUNDED`   — estorno → `Invoice.REFUNDED` + revoga entitlements;
 * - `SUBSCRIPTION_DELETED` — assinatura removida no Asaas → `SubStatus.CANCELED`.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

// ─── Erro ────────────────────────────────────────────────────────────────────

/** Corpo de webhook inválido/irreconhecível. O handler deve responder 400 e NÃO retentar. */
export class AsaasWebhookError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AsaasWebhookError'
  }
}

// ─── Contrato público ────────────────────────────────────────────────────────

export interface AsaasWebhookEvent {
  /** ID do evento no Asaas — chave de idempotência (`WebhookEvent.eventId`). */
  id: string
  /** Ex.: `PAYMENT_CONFIRMED`. String crua: eventos novos não quebram o parse. */
  event: string
  paymentId: string | null
  subscriptionId: string | null
  /** Corpo original, intacto, para auditoria/reprocessamento. */
  raw: unknown
}

/** Eventos tratados pelo billing. Os demais são aceitos (200) e apenas registrados. */
export const ASAAS_HANDLED_EVENTS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'SUBSCRIPTION_DELETED',
] as const

export type AsaasHandledEvent = (typeof ASAAS_HANDLED_EVENTS)[number]

export function isHandledAsaasEvent(event: string): event is AsaasHandledEvent {
  return (ASAAS_HANDLED_EVENTS as readonly string[]).includes(event)
}

// ─── Schema tolerante ────────────────────────────────────────────────────────

const nonEmpty = z.string().min(1)

/**
 * Referência a outro recurso: o Asaas ora manda o objeto inteiro (`"payment": { "id": ... }`),
 * ora só o id (`"subscription": "sub_123"`). Aceitamos as duas formas.
 */
const reference = z.union([nonEmpty, z.object({ id: nonEmpty.nullish() }).passthrough()]).nullish()

type Reference = z.infer<typeof reference>

function referenceId(value: Reference): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id !== '') {
    return value.id
  }
  return null
}

const webhookSchema = z
  .object({
    id: nonEmpty,
    event: nonEmpty,
    /** Presente em eventos `PAYMENT_*`. Pode trazer `subscription` dentro. */
    payment: z
      .object({ id: nonEmpty.nullish(), subscription: reference })
      .passthrough()
      .nullish(),
    /** Presente em eventos `SUBSCRIPTION_*`. */
    subscription: reference,
    /** Formas alternativas já vistas em payloads/mocks — toleradas. */
    paymentId: nonEmpty.nullish(),
    subscriptionId: nonEmpty.nullish(),
  })
  .passthrough()

/**
 * Valida e normaliza o corpo de um webhook do Asaas.
 *
 * Extração dos ids, na ordem de preferência:
 * - `paymentId`      ← `payment.id` → `paymentId`
 * - `subscriptionId` ← `subscription(.id)` → `payment.subscription(.id)` → `subscriptionId`
 *
 * @throws {AsaasWebhookError} se o corpo não for objeto, ou faltar `id`/`event`.
 */
export function parseAsaasWebhook(body: unknown): AsaasWebhookEvent {
  const result = webhookSchema.safeParse(body)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ')
    throw new AsaasWebhookError(`webhook do Asaas fora do formato esperado — ${issues}`, {
      cause: result.error,
    })
  }

  const data = result.data
  const paymentId = data.payment?.id ?? data.paymentId ?? null
  const subscriptionId =
    referenceId(data.subscription) ??
    referenceId(data.payment?.subscription ?? null) ??
    data.subscriptionId ??
    null

  return {
    id: data.id,
    event: data.event,
    paymentId,
    subscriptionId,
    raw: body,
  }
}

// ─── Token do webhook ────────────────────────────────────────────────────────

/**
 * Compara o token recebido no header `asaas-access-token` com o esperado, em tempo
 * constante.
 *
 * Comparar buffers de tamanhos diferentes faz `timingSafeEqual` **lançar** — o que, além
 * de derrubar o handler, vazaria o tamanho do segredo. Por isso comparamos os SHA-256:
 * sempre 32 bytes, e a igualdade dos digests implica a igualdade das strings.
 *
 * `null` (header ausente) e `expectedToken` vazio (env não configurada) devolvem `false`:
 * webhook não autenticado nunca passa.
 */
export function isValidWebhookToken(receivedToken: string | null, expectedToken: string): boolean {
  if (receivedToken === null || receivedToken === '') return false
  if (expectedToken === '') return false

  const received = createHash('sha256').update(receivedToken, 'utf8').digest()
  const expected = createHash('sha256').update(expectedToken, 'utf8').digest()
  return timingSafeEqual(received, expected)
}

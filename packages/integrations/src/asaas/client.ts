/**
 * Cliente REST do Asaas — gateway de pagamento do LotoPro (docs/05 §5.5; docs/07 §7.4).
 *
 * Escopo: cliente, assinatura recorrente e leitura de cobranças. É o suficiente para
 * `Subscription`/`Invoice` e para o dunning (SY-09).
 *
 * ⛔ CLAUDE.md regra 1 (zero custódia): este cliente cobra **assinatura de software** do
 * próprio usuário. Nunca deve ser usado para dinheiro de aposta ou de bolão — Pix de bolão
 * é P2P entre participante e organizador e não passa por gateway nenhum.
 *
 * Meios de pagamento (docs/05 §5.5): Pix Automático é o default do produto e, nesta versão
 * da API do Asaas, corresponde a `billingType: 'PIX'` numa assinatura (`/subscriptions`) —
 * o débito recorrente é orquestrado pelo Asaas. Cartão e boleto seguem os mesmos endpoints.
 */

import { AsaasApiError, AsaasHttp, type AsaasFetchLike, type AsaasResponse } from './http'
import { centsToReais } from './money'
import {
  asaasCustomerSchema,
  asaasDeletedSchema,
  asaasPaymentListSchema,
  asaasPaymentSchema,
  asaasSubscriptionSchema,
  asaasSubscriptionWriteSchema,
  type AsaasPayment,
  type AsaasSubscription,
} from './schema'
import type { z } from 'zod'

// ─── Tipos de entrada ────────────────────────────────────────────────────────

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO'
export type AsaasCycle = 'MONTHLY' | 'YEARLY'

export interface AsaasConfig {
  apiKey: string
  /** Default: sandbox (`ASAAS_SANDBOX_BASE_URL`). Produção: `ASAAS_PRODUCTION_BASE_URL`. */
  baseUrl?: string | undefined
  fetchImpl?: AsaasFetchLike | undefined
  /** Default 10.000ms. */
  timeoutMs?: number | undefined
  /** Backoff do retry de GET. Test seam; default `ASAAS_GET_RETRY_DELAYS_MS`. */
  retryDelaysMs?: readonly number[] | undefined
  /** Test seam: substitui a espera do backoff. */
  sleep?: ((ms: number) => Promise<void>) | undefined
}

export interface CreateCustomerInput {
  name: string
  email: string
  /** Só dígitos ou formatado — o Asaas aceita ambos. */
  cpfCnpj?: string | undefined
  /** Nosso `user.id`. */
  externalReference?: string | undefined
}

export interface CreateSubscriptionInput {
  customerId: string
  billingType: AsaasBillingType
  /** Centavos (CLAUDE.md regra 5). Convertido para reais na borda — ver `money.ts`. */
  valueCents: bigint
  /** `YYYY-MM-DD` — data da primeira cobrança. */
  nextDueDate: string
  cycle: AsaasCycle
  description?: string | undefined
  /** Nosso `subscription.id`. Obrigatório: é a chave de reconciliação. */
  externalReference: string
}

export interface UpdateSubscriptionInput {
  valueCents?: bigint | undefined
  billingType?: AsaasBillingType | undefined
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Valida `YYYY-MM-DD` de verdade (rejeita `2026-02-31`) sem depender de fuso. */
function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new TypeError(`${field} deve estar em YYYY-MM-DD, recebido: ${JSON.stringify(value)}`)
  }
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10)) as [
    number,
    number,
    number,
  ]
  const probe = new Date(Date.UTC(year, month - 1, day))
  const valid =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  if (!valid) throw new TypeError(`${field} não é uma data válida: ${JSON.stringify(value)}`)
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} é obrigatório`)
  }
}

function assertPositiveCents(valueCents: bigint, field: string): void {
  if (typeof valueCents !== 'bigint') {
    throw new TypeError(`${field} deve ser bigint de centavos, recebido: ${typeof valueCents}`)
  }
  if (valueCents <= 0n) {
    throw new TypeError(`${field} deve ser maior que zero, recebido: ${valueCents}`)
  }
}

/** Máximo de páginas em `listPaymentsBySubscription` — trava contra loop infinito. */
const MAX_PAGES = 20
const PAGE_SIZE = 100

// ─── Cliente ─────────────────────────────────────────────────────────────────

export class AsaasClient {
  private readonly http: AsaasHttp

  constructor(config: AsaasConfig) {
    this.http = new AsaasHttp(config)
  }

  /**
   * `POST /customers`. Idempotência é responsabilidade do chamador: guarde o `id`
   * devolvido em `User`/`Subscription` e não chame de novo para o mesmo usuário.
   */
  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    assertNonEmpty(input.name, 'name')
    assertNonEmpty(input.email, 'email')

    const body: Record<string, unknown> = { name: input.name, email: input.email }
    if (input.cpfCnpj !== undefined) body.cpfCnpj = input.cpfCnpj
    if (input.externalReference !== undefined) body.externalReference = input.externalReference

    const response = await this.http.request('POST', '/customers', { body })
    const data = decode(asaasCustomerSchema, response, 'cliente')
    return { id: data.id }
  }

  /**
   * `POST /subscriptions` — cria a assinatura recorrente.
   *
   * ⚠️ Não é retentado automaticamente (ver `http.ts`): em timeout, reconcilie por
   * `externalReference` antes de tentar de novo, para não criar assinatura duplicada.
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<{ id: string; status: string }> {
    assertNonEmpty(input.customerId, 'customerId')
    assertNonEmpty(input.externalReference, 'externalReference')
    assertPositiveCents(input.valueCents, 'valueCents')
    assertIsoDate(input.nextDueDate, 'nextDueDate')

    const body: Record<string, unknown> = {
      customer: input.customerId,
      billingType: input.billingType,
      value: centsToReais(input.valueCents),
      nextDueDate: input.nextDueDate,
      cycle: input.cycle,
      externalReference: input.externalReference,
    }
    if (input.description !== undefined) body.description = input.description

    const response = await this.http.request('POST', '/subscriptions', { body })
    return decode(asaasSubscriptionWriteSchema, response, 'assinatura')
  }

  /**
   * `PUT /subscriptions/{id}` — upgrade/downgrade de plano ou troca de meio de pagamento.
   * Envia apenas os campos informados (PATCH semântico).
   */
  async updateSubscription(
    id: string,
    input: UpdateSubscriptionInput,
  ): Promise<{ id: string; status: string }> {
    assertNonEmpty(id, 'id')

    const body: Record<string, unknown> = {}
    if (input.valueCents !== undefined) {
      assertPositiveCents(input.valueCents, 'valueCents')
      body.value = centsToReais(input.valueCents)
    }
    if (input.billingType !== undefined) body.billingType = input.billingType
    if (Object.keys(body).length === 0) {
      throw new TypeError('updateSubscription: informe ao menos `valueCents` ou `billingType`')
    }

    const response = await this.http.request('PUT', `/subscriptions/${encodeURIComponent(id)}`, {
      body,
    })
    return decode(asaasSubscriptionWriteSchema, response, 'assinatura')
  }

  /**
   * `DELETE /subscriptions/{id}` — encerra a recorrência no Asaas.
   * Não mexe nas cobranças já emitidas nem faz estorno.
   */
  async cancelSubscription(id: string): Promise<{ deleted: boolean }> {
    assertNonEmpty(id, 'id')
    const response = await this.http.request('DELETE', `/subscriptions/${encodeURIComponent(id)}`)
    return decode(asaasDeletedSchema, response, 'cancelamento de assinatura')
  }

  /** `GET /subscriptions/{id}` (retentado até 3x). */
  async getSubscription(id: string): Promise<AsaasSubscription> {
    assertNonEmpty(id, 'id')
    const response = await this.http.request('GET', `/subscriptions/${encodeURIComponent(id)}`)
    return decode(asaasSubscriptionSchema, response, 'assinatura')
  }

  /** `GET /payments/{id}` (retentado até 3x). */
  async getPayment(id: string): Promise<AsaasPayment> {
    assertNonEmpty(id, 'id')
    const response = await this.http.request('GET', `/payments/${encodeURIComponent(id)}`)
    return decode(asaasPaymentSchema, response, 'cobrança')
  }

  /**
   * `GET /subscriptions/{id}/payments` — todas as cobranças da assinatura, da mais nova
   * para a mais antiga (ordem do Asaas).
   *
   * Pagina sozinho (100 por página, até `MAX_PAGES`): uma assinatura mensal antiga passa
   * do limite default de 10 do Asaas, e uma lista truncada faria o dunning perder cobrança.
   */
  async listPaymentsBySubscription(subscriptionId: string): Promise<AsaasPayment[]> {
    assertNonEmpty(subscriptionId, 'subscriptionId')
    const path = `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`
    const payments: AsaasPayment[] = []
    let offset = 0

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await this.http.request('GET', path, {
        query: { limit: PAGE_SIZE, offset },
      })
      const data = decode(asaasPaymentListSchema, response, 'lista de cobranças')
      payments.push(...data.data)
      if (data.hasMore !== true || data.data.length === 0) break
      offset += data.data.length
    }

    return payments
  }
}

// ─── Decodificação ───────────────────────────────────────────────────────────

/**
 * Valida o corpo 2xx contra o schema. Uma resposta 2xx que não bate com o contrato é
 * tratada como falha da API — vira `AsaasApiError` com o status e o corpo originais, para
 * que o chamador tenha um único tipo de erro para tratar.
 */
function decode<S extends z.ZodTypeAny>(
  schema: S,
  response: AsaasResponse,
  what: string,
): z.infer<S> {
  const result = schema.safeParse(response.body)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ')
    throw new AsaasApiError(
      `resposta do Asaas fora do schema esperado (${what}) — ${issues}`,
      response.status,
      response.body,
      { cause: result.error },
    )
  }
  return result.data
}

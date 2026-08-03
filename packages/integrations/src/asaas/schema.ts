/**
 * Schemas Zod das respostas do Asaas + normalização para os contratos públicos
 * `AsaasSubscription` / `AsaasPayment`.
 *
 * Princípio (igual ao da Caixa, `../caixa/schema.ts`): **tolerância máxima na borda**.
 * O Asaas adiciona campos com frequência, então tudo é `.passthrough()` e só exigimos o
 * que realmente usamos. Campos que o Asaas devolve como ausentes/`null` viram `null`
 * explícito no contrato — nunca `undefined`, para não confundir "não veio" com "veio
 * vazio" ao gravar em `Subscription`/`Invoice` (docs/07 §7.4).
 *
 * Este módulo NÃO faz requisição; só valida e normaliza.
 */

import { z } from 'zod'
import { reaisToCents } from './money'

// ─── Contratos públicos ──────────────────────────────────────────────────────

/**
 * Assinatura no Asaas → alimenta `Subscription` (docs/07 §7.4).
 *
 * `value` fica em **reais decimais**, exatamente como o Asaas devolve. Assimetria
 * proposital em relação a `AsaasPayment.valueCents`: o valor da assinatura é a "tabela"
 * que nós mesmos definimos (`Plan.priceMonthlyCents`), enquanto o valor da cobrança é
 * dinheiro que entra e vira `Invoice.amountCents` — esse precisa ser `bigint` de centavos.
 * Para comparar com o plano, use `reaisToCents(sub.value)`.
 */
export interface AsaasSubscription {
  id: string
  /** ID do cliente no Asaas (`cus_...`). */
  customer: string
  /** `ACTIVE` | `EXPIRED` | `INACTIVE` — string crua, o mapeamento para `SubStatus` é do domínio. */
  status: string
  /** Reais decimais, como o Asaas devolve. */
  value: number
  /** `YYYY-MM-DD`; `null` quando não há próxima cobrança (assinatura encerrada). */
  nextDueDate: string | null
  cycle: string
  billingType: string
  /** Nosso `subscription.id`. */
  externalReference: string | null
}

/**
 * Cobrança no Asaas → alimenta `Invoice` (docs/07 §7.4).
 *
 * `valueCents` é `bigint` de centavos (CLAUDE.md regra 5). `subscription` é `null` em
 * cobrança avulsa.
 */
export interface AsaasPayment {
  id: string
  subscription: string | null
  customer: string
  /** `PENDING` | `CONFIRMED` | `RECEIVED` | `OVERDUE` | `REFUNDED` | ... */
  status: string
  valueCents: bigint
  /** `YYYY-MM-DD`. */
  dueDate: string
  /** `YYYY-MM-DD` do crédito; `null` enquanto não pago. */
  paymentDate: string | null
  billingType: string
  /** Página de cobrança do Asaas (fatura/QR Pix). */
  invoiceUrl: string | null
  externalReference: string | null
}

// ─── Primitivos ──────────────────────────────────────────────────────────────

const nonEmpty = z.string().min(1)

/** String opcional que pode chegar `null`, `undefined` ou `""` — tudo vira `null`. */
const optionalString = z
  .string()
  .nullish()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value))

/**
 * Valor monetário do Asaas → centavos. A falha de conversão vira issue de validação,
 * e o cliente a converte em `AsaasApiError` (ver `client.ts`).
 */
const centsFromReais = z.number().finite().transform((value, ctx) => {
  try {
    return reaisToCents(value)
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `valor monetário inválido: ${String(value)} (${
        error instanceof Error ? error.message : String(error)
      })`,
    })
    return z.NEVER
  }
})

// ─── Respostas ───────────────────────────────────────────────────────────────

/** `POST /customers` — só o `id` nos interessa; ele vai para `User`/`Subscription`. */
export const asaasCustomerSchema = z.object({ id: nonEmpty }).passthrough()

/**
 * Resposta mínima de escrita em assinatura (`POST`/`PUT /subscriptions[/{id}]`).
 * O corpo completo é o mesmo de `GET`, mas o contrato público só promete `{ id, status }`.
 */
export const asaasSubscriptionWriteSchema = z
  .object({ id: nonEmpty, status: nonEmpty })
  .passthrough()
  .transform((raw): { id: string; status: string } => ({ id: raw.id, status: raw.status }))

/** `DELETE /subscriptions/{id}` → `{ "deleted": true, "id": "sub_..." }`. */
export const asaasDeletedSchema = z
  .object({ deleted: z.boolean() })
  .passthrough()
  .transform((raw): { deleted: boolean } => ({ deleted: raw.deleted }))

export const asaasSubscriptionSchema = z
  .object({
    id: nonEmpty,
    customer: nonEmpty,
    status: nonEmpty,
    value: z.number().finite(),
    nextDueDate: optionalString,
    cycle: nonEmpty,
    billingType: nonEmpty,
    externalReference: optionalString,
  })
  .passthrough()
  .transform(
    (raw): AsaasSubscription => ({
      id: raw.id,
      customer: raw.customer,
      status: raw.status,
      value: raw.value,
      nextDueDate: raw.nextDueDate,
      cycle: raw.cycle,
      billingType: raw.billingType,
      externalReference: raw.externalReference,
    }),
  )

export const asaasPaymentSchema = z
  .object({
    id: nonEmpty,
    customer: nonEmpty,
    subscription: optionalString,
    status: nonEmpty,
    value: centsFromReais,
    dueDate: nonEmpty,
    /** Data do crédito efetivo. */
    paymentDate: optionalString,
    /** Data informada pelo pagador; usada como fallback quando `paymentDate` ainda não veio. */
    clientPaymentDate: optionalString,
    billingType: nonEmpty,
    invoiceUrl: optionalString,
    externalReference: optionalString,
  })
  .passthrough()
  .transform(
    (raw): AsaasPayment => ({
      id: raw.id,
      subscription: raw.subscription,
      customer: raw.customer,
      status: raw.status,
      valueCents: raw.value,
      dueDate: raw.dueDate,
      paymentDate: raw.paymentDate ?? raw.clientPaymentDate,
      billingType: raw.billingType,
      invoiceUrl: raw.invoiceUrl,
      externalReference: raw.externalReference,
    }),
  )

/**
 * Lista paginada do Asaas: `{ object, hasMore, totalCount, limit, offset, data: [...] }`.
 * `hasMore` é opcional por tolerância — ausência é tratada como "acabou".
 */
export const asaasPaymentListSchema = z
  .object({
    data: z.array(asaasPaymentSchema),
    hasMore: z.boolean().nullish(),
    totalCount: z.number().nullish(),
  })
  .passthrough()

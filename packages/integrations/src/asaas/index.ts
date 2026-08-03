/**
 * Asaas — gateway de pagamento (docs/05 §5.5, docs/07 §7.4, docs/08 SY-09/SY-13).
 *
 * Superfície pública do módulo. Tudo que o billing consome sai daqui:
 *
 * ```ts
 * import { AsaasClient, parseAsaasWebhook, isValidWebhookToken, AsaasApiError } from '@lotopro/integrations/asaas'
 *
 * const asaas = new AsaasClient({ apiKey: process.env.ASAAS_API_KEY! })
 * const { id } = await asaas.createSubscription({
 *   customerId, billingType: 'PIX', valueCents: 2490n,
 *   nextDueDate: '2026-09-01', cycle: 'MONTHLY', externalReference: subscription.id,
 * })
 * ```
 *
 * Erros: **tudo** que a integração lança é `AsaasApiError` (HTTP, timeout, rede, resposta
 * fora do schema), `AsaasWebhookError` (corpo de webhook inválido) ou `TypeError`/
 * `RangeError` para argumento inválido do chamador.
 */

export {
  AsaasClient,
  type AsaasBillingType,
  type AsaasConfig,
  type AsaasCycle,
  type CreateCustomerInput,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
} from './client'

export {
  AsaasApiError,
  AsaasNetworkError,
  AsaasTimeoutError,
  ASAAS_GET_RETRY_DELAYS_MS,
  ASAAS_PRODUCTION_BASE_URL,
  ASAAS_SANDBOX_BASE_URL,
  ASAAS_USER_AGENT,
  DEFAULT_ASAAS_TIMEOUT_MS,
  describeAsaasError,
  isRetryableAsaasError,
  type AsaasFetchInitLike,
  type AsaasFetchLike,
  type AsaasFetchResponseLike,
  type AsaasHttpMethod,
  // Alias do contrato: `AsaasConfig.fetchImpl?: FetchLike`.
  // (Nome próprio do módulo é `AsaasFetchLike`; `FetchLike` da Caixa é outro tipo — só
  // GET, sem `method`/`body` —, por isso este alias local.)
  type AsaasFetchLike as FetchLike,
} from './http'

export {
  centsToReais,
  reaisToCents,
  MAX_SAFE_CENTS,
} from './money'

export {
  asaasCustomerSchema,
  asaasDeletedSchema,
  asaasPaymentListSchema,
  asaasPaymentSchema,
  asaasSubscriptionSchema,
  asaasSubscriptionWriteSchema,
  type AsaasPayment,
  type AsaasSubscription,
} from './schema'

export {
  AsaasWebhookError,
  ASAAS_HANDLED_EVENTS,
  isHandledAsaasEvent,
  isValidWebhookToken,
  parseAsaasWebhook,
  type AsaasHandledEvent,
  type AsaasWebhookEvent,
} from './webhook'

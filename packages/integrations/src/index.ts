/**
 * @lotopro/integrations — adaptadores de serviços externos.
 *
 * Regra: tudo que sai daqui já está no contrato canônico de `@lotopro/core`
 * (packages/core/src/types.ts). Formatos de terceiros não vazam para o domínio.
 */

export {
  caixaPayloadSchema,
  caixaRateioPremioSchema,
  safeParseCaixaPayload,
  type CaixaPayload,
  type CaixaRateioPremio,
} from './caixa/schema'

export {
  parseCaixaPayload,
  moneyToCents,
  parseBrDate,
  cleanText,
  CaixaParseError,
} from './caixa/parse'

export {
  CaixaOfficialProvider,
  CaixaHttpError,
  CaixaNotFoundError,
  CaixaNetworkError,
  CaixaTimeoutError,
  CaixaTlsError,
  CAIXA_BASE_URL,
  CAIXA_SLUG_PATH,
  DEFAULT_RETRY_DELAYS_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  describeTlsFailure,
  isRetryableError,
  type CaixaOfficialProviderOptions,
  type FetchInitLike,
  type FetchLike,
  type FetchResponseLike,
  type LotteryResultProvider,
} from './caixa/provider'

export {
  ResilientResultProvider,
  AllProvidersFailedError,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RESET_TIMEOUT_MS,
  type CircuitSnapshot,
  type CircuitState,
  type ProviderOperation,
  type ResilientEvent,
  type ResilientLogger,
  type ResilientResultProviderOptions,
} from './caixa/resilient'

export {
  CaixaMirrorProvider,
  CAIXA_MIRROR_BASE_URL,
  MIRROR_RETRY_DELAYS_MS,
  MIRROR_TIMEOUT_MS,
  type CaixaMirrorProviderOptions,
} from './caixa/mirror'

export {
  EmailSendError,
  betPrizedTemplate,
  betCheckedTemplate,
  contestAccumulatedTemplate,
  poolPaymentPendingTemplate,
  poolBetPlacedTemplate,
  poolPrizedTemplate,
  renderPlainTemplate,
  formatMillionsBRL,
  ResendEmailSender,
  RESEND_API_URL,
  DEFAULT_EMAIL_TIMEOUT_MS,
  NoopPushSender,
  PUSH_NOT_CONFIGURED_ERROR,
  type EmailMessage,
  type EmailSendResult,
  type EmailSender,
  type PushSubscriptionInput,
  type PushMessage,
  type PushSendResult,
  type PushSender,
  type NotificationTemplateOutput,
  type BetPrizedTemplatePayload,
  type BetCheckedTemplatePayload,
  type ContestAccumulatedTemplatePayload,
  type PoolPaymentPendingTemplatePayload,
  type PoolBetPlacedTemplatePayload,
  type PoolPrizedTemplatePayload,
  type ResendEmailSenderOptions,
  type ResendFetchLike,
  type ResendFetchInitLike,
  type ResendFetchResponseLike,
  WebPushSender,
} from './notify'

// ⚠️ Asaas exporta `AsaasFetchLike` (POST/PUT/DELETE), distinto do `FetchLike`
// da Caixa (só GET) — NÃO reexportar o alias `FetchLike` do asaas aqui.
export {
  AsaasClient,
  AsaasApiError,
  AsaasNetworkError,
  AsaasTimeoutError,
  AsaasWebhookError,
  parseAsaasWebhook,
  isValidWebhookToken,
  isHandledAsaasEvent,
  centsToReais,
  reaisToCents,
  MAX_SAFE_CENTS,
  ASAAS_SANDBOX_BASE_URL,
  ASAAS_PRODUCTION_BASE_URL,
  ASAAS_HANDLED_EVENTS,
  DEFAULT_ASAAS_TIMEOUT_MS,
  ASAAS_GET_RETRY_DELAYS_MS,
  type AsaasConfig,
  type AsaasSubscription,
  type AsaasPayment,
  type AsaasWebhookEvent,
  type AsaasBillingType,
  type AsaasCycle,
  type AsaasFetchLike,
} from './asaas'

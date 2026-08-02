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

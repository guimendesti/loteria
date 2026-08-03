/**
 * SY-04 — barrel do módulo de notificações. Ver docs/08 parte E (SY-04/SY-10) e
 * docs/09 §9.6 (textos exatos).
 */

export type {
  EmailMessage,
  EmailSendResult,
  EmailSender,
  PushSubscriptionInput,
  PushMessage,
  PushSendResult,
  PushSender,
  NotificationTemplateOutput,
  BetPrizedTemplatePayload,
  BetCheckedTemplatePayload,
  ContestAccumulatedTemplatePayload,
  PoolPaymentPendingTemplatePayload,
  PoolBetPlacedTemplatePayload,
  PoolPrizedTemplatePayload,
} from './types'
export { EmailSendError } from './types'

export {
  betPrizedTemplate,
  betCheckedTemplate,
  contestAccumulatedTemplate,
  poolPaymentPendingTemplate,
  poolBetPlacedTemplate,
  poolPrizedTemplate,
  billingPaymentFailedTemplate,
  billingDowngradedTemplate,
  billingTrialEndedTemplate,
  renderPlainTemplate,
  formatMillionsBRL,
  type BillingPaymentFailedTemplatePayload,
  type BillingDowngradedTemplatePayload,
  type BillingTrialEndedTemplatePayload,
} from './templates'

export {
  ResendEmailSender,
  RESEND_API_URL,
  DEFAULT_EMAIL_TIMEOUT_MS,
  type ResendEmailSenderOptions,
  type ResendFetchLike,
  type ResendFetchInitLike,
  type ResendFetchResponseLike,
} from './resend'

export { NoopPushSender, PUSH_NOT_CONFIGURED_ERROR } from './noop'

export {
  WebPushSender,
  DEFAULT_PUSH_TIMEOUT_MS,
  type WebPushSenderOptions,
  type WebPushImplLike,
  type WebPushSubscriptionLike,
  type WebPushVapidDetailsLike,
  type WebPushRequestOptionsLike,
  type WebPushSendResultLike,
} from './webpush'

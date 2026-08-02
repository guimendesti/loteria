/**
 * SY-04 — contratos de envio de notificação (docs/08 parte E). Dois canais "de saída"
 * (e-mail, push); IN_APP não precisa de sender porque a própria linha em `Notification`
 * (packages/db) já É a entrega.
 *
 * Ambos são interfaces puras — quem injeta a implementação concreta é `apps/worker`
 * (`jobs/notify.ts`), nunca este pacote. Os tipos aqui não conhecem BullMQ/Prisma.
 */

// ─── E-mail ────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** Sobrescreve o remetente padrão do sender, se necessário (ex.: teste). */
  from?: string
}

export interface EmailSendResult {
  /** ID do provedor (ex.: `id` devolvido pela Resend) — útil para suporte/depuração. */
  providerId: string
}

/** Erro tipado de envio — cobre HTTP não-2xx, timeout e falha de rede num só tipo. */
export class EmailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EmailSendError'
  }
}

export interface EmailSender {
  /** Identificador estável, usado em log (ex.: "resend"). */
  readonly name: string
  send(message: EmailMessage): Promise<EmailSendResult>
}

// ─── Push (Web Push / VAPID) ───────────────────────────────────────────────────

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushMessage {
  subscription: PushSubscriptionInput
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Diferente de e-mail, push não lança em falha — devolve `{ ok: false, error }`. Motivo:
 * uma falha de push (endpoint expirado, VAPID ausente, provedor indisponível) é uma
 * ocorrência ESPERADA e frequente (dispositivos somem, browsers revogam subscriptions),
 * não uma condição excepcional — o chamador (`jobs/notify.ts`) sempre trata os dois casos
 * do mesmo jeito (grava `Notification` com status SENT/FAILED), então uma exceção não
 * compraria nada além de try/catch extra.
 */
export interface PushSendResult {
  ok: boolean
  /** Presente quando `ok = false` — motivo legível, vira `Notification.error`. */
  error?: string
}

export interface PushSender {
  readonly name: string
  send(message: PushMessage): Promise<PushSendResult>
}

// ─── Templates (docs/09 §9.6 — textos exatos) ─────────────────────────────────

export interface NotificationTemplateOutput {
  /** Título — dobra como `Notification.title` (IN_APP) e `EmailMessage.subject`. */
  subject: string
  html: string
  /** Corpo em texto puro — dobra como `Notification.body` e `EmailMessage.text`. */
  text: string
}

export interface BetPrizedTemplatePayload {
  lotteryName: string
  contestNumber: number
  hits: number
}

export interface BetCheckedTemplatePayload {
  lotteryName: string
  contestNumber: number
  hits: number
  /**
   * Concursos restantes de validade do jogo (aposta multi-concurso). Só entra no texto
   * quando `hits > 0` (doc 9.6, linha "Acertos sem prêmio": "Seu jogo vale mais N
   * concursos."). Ausente/`0` → a frase é omitida.
   */
  remainingContests?: number
}

export interface ContestAccumulatedTemplatePayload {
  lotteryName: string
  estimatedNextCents: bigint
  /**
   * Já formatado pelo chamador (ex.: "quinta-feira, 21h") — `templates.ts` não faz cálculo
   * de calendário/agenda, isso é responsabilidade de quem monta o payload
   * (`jobs/accumulated-alert.ts`, que tem acesso a `DrawSchedule`).
   */
  nextDrawLabel: string
}

export interface PoolPaymentPendingTemplatePayload {
  memberName: string
  poolName: string
  shares: number
}

export interface PoolBetPlacedTemplatePayload {
  poolName: string
}

export interface PoolPrizedTemplatePayload {
  poolName: string
  /** Já formatado (ex.: "R$ 340,00") — o cálculo do rateio é de `@lotopro/core/pool`. */
  memberShareText: string
}

/**
 * SY-04 — canal de e-mail via API HTTP da Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * DECISÃO (pedida no escopo): o pacote `resend` (SDK oficial) NÃO está instalado e este
 * território não roda `pnpm install`/`add`. Em vez de bloquear em uma dependência que o
 * orquestrador ainda não trouxe, implementamos a chamada com o `fetch` nativo do Node 20 —
 * é só um POST JSON com Bearer token, não precisa de SDK. Mesmo padrão estrutural de
 * `../caixa/provider.ts` (`FetchLike`/`FetchResponseLike` locais, injetáveis em teste, sem
 * depender de `lib.dom`).
 *
 * Quando o SDK `resend` for instalado pelo orquestrador, esta classe pode ser reescrita por
 * cima dele sem mudar a interface `EmailSender` — nada fora deste arquivo precisa mudar.
 */
import { EmailSendError, type EmailMessage, type EmailSendResult, type EmailSender } from './types'

// ─── Tipos mínimos de HTTP (estruturais — sem lib.dom, ver caixa/provider.ts) ─────────────

export interface ResendFetchResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  json(): Promise<unknown>
}

export interface ResendFetchInitLike {
  method: 'POST'
  signal: AbortSignal
  headers: Record<string, string>
  body: string
}

export type ResendFetchLike = (url: string, init: ResendFetchInitLike) => Promise<ResendFetchResponseLike>

export const RESEND_API_URL = 'https://api.resend.com/emails'
export const DEFAULT_EMAIL_TIMEOUT_MS = 10_000

export interface ResendEmailSenderOptions {
  apiKey: string
  /** Remetente padrão (ex.: `"LotoPro <notificacoes@lotopro.com.br>"`). */
  from: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: ResendFetchLike
}

interface ResendErrorBody {
  message?: unknown
  name?: unknown
}

interface ResendSuccessBody {
  id?: unknown
}

function isAbortError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (name === 'AbortError' || name === 'TimeoutError') return true
  }
  return false
}

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const { message, name } = body as ResendErrorBody
    if (typeof message === 'string' && message.length > 0) {
      return typeof name === 'string' && name.length > 0 ? `${name}: ${message}` : message
    }
  }
  return fallback
}

function extractId(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const { id } = body as ResendSuccessBody
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

export class ResendEmailSender implements EmailSender {
  readonly name = 'resend'
  private readonly apiKey: string
  private readonly from: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: ResendFetchLike

  constructor(options: ResendEmailSenderOptions) {
    if (!options.apiKey) {
      throw new TypeError('ResendEmailSender: apiKey é obrigatório (RESEND_API_KEY ausente?)')
    }
    if (!options.from) {
      throw new TypeError('ResendEmailSender: from é obrigatório (EMAIL_FROM ausente?)')
    }
    this.apiKey = options.apiKey
    this.from = options.from
    this.baseUrl = options.baseUrl ?? RESEND_API_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_EMAIL_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as ResendFetchLike)

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('fetch global indisponível: use Node >= 18 ou injete `fetchImpl` em ResendEmailSender.')
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from ?? this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      })

      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined // corpo vazio/não-JSON — segue com `body === undefined`
      }

      if (!response.ok) {
        const detail = extractErrorDetail(body, response.statusText)
        throw new EmailSendError(`Resend respondeu HTTP ${response.status}: ${detail}`)
      }

      const id = extractId(body)
      if (id === null) {
        throw new EmailSendError('Resend respondeu 2xx sem `id` no corpo — resposta inesperada da API')
      }
      return { providerId: id }
    } catch (error) {
      if (error instanceof EmailSendError) throw error

      if (timedOut || isAbortError(error)) {
        throw new EmailSendError(`Resend não respondeu em ${this.timeoutMs}ms`, { cause: error })
      }

      const detail = error instanceof Error ? error.message : String(error)
      throw new EmailSendError(`falha de rede ao chamar a Resend: ${detail}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }
}

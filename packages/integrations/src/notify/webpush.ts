/**
 * SY-04 — canal de push real (Web Push / VAPID) via a lib `web-push` (RFC 8291/8292).
 *
 * `NoopPushSender` (./noop.ts) documentava a decisão de NÃO reimplementar o protocolo à
 * mão (assinatura JWT ES256 + criptografia `aes128gcm`) — usar a lib oficial é a escolha
 * certa. Esta classe implementa `PushSender` (./types.ts) por cima dela, com o mesmo
 * padrão estrutural de `resend.ts`/`caixa/provider.ts`: um tipo mínimo, estrutural, para a
 * dependência externa (`WebPushImplLike`), injetável em teste sem abrir socket nem
 * depender da lib real.
 *
 * DECISÃO — VAPID por chamada, não `webpush.setVapidDetails()` global: a lib real guarda
 * essa config numa variável de módulo compartilhada entre TODAS as chamadas do processo.
 * Se duas instâncias de `WebPushSender` coexistirem (ex.: uma fixture de teste e o sender
 * real, ou dois ambientes num mesmo worker), uma sobrescreveria a VAPID da outra — um bug
 * de corrida silencioso. Em vez disso, passamos `options.vapidDetails` em toda chamada de
 * `sendNotification`, que a lib aceita e prioriza sobre o estado global (ver
 * `RequestOptions.vapidDetails` em @types/web-push). Isso mantém `WebPushSender` sem
 * estado mutável global e seguro para múltiplas instâncias no mesmo processo.
 *
 * DECISÃO — contrato de erro "subscription morta" (404/410): a interface `PushSendResult`
 * (./types.ts) só tem `{ ok, error? }` — não tem um campo booleano tipo
 * `shouldDeleteSubscription`. `types.ts` é território de outro dono nesta tarefa, então NÃO
 * alteramos a interface. Em vez disso, embutimos o código no `error`: `"gone:404"` /
 * `"gone:410"`. `apps/worker/src/jobs/notify.ts` pode detectar isso com
 * `error?.startsWith('gone:')` e apagar a `PushSubscription` expirada antes de tentar de
 * novo. MELHORIA SUGERIDA para o orquestrador: promover isso a um campo tipado em
 * `PushSendResult` (ex.: `shouldDeleteSubscription?: boolean`) quando `types.ts` puder ser
 * alterado — o parsing de string é um contrato frágil, serve como ponte até lá.
 */
import * as webpush from 'web-push'
import type { PushMessage, PushSendResult, PushSender } from './types'

// ─── Tipos mínimos do `web-push` (estruturais — ver ResendFetchLike em resend.ts) ────────

export interface WebPushSubscriptionLike {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface WebPushVapidDetailsLike {
  subject: string
  publicKey: string
  privateKey: string
}

export interface WebPushRequestOptionsLike {
  vapidDetails: WebPushVapidDetailsLike
  timeout?: number
}

export interface WebPushSendResultLike {
  statusCode: number
  body: string
  headers: Record<string, string>
}

/**
 * Tipo estrutural mínimo da lib `web-push` consumido por esta classe — permite injetar um
 * fake em teste (sem rede) e é satisfeito pelo módulo real `web-push` via cast (a lib real
 * aceita `payload` mais amplo e devolve exatamente este formato de sucesso; em erro,
 * lança `WebPushError`, que tem `statusCode` — ver checagem estrutural em `send()`).
 */
export interface WebPushImplLike {
  sendNotification(
    subscription: WebPushSubscriptionLike,
    payload: string,
    options: WebPushRequestOptionsLike,
  ): Promise<WebPushSendResultLike>
}

export const DEFAULT_PUSH_TIMEOUT_MS = 10_000

export interface WebPushSenderOptions {
  vapidPublicKey: string
  vapidPrivateKey: string
  /** 'mailto:' ou 'https:' — exigido pelo VAPID spec (RFC 8292 §2). */
  subject: string
  /** Socket timeout por envio, repassado como `RequestOptions.timeout` da lib. */
  timeoutMs?: number
  /** Injetável em teste — ver `WebPushImplLike`. Default: a lib `web-push` real. */
  webpushImpl?: WebPushImplLike
}

interface WebPushPayload {
  title: string
  body: string
  url?: string
}

function isGoneStatus(status: number | undefined): status is 404 | 410 {
  return status === 404 || status === 410
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const status = (error as { statusCode?: unknown }).statusCode
    if (typeof status === 'number') return status
  }
  return undefined
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export class WebPushSender implements PushSender {
  readonly name = 'web-push'
  private readonly vapidDetails: WebPushVapidDetailsLike
  private readonly timeoutMs: number
  private readonly impl: WebPushImplLike

  constructor(options: WebPushSenderOptions) {
    if (!options.vapidPublicKey) {
      throw new TypeError('WebPushSender: vapidPublicKey é obrigatório (VAPID_PUBLIC_KEY ausente?)')
    }
    if (!options.vapidPrivateKey) {
      throw new TypeError('WebPushSender: vapidPrivateKey é obrigatório (VAPID_PRIVATE_KEY ausente?)')
    }
    if (!options.subject) {
      throw new TypeError(
        'WebPushSender: subject é obrigatório (VAPID_SUBJECT ausente? ex.: "mailto:contato@lotopro.com.br")',
      )
    }
    if (!options.subject.startsWith('mailto:') && !options.subject.startsWith('https:')) {
      throw new TypeError(
        `WebPushSender: subject deve começar com "mailto:" ou "https:" (RFC 8292 §2) — recebido "${options.subject}"`,
      )
    }

    this.vapidDetails = {
      subject: options.subject,
      publicKey: options.vapidPublicKey,
      privateKey: options.vapidPrivateKey,
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PUSH_TIMEOUT_MS
    this.impl = options.webpushImpl ?? (webpush as unknown as WebPushImplLike)
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    const url = message.data?.url
    const payload: WebPushPayload = {
      title: message.title,
      body: message.body,
      ...(typeof url === 'string' ? { url } : {}),
    }

    try {
      await this.impl.sendNotification(
        {
          endpoint: message.subscription.endpoint,
          keys: { p256dh: message.subscription.p256dh, auth: message.subscription.auth },
        },
        JSON.stringify(payload),
        { vapidDetails: this.vapidDetails, timeout: this.timeoutMs },
      )
      return { ok: true }
    } catch (error) {
      const status = extractStatusCode(error)
      if (isGoneStatus(status)) {
        // Ver decisão no cabeçalho do arquivo — "gone:<statusCode>" é o contrato-ponte
        // até `PushSendResult` ganhar um campo tipado para isso.
        return { ok: false, error: `gone:${status}` }
      }
      return { ok: false, error: extractMessage(error) }
    }
  }
}

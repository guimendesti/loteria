import { describe, expect, it, vi } from 'vitest'
import type { PushMessage } from '../../src/notify/types'
import {
  WebPushSender,
  type WebPushImplLike,
  type WebPushRequestOptionsLike,
  type WebPushSendResultLike,
  type WebPushSubscriptionLike,
} from '../../src/notify/webpush'

/** Nenhum teste desta suíte abre socket — `webpushImpl` é sempre injetado (fake). */

const VAPID = {
  vapidPublicKey: 'pubkey_abc',
  vapidPrivateKey: 'privkey_xyz',
  subject: 'mailto:contato@lotopro.com.br',
}

const message: PushMessage = {
  subscription: { endpoint: 'https://push.example/1', p256dh: 'p256dh_valor', auth: 'auth_valor' },
  title: 'Você foi premiado!',
  body: 'Confira o resultado do concurso.',
}

function okResult(): WebPushSendResultLike {
  return { statusCode: 201, body: '', headers: {} }
}

class WebPushErrorFake extends Error {
  readonly statusCode: number
  constructor(statusCode: number, message = 'push service error') {
    super(message)
    this.name = 'WebPushError'
    this.statusCode = statusCode
  }
}

describe('WebPushSender — caminho feliz', () => {
  it('envia o payload JSON {title, body} com a subscription e o VAPID configurados, e devolve { ok: true }', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => okResult())
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    const result = await sender.send(message)

    expect(result).toEqual({ ok: true })
    expect(sendNotification).toHaveBeenCalledTimes(1)
    const [subscription, payload, options] = sendNotification.mock.calls[0]!
    expect(subscription).toEqual<WebPushSubscriptionLike>({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p256dh_valor', auth: 'auth_valor' },
    })
    expect(JSON.parse(payload as string)).toEqual({
      title: 'Você foi premiado!',
      body: 'Confira o resultado do concurso.',
    })
    expect(options).toEqual<WebPushRequestOptionsLike>({
      vapidDetails: { subject: VAPID.subject, publicKey: VAPID.vapidPublicKey, privateKey: VAPID.vapidPrivateKey },
      timeout: 10_000,
    })
  })

  it('inclui `url` no payload quando `data.url` está presente na mensagem', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => okResult())
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    await sender.send({ ...message, data: { url: '/apostas/123' } })

    const [, payload] = sendNotification.mock.calls[0]!
    expect(JSON.parse(payload as string)).toEqual({
      title: message.title,
      body: message.body,
      url: '/apostas/123',
    })
  })

  it('omite `url` do payload quando `data.url` não é string', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => okResult())
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    await sender.send({ ...message, data: { url: 123 } })

    const [, payload] = sendNotification.mock.calls[0]!
    expect(JSON.parse(payload as string)).toEqual({ title: message.title, body: message.body })
  })

  it('repassa `timeoutMs` customizado como `options.timeout`', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => okResult())
    const sender = new WebPushSender({ ...VAPID, timeoutMs: 5_000, webpushImpl: { sendNotification } })

    await sender.send(message)

    const [, , options] = sendNotification.mock.calls[0]!
    expect(options.timeout).toBe(5_000)
  })
})

describe('WebPushSender — erros', () => {
  it('HTTP 410 (subscription expirada) vira { ok: false, error: "gone:410", shouldDeleteSubscription: true }', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => {
      throw new WebPushErrorFake(410)
    })
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    const result = await sender.send(message)

    expect(result).toEqual({ ok: false, error: 'gone:410', shouldDeleteSubscription: true })
  })

  it('HTTP 404 (endpoint não encontrado) vira { ok: false, error: "gone:404", shouldDeleteSubscription: true }', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => {
      throw new WebPushErrorFake(404)
    })
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    const result = await sender.send(message)

    expect(result).toEqual({ ok: false, error: 'gone:404', shouldDeleteSubscription: true })
  })

  it('erro genérico (statusCode diferente de 404/410) vira { ok: false, error: <mensagem> }', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => {
      throw new WebPushErrorFake(500, 'upstream indisponível')
    })
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    const result = await sender.send(message)

    expect(result).toEqual({ ok: false, error: 'upstream indisponível' })
  })

  it('falha de rede (sem statusCode) vira { ok: false, error: <mensagem> } sem lançar', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => {
      throw new Error('ECONNRESET')
    })
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    const result = await sender.send(message)

    expect(result).toEqual({ ok: false, error: 'ECONNRESET' })
  })

  it('nunca lança — resolve mesmo quando a lib rejeita', async () => {
    const sendNotification = vi.fn<WebPushImplLike['sendNotification']>(async () => {
      throw new WebPushErrorFake(400, 'bad request')
    })
    const sender = new WebPushSender({ ...VAPID, webpushImpl: { sendNotification } })

    await expect(sender.send(message)).resolves.not.toThrow()
  })
})

describe('WebPushSender — construtor', () => {
  it('exige vapidPublicKey', () => {
    expect(() => new WebPushSender({ ...VAPID, vapidPublicKey: '' })).toThrow(/vapidPublicKey/)
  })

  it('exige vapidPrivateKey', () => {
    expect(() => new WebPushSender({ ...VAPID, vapidPrivateKey: '' })).toThrow(/vapidPrivateKey/)
  })

  it('exige subject', () => {
    expect(() => new WebPushSender({ ...VAPID, subject: '' })).toThrow(/subject/)
  })

  it('exige que subject comece com "mailto:" ou "https:"', () => {
    expect(() => new WebPushSender({ ...VAPID, subject: 'contato@lotopro.com.br' })).toThrow(/mailto:|https:/)
  })

  it('aceita subject "https:"', () => {
    expect(() => new WebPushSender({ ...VAPID, subject: 'https://lotopro.com.br' })).not.toThrow()
  })
})

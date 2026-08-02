import { describe, expect, it, vi } from 'vitest'
import { EmailSendError } from '../../src/notify/types'
import { ResendEmailSender, RESEND_API_URL, type ResendFetchLike, type ResendFetchResponseLike } from '../../src/notify/resend'

/** Nenhum teste desta suíte abre socket — `fetchImpl` é sempre injetado. */

function okResponse(body: unknown): ResendFetchResponseLike {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body }
}

function errorResponse(status: number, statusText: string, body: unknown = {}): ResendFetchResponseLike {
  return { ok: false, status, statusText, json: async () => body }
}

const message = { to: 'user@example.com', subject: 'Assunto', html: '<p>oi</p>', text: 'oi' }

describe('ResendEmailSender — caminho feliz', () => {
  it('faz POST em RESEND_API_URL com Authorization Bearer e devolve o providerId', async () => {
    const fetchImpl = vi.fn<ResendFetchLike>(async () => okResponse({ id: 'email_123' }))
    const sender = new ResendEmailSender({ apiKey: 'key_abc', from: 'LotoPro <no-reply@lotopro.com.br>', fetchImpl })

    const result = await sender.send(message)

    expect(result).toEqual({ providerId: 'email_123' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(RESEND_API_URL)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer key_abc')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      from: 'LotoPro <no-reply@lotopro.com.br>',
      to: ['user@example.com'],
      subject: 'Assunto',
      html: '<p>oi</p>',
      text: 'oi',
    })
  })

  it('usa `from` da mensagem quando informado, em vez do padrão do sender', async () => {
    const fetchImpl = vi.fn<ResendFetchLike>(async () => okResponse({ id: 'email_1' }))
    const sender = new ResendEmailSender({ apiKey: 'k', from: 'padrao@lotopro.com.br', fetchImpl })

    await sender.send({ ...message, from: 'outro@lotopro.com.br' })

    const [, init] = fetchImpl.mock.calls[0]!
    expect(JSON.parse(init.body).from).toBe('outro@lotopro.com.br')
  })
})

describe('ResendEmailSender — erros', () => {
  it('HTTP não-2xx vira EmailSendError com o detalhe do corpo', async () => {
    const fetchImpl = vi.fn<ResendFetchLike>(async () =>
      errorResponse(422, 'Unprocessable Entity', { name: 'validation_error', message: 'campo "to" inválido' }),
    )
    const sender = new ResendEmailSender({ apiKey: 'k', from: 'a@b.com', fetchImpl })

    await expect(sender.send(message)).rejects.toThrow(EmailSendError)
    await expect(sender.send(message)).rejects.toThrow(/422/)
    await expect(sender.send(message)).rejects.toThrow(/campo "to" inválido/)
  })

  it('resposta 2xx sem `id` vira EmailSendError', async () => {
    const fetchImpl = vi.fn<ResendFetchLike>(async () => okResponse({}))
    const sender = new ResendEmailSender({ apiKey: 'k', from: 'a@b.com', fetchImpl })

    await expect(sender.send(message)).rejects.toThrow(/sem `id`/)
  })

  it('timeout (signal abortado) vira EmailSendError', async () => {
    const fetchImpl = vi.fn<ResendFetchLike>(async (_url, init) => {
      return new Promise<ResendFetchResponseLike>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
          reject(err)
        })
      })
    })
    const sender = new ResendEmailSender({ apiKey: 'k', from: 'a@b.com', fetchImpl, timeoutMs: 5 })

    await expect(sender.send(message)).rejects.toThrow(EmailSendError)
    await expect(sender.send(message)).rejects.toThrow(/não respondeu em 5ms/)
  })

  it('falha de rede genérica vira EmailSendError com a causa preservada', async () => {
    const networkError = new Error('ECONNRESET')
    const fetchImpl = vi.fn<ResendFetchLike>(async () => {
      throw networkError
    })
    const sender = new ResendEmailSender({ apiKey: 'k', from: 'a@b.com', fetchImpl })

    try {
      await sender.send(message)
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(EmailSendError)
      expect((error as EmailSendError).cause).toBe(networkError)
    }
  })
})

describe('ResendEmailSender — construtor', () => {
  it('exige apiKey', () => {
    expect(() => new ResendEmailSender({ apiKey: '', from: 'a@b.com', fetchImpl: vi.fn() })).toThrow(/apiKey/)
  })

  it('exige from', () => {
    expect(() => new ResendEmailSender({ apiKey: 'k', from: '', fetchImpl: vi.fn() })).toThrow(/from/)
  })
})

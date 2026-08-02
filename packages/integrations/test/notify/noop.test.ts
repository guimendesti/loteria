import { describe, expect, it } from 'vitest'
import { NoopPushSender, PUSH_NOT_CONFIGURED_ERROR } from '../../src/notify/noop'

describe('NoopPushSender', () => {
  it('nunca lança — sempre devolve { ok: false, error } (ver decisão no cabeçalho de noop.ts)', async () => {
    const sender = new NoopPushSender()
    const result = await sender.send({
      subscription: { endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' },
      title: 'Título',
      body: 'Corpo',
    })
    expect(result).toEqual({ ok: false, error: PUSH_NOT_CONFIGURED_ERROR })
  })
})

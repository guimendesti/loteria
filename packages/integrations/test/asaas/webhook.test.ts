import { describe, expect, it } from 'vitest'
import {
  ASAAS_HANDLED_EVENTS,
  AsaasWebhookError,
  isHandledAsaasEvent,
  isValidWebhookToken,
  parseAsaasWebhook,
} from '../../src/asaas/webhook'
import { loadAsaasFixture } from './helpers'

describe('parseAsaasWebhook — payloads reais', () => {
  it('extrai id, evento, paymentId e subscriptionId de PAYMENT_CONFIRMED', () => {
    const body = loadAsaasFixture('webhook-payment-confirmed')
    const event = parseAsaasWebhook(body)

    expect(event.id).toBe('evt_05b708f961d739ea7eba7e4db318f621&368604920')
    expect(event.event).toBe('PAYMENT_CONFIRMED')
    expect(event.paymentId).toBe('pay_9822104477310021')
    expect(event.subscriptionId).toBe('sub_kd0eh0dgg4b0hlhx')
    // `raw` é o corpo original, intacto (auditoria / reprocessamento)
    expect(event.raw).toBe(body)
  })

  it('cobrança avulsa (sem assinatura) devolve subscriptionId null', () => {
    const event = parseAsaasWebhook(loadAsaasFixture('webhook-payment-overdue-avulso'))

    expect(event.event).toBe('PAYMENT_OVERDUE')
    expect(event.paymentId).toBe('pay_1122334455667788')
    expect(event.subscriptionId).toBeNull()
  })

  it('SUBSCRIPTION_DELETED traz `subscription` como objeto e nenhum payment', () => {
    const event = parseAsaasWebhook(loadAsaasFixture('webhook-subscription-deleted'))

    expect(event.event).toBe('SUBSCRIPTION_DELETED')
    expect(event.paymentId).toBeNull()
    expect(event.subscriptionId).toBe('sub_kd0eh0dgg4b0hlhx')
  })
})

describe('parseAsaasWebhook — tolerância', () => {
  it('aceita `subscription` como string em vez de objeto', () => {
    const event = parseAsaasWebhook({
      id: 'evt_1',
      event: 'SUBSCRIPTION_DELETED',
      subscription: 'sub_abc',
    })
    expect(event.subscriptionId).toBe('sub_abc')
  })

  it('aceita a forma achatada (paymentId/subscriptionId no topo)', () => {
    const event = parseAsaasWebhook({
      id: 'evt_2',
      event: 'PAYMENT_RECEIVED',
      paymentId: 'pay_flat',
      subscriptionId: 'sub_flat',
    })
    expect(event.paymentId).toBe('pay_flat')
    expect(event.subscriptionId).toBe('sub_flat')
  })

  it('aceita eventos que ainda não tratamos, sem quebrar', () => {
    const event = parseAsaasWebhook({
      id: 'evt_3',
      event: 'PAYMENT_ANTICIPATED',
      payment: { id: 'pay_x', subscription: 'sub_x' },
      campoNovoDoAsaas: { qualquer: 'coisa' },
    })
    expect(event.event).toBe('PAYMENT_ANTICIPATED')
    expect(isHandledAsaasEvent(event.event)).toBe(false)
    expect(event.paymentId).toBe('pay_x')
  })

  it('payment sem id não vira paymentId vazio', () => {
    const event = parseAsaasWebhook({
      id: 'evt_4',
      event: 'PAYMENT_UPDATED',
      payment: { object: 'payment', subscription: { id: 'sub_obj' } },
    })
    expect(event.paymentId).toBeNull()
    expect(event.subscriptionId).toBe('sub_obj')
  })
})

describe('parseAsaasWebhook — rejeições', () => {
  it.each<[string, unknown]>([
    ['sem id (idempotência impossível)', { event: 'PAYMENT_CONFIRMED' }],
    ['sem event', { id: 'evt_1' }],
    ['id vazio', { id: '', event: 'PAYMENT_CONFIRMED' }],
    ['corpo nulo', null],
    ['corpo string', '{"id":"evt_1"}'],
    ['array', []],
  ])('rejeita %s com AsaasWebhookError', (_label, body) => {
    expect(() => parseAsaasWebhook(body)).toThrow(AsaasWebhookError)
  })

  it('a mensagem aponta o campo problemático', () => {
    expect(() => parseAsaasWebhook({ event: 'PAYMENT_CONFIRMED' })).toThrow(/id/)
  })
})

describe('ASAAS_HANDLED_EVENTS', () => {
  it('cobre exatamente os eventos que o billing trata', () => {
    expect([...ASAAS_HANDLED_EVENTS]).toEqual([
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'PAYMENT_REFUNDED',
      'SUBSCRIPTION_DELETED',
    ])
    for (const event of ASAAS_HANDLED_EVENTS) expect(isHandledAsaasEvent(event)).toBe(true)
  })
})

describe('isValidWebhookToken — comparação em tempo constante', () => {
  const expected = 'wht_5b3a9f21c8e04d6fa7b2c1d0e9f8a7b6'

  it('aceita o token idêntico', () => {
    expect(isValidWebhookToken(expected, expected)).toBe(true)
  })

  it('recusa token diferente do mesmo tamanho', () => {
    const almost = `${expected.slice(0, -1)}7`
    expect(almost).toHaveLength(expected.length)
    expect(isValidWebhookToken(almost, expected)).toBe(false)
  })

  it('recusa tokens de tamanhos diferentes SEM lançar (timingSafeEqual lançaria)', () => {
    expect(() => isValidWebhookToken('curto', expected)).not.toThrow()
    expect(isValidWebhookToken('curto', expected)).toBe(false)
    expect(isValidWebhookToken(`${expected}extra`, expected)).toBe(false)
    // prefixo correto também não passa
    expect(isValidWebhookToken(expected.slice(0, 8), expected)).toBe(false)
  })

  it('recusa header ausente (null) e vazio', () => {
    expect(isValidWebhookToken(null, expected)).toBe(false)
    expect(isValidWebhookToken('', expected)).toBe(false)
  })

  it('recusa quando o segredo esperado não está configurado', () => {
    expect(isValidWebhookToken('qualquer', '')).toBe(false)
    expect(isValidWebhookToken('', '')).toBe(false)
    expect(isValidWebhookToken(null, '')).toBe(false)
  })

  it('compara bytes, não caracteres (unicode e case)', () => {
    expect(isValidWebhookToken('töken-çom-acento', 'töken-çom-acento')).toBe(true)
    expect(isValidWebhookToken('token', 'TOKEN')).toBe(false)
    expect(isValidWebhookToken(' token', 'token')).toBe(false)
  })
})

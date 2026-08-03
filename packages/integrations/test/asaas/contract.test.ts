/**
 * Trava do contrato público de `src/asaas/index.ts`.
 *
 * O handler de billing (`apps/web/.../webhooks/asaas` e routers) foi escrito contra
 * exatamente estes nomes e estas assinaturas, em paralelo a este módulo. Se algum export
 * sumir ou mudar de forma, é aqui que quebra — antes de quebrar lá.
 */
import { describe, expect, it, vi } from 'vitest'
import * as asaas from '../../src/asaas'
import type {
  AsaasConfig,
  AsaasPayment,
  AsaasSubscription,
  AsaasWebhookEvent,
  FetchLike,
} from '../../src/asaas'
import { loadAsaasFixture, okResponse } from './helpers'

describe('superfície pública de src/asaas', () => {
  it('exporta tudo que o billing consome', () => {
    for (const name of [
      'AsaasClient',
      'AsaasApiError',
      'AsaasWebhookError',
      'parseAsaasWebhook',
      'isValidWebhookToken',
      'centsToReais',
      'reaisToCents',
      'ASAAS_SANDBOX_BASE_URL',
      'ASAAS_PRODUCTION_BASE_URL',
      'ASAAS_HANDLED_EVENTS',
    ] as const) {
      expect(asaas).toHaveProperty(name)
    }
  })

  it('AsaasApiError e AsaasWebhookError são Error com os campos do contrato', () => {
    const apiError = new asaas.AsaasApiError('falhou', 422, { errors: [] })
    expect(apiError).toBeInstanceOf(Error)
    expect(apiError.status).toBe(422)
    expect(apiError.body).toEqual({ errors: [] })
    expect(new asaas.AsaasWebhookError('inválido')).toBeInstanceOf(Error)
  })

  it('o fluxo de assinatura roda ponta a ponta com fetch falso', async () => {
    // `FetchLike` é o alias do contrato para o fetch injetável deste módulo.
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.includes('/customers')) return okResponse(loadAsaasFixture('customer'))
      if (url.includes('/payments?')) return okResponse(loadAsaasFixture('subscription-payments-page2'))
      if (url.includes('/payments/')) return okResponse(loadAsaasFixture('payment-confirmed'))
      return okResponse(loadAsaasFixture('subscription'))
    })

    const config: AsaasConfig = { apiKey: 'k', fetchImpl }
    const client = new asaas.AsaasClient(config)

    const customer: { id: string } = await client.createCustomer({ name: 'G', email: 'g@x.com' })
    const created: { id: string; status: string } = await client.createSubscription({
      customerId: customer.id,
      billingType: 'PIX',
      valueCents: 2490n,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      externalReference: 'sub_ckz1a2b3c4d5',
    })
    const updated: { id: string; status: string } = await client.updateSubscription(created.id, {
      valueCents: 4990n,
      billingType: 'CREDIT_CARD',
    })
    const subscription: AsaasSubscription = await client.getSubscription(updated.id)
    const payment: AsaasPayment = await client.getPayment('pay_9822104477310021')
    const payments: AsaasPayment[] = await client.listPaymentsBySubscription(subscription.id)

    expect(customer.id).toBe('cus_000006254476')
    expect(created.status).toBe('ACTIVE')
    expect(subscription.value).toBe(24.9)
    expect(payment.valueCents).toBe(2490n)
    expect(payments).toHaveLength(1)
  })

  it('webhook: parse + validação de token compõem o handler idempotente (SY-13)', () => {
    const body = loadAsaasFixture('webhook-payment-confirmed')
    const event: AsaasWebhookEvent = asaas.parseAsaasWebhook(body)

    expect(asaas.isValidWebhookToken('segredo', 'segredo')).toBe(true)
    expect(asaas.isValidWebhookToken(null, 'segredo')).toBe(false)
    expect(event.id).toContain('evt_')
    expect(asaas.isHandledAsaasEvent(event.event)).toBe(true)
  })
})

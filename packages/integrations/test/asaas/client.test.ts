import { describe, expect, it, vi } from 'vitest'
import { AsaasClient, type AsaasConfig } from '../../src/asaas/client'
import {
  ASAAS_SANDBOX_BASE_URL,
  ASAAS_USER_AGENT,
  AsaasApiError,
  AsaasNetworkError,
  AsaasTimeoutError,
  type AsaasFetchLike,
  type AsaasFetchResponseLike,
} from '../../src/asaas/http'
import { errorResponse, loadAsaasFixture, noSleep, nonJsonResponse, okResponse, parseBody } from './helpers'

/** Nenhum teste desta suíte abre socket — `fetchImpl` é sempre injetado. */

const API_KEY = '$aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZm'

function clientWith(fetchImpl: AsaasFetchLike, overrides: Partial<AsaasConfig> = {}): AsaasClient {
  return new AsaasClient({ apiKey: API_KEY, fetchImpl, sleep: noSleep, ...overrides })
}

// ─── Autenticação e transporte ───────────────────────────────────────────────

describe('AsaasClient — requisição', () => {
  it('autentica com o header `access_token` (não Bearer) e pede JSON', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('customer')))
    await clientWith(fetchImpl).createCustomer({ name: 'Guilherme', email: 'g@example.com' })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ASAAS_SANDBOX_BASE_URL}/customers`)
    expect(init.headers.access_token).toBe(API_KEY)
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.headers.Accept).toBe('application/json')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['User-Agent']).toBe(ASAAS_USER_AGENT)
  })

  it('usa a sandbox por padrão e respeita baseUrl customizada (sem barra dupla)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))
    const client = clientWith(fetchImpl, { baseUrl: 'https://api.asaas.com/v3/' })

    await client.getSubscription('sub_kd0eh0dgg4b0hlhx')

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.asaas.com/v3/subscriptions/sub_kd0eh0dgg4b0hlhx')
  })

  it('exige apiKey', () => {
    expect(() => new AsaasClient({ apiKey: '', fetchImpl: vi.fn() })).toThrow(/apiKey/)
  })

  it('GET não manda corpo nem Content-Type', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('payment-pending')))
    await clientWith(fetchImpl).getPayment('pay_3611397460121854')

    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })
})

// ─── createCustomer ──────────────────────────────────────────────────────────

describe('AsaasClient.createCustomer', () => {
  it('faz POST /customers e devolve o id', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('customer')))

    const result = await clientWith(fetchImpl).createCustomer({
      name: 'Guilherme Souza',
      email: 'guilherme@example.com',
      cpfCnpj: '24971563792',
      externalReference: 'usr_ckz0a1b2c3d4',
    })

    expect(result).toEqual({ id: 'cus_000006254476' })
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(parseBody(init)).toEqual({
      name: 'Guilherme Souza',
      email: 'guilherme@example.com',
      cpfCnpj: '24971563792',
      externalReference: 'usr_ckz0a1b2c3d4',
    })
  })

  it('omite campos opcionais ausentes em vez de mandar null', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('customer')))
    await clientWith(fetchImpl).createCustomer({ name: 'Guilherme', email: 'g@example.com' })

    expect(parseBody(fetchImpl.mock.calls[0]![1])).toEqual({
      name: 'Guilherme',
      email: 'g@example.com',
    })
  })

  it('rejeita nome/email vazios antes de chamar a API', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>()
    const client = clientWith(fetchImpl)

    await expect(client.createCustomer({ name: '', email: 'g@example.com' })).rejects.toThrow(TypeError)
    await expect(client.createCustomer({ name: 'G', email: '  ' })).rejects.toThrow(/email/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ─── createSubscription ──────────────────────────────────────────────────────

describe('AsaasClient.createSubscription', () => {
  it('converte centavos → reais decimais no corpo (2490n → 24.9)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))

    const result = await clientWith(fetchImpl).createSubscription({
      customerId: 'cus_000006254476',
      billingType: 'PIX',
      valueCents: 2490n,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      description: 'LotoPro Premium — mensal',
      externalReference: 'sub_ckz1a2b3c4d5',
    })

    expect(result).toEqual({ id: 'sub_kd0eh0dgg4b0hlhx', status: 'ACTIVE' })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ASAAS_SANDBOX_BASE_URL}/subscriptions`)
    expect(init.method).toBe('POST')
    expect(parseBody(init)).toEqual({
      customer: 'cus_000006254476',
      billingType: 'PIX',
      value: 24.9,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      description: 'LotoPro Premium — mensal',
      externalReference: 'sub_ckz1a2b3c4d5',
    })
    // o JSON literal não pode conter lixo binário de float
    expect(init.body).toContain('"value":24.9')
  })

  it.each([
    [1n, 0.01],
    [2366n, 23.66],
    [24900n, 249],
    [100n, 1],
  ])('serializa %s centavos como %s reais', async (valueCents, expectedValue) => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))

    await clientWith(fetchImpl).createSubscription({
      customerId: 'cus_1',
      billingType: 'PIX',
      valueCents,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      externalReference: 'sub_1',
    })

    expect(parseBody(fetchImpl.mock.calls[0]![1]).value).toBe(expectedValue)
  })

  it('omite `description` quando não informada', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))
    await clientWith(fetchImpl).createSubscription({
      customerId: 'cus_1',
      billingType: 'BOLETO',
      valueCents: 24900n,
      nextDueDate: '2027-01-15',
      cycle: 'YEARLY',
      externalReference: 'sub_1',
    })

    expect(parseBody(fetchImpl.mock.calls[0]![1])).not.toHaveProperty('description')
  })

  it('valida os argumentos antes de gastar uma chamada', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>()
    const client = clientWith(fetchImpl)
    const base = {
      customerId: 'cus_1',
      billingType: 'PIX',
      valueCents: 2490n,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      externalReference: 'sub_1',
    } as const

    await expect(client.createSubscription({ ...base, customerId: '' })).rejects.toThrow(/customerId/)
    await expect(client.createSubscription({ ...base, externalReference: '' })).rejects.toThrow(
      /externalReference/,
    )
    await expect(client.createSubscription({ ...base, valueCents: 0n })).rejects.toThrow(/maior que zero/)
    await expect(client.createSubscription({ ...base, valueCents: -100n })).rejects.toThrow(/maior que zero/)
    await expect(client.createSubscription({ ...base, nextDueDate: '02/09/2026' })).rejects.toThrow(
      /YYYY-MM-DD/,
    )
    await expect(client.createSubscription({ ...base, nextDueDate: '2026-02-31' })).rejects.toThrow(
      /não é uma data válida/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ─── updateSubscription / cancelSubscription ─────────────────────────────────

describe('AsaasClient.updateSubscription', () => {
  it('faz PUT só com os campos informados', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      okResponse({ ...(loadAsaasFixture('subscription') as object), value: 49.9 }),
    )

    const result = await clientWith(fetchImpl).updateSubscription('sub_kd0eh0dgg4b0hlhx', {
      valueCents: 4990n,
    })

    expect(result).toEqual({ id: 'sub_kd0eh0dgg4b0hlhx', status: 'ACTIVE' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ASAAS_SANDBOX_BASE_URL}/subscriptions/sub_kd0eh0dgg4b0hlhx`)
    expect(init.method).toBe('PUT')
    expect(parseBody(init)).toEqual({ value: 49.9 })
  })

  it('permite trocar só o meio de pagamento', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))
    await clientWith(fetchImpl).updateSubscription('sub_1', { billingType: 'CREDIT_CARD' })

    expect(parseBody(fetchImpl.mock.calls[0]![1])).toEqual({ billingType: 'CREDIT_CARD' })
  })

  it('recusa update vazio (bug do chamador, não requisição inútil)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>()
    await expect(clientWith(fetchImpl).updateSubscription('sub_1', {})).rejects.toThrow(TypeError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('AsaasClient.cancelSubscription', () => {
  it('faz DELETE e devolve `deleted`', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      okResponse({ deleted: true, id: 'sub_kd0eh0dgg4b0hlhx' }),
    )

    const result = await clientWith(fetchImpl).cancelSubscription('sub_kd0eh0dgg4b0hlhx')

    expect(result).toEqual({ deleted: true })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ASAAS_SANDBOX_BASE_URL}/subscriptions/sub_kd0eh0dgg4b0hlhx`)
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})

// ─── Leituras ────────────────────────────────────────────────────────────────

describe('AsaasClient.getSubscription', () => {
  it('normaliza o payload real', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('subscription')))

    const subscription = await clientWith(fetchImpl).getSubscription('sub_kd0eh0dgg4b0hlhx')

    expect(subscription).toEqual({
      id: 'sub_kd0eh0dgg4b0hlhx',
      customer: 'cus_000006254476',
      status: 'ACTIVE',
      value: 24.9,
      nextDueDate: '2026-09-02',
      cycle: 'MONTHLY',
      billingType: 'PIX',
      externalReference: 'sub_ckz1a2b3c4d5',
    })
  })

  it('nextDueDate/externalReference ausentes viram null', async () => {
    const raw = loadAsaasFixture('subscription') as Record<string, unknown>
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      okResponse({ ...raw, nextDueDate: null, externalReference: null, status: 'EXPIRED' }),
    )

    const subscription = await clientWith(fetchImpl).getSubscription('sub_1')

    expect(subscription.nextDueDate).toBeNull()
    expect(subscription.externalReference).toBeNull()
    expect(subscription.status).toBe('EXPIRED')
  })
})

describe('AsaasClient.getPayment', () => {
  it('converte `value` para centavos (bigint) e normaliza os nulos', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('payment-pending')))

    const payment = await clientWith(fetchImpl).getPayment('pay_3611397460121854')

    expect(payment).toEqual({
      id: 'pay_3611397460121854',
      subscription: 'sub_kd0eh0dgg4b0hlhx',
      customer: 'cus_000006254476',
      status: 'PENDING',
      valueCents: 2490n,
      dueDate: '2026-09-02',
      paymentDate: null,
      billingType: 'PIX',
      invoiceUrl: 'https://sandbox.asaas.com/i/3611397460121854',
      externalReference: 'inv_ckz9x8y7w6v5',
    })
    expect(typeof payment.valueCents).toBe('bigint')
  })

  it('usa clientPaymentDate quando paymentDate ainda não veio (CONFIRMED)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse(loadAsaasFixture('payment-confirmed')))

    const payment = await clientWith(fetchImpl).getPayment('pay_9822104477310021')

    expect(payment.status).toBe('CONFIRMED')
    expect(payment.paymentDate).toBe('2026-09-02')
    expect(payment.billingType).toBe('CREDIT_CARD')
    expect(payment.valueCents).toBe(2490n)
  })
})

describe('AsaasClient.listPaymentsBySubscription', () => {
  it('pagina até o fim e devolve todas as cobranças convertidas', async () => {
    const fetchImpl = vi
      .fn<AsaasFetchLike>()
      .mockResolvedValueOnce(okResponse(loadAsaasFixture('subscription-payments-page1')))
      .mockResolvedValueOnce(okResponse(loadAsaasFixture('subscription-payments-page2')))

    const payments = await clientWith(fetchImpl).listPaymentsBySubscription('sub_kd0eh0dgg4b0hlhx')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      `${ASAAS_SANDBOX_BASE_URL}/subscriptions/sub_kd0eh0dgg4b0hlhx/payments?limit=100&offset=0`,
    )
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      `${ASAAS_SANDBOX_BASE_URL}/subscriptions/sub_kd0eh0dgg4b0hlhx/payments?limit=100&offset=2`,
    )

    expect(payments.map((payment) => payment.id)).toEqual([
      'pay_5500110022003300',
      'pay_5500110022003301',
      'pay_5500110022003302',
    ])
    expect(payments.map((payment) => payment.valueCents)).toEqual([2366n, 2366n, 24900n])
    expect(payments.map((payment) => payment.status)).toEqual(['RECEIVED', 'OVERDUE', 'RECEIVED'])
    expect(payments[1]!.paymentDate).toBeNull()
    expect(payments[0]!.externalReference).toBeNull()
  })

  it('para na primeira página quando hasMore é false', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      okResponse(loadAsaasFixture('subscription-payments-page2')),
    )

    const payments = await clientWith(fetchImpl).listPaymentsBySubscription('sub_1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(payments).toHaveLength(1)
  })

  it('não entra em loop se o Asaas disser hasMore com data vazia', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      okResponse({ object: 'list', hasMore: true, totalCount: 0, data: [] }),
    )

    const payments = await clientWith(fetchImpl).listPaymentsBySubscription('sub_1')

    expect(payments).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

// ─── Erros ───────────────────────────────────────────────────────────────────

describe('AsaasClient — erros HTTP', () => {
  it('400 vira AsaasApiError com status, corpo e descrições do Asaas', async () => {
    const body = loadAsaasFixture('error-400')
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => errorResponse(400, 'Bad Request', body))

    try {
      await clientWith(fetchImpl).createSubscription({
        customerId: 'cus_1',
        billingType: 'PIX',
        valueCents: 100n,
        nextDueDate: '2020-01-01',
        cycle: 'MONTHLY',
        externalReference: 'sub_1',
      })
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(AsaasApiError)
      const apiError = error as AsaasApiError
      expect(apiError.status).toBe(400)
      expect(apiError.body).toEqual(body)
      expect(apiError.message).toContain('invalid_value')
      expect(apiError.message).toContain('maior ou igual a R$ 5,00')
      expect(apiError.message).toContain('data da próxima cobrança')
    }
  })

  it('401 (chave inválida) não é retentado e não vaza a apiKey na mensagem', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () =>
      errorResponse(401, 'Unauthorized', {
        errors: [{ code: 'invalid_action', description: 'Chave de API inválida.' }],
      }),
    )

    try {
      await clientWith(fetchImpl).getSubscription('sub_1')
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect((error as AsaasApiError).status).toBe(401)
      expect((error as Error).message).toContain('Chave de API inválida.')
      expect((error as Error).message).not.toContain(API_KEY)
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('erro sem corpo JSON usa o statusText', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => nonJsonResponse(502, 'Bad Gateway'))
    const client = clientWith(fetchImpl, { retryDelaysMs: [] })

    await expect(client.getSubscription('sub_1')).rejects.toThrow(/502/)
    await expect(client.getSubscription('sub_1')).rejects.toThrow(/Bad Gateway/)
  })

  it('resposta 2xx fora do schema vira AsaasApiError (não passa lixo para o domínio)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => okResponse({ object: 'payment', id: 'pay_1' }))

    await expect(clientWith(fetchImpl).getPayment('pay_1')).rejects.toThrow(AsaasApiError)
    await expect(clientWith(fetchImpl).getPayment('pay_1')).rejects.toThrow(/fora do schema/)
  })

  it('timeout vira AsaasTimeoutError (subclasse de AsaasApiError, status 0)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(
      async (_url, init) =>
        new Promise<AsaasFetchResponseLike>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )
    const client = clientWith(fetchImpl, { timeoutMs: 5, retryDelaysMs: [] })

    try {
      await client.getPayment('pay_1')
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(AsaasTimeoutError)
      expect(error).toBeInstanceOf(AsaasApiError)
      expect((error as AsaasApiError).status).toBe(0)
      expect((error as Error).message).toMatch(/não respondeu em 5ms/)
    }
  })

  it('falha de rede vira AsaasNetworkError com a causa preservada', async () => {
    const networkError = new Error('ECONNRESET')
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => {
      throw networkError
    })
    const client = clientWith(fetchImpl, { retryDelaysMs: [] })

    try {
      await client.createCustomer({ name: 'G', email: 'g@example.com' })
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(AsaasNetworkError)
      expect((error as AsaasApiError).status).toBe(0)
      expect((error as Error).cause).toBe(networkError)
    }
  })
})

// ─── Retry ───────────────────────────────────────────────────────────────────

describe('AsaasClient — política de retry', () => {
  it('GET retenta até 3x em 500 e devolve o sucesso', async () => {
    const fetchImpl = vi
      .fn<AsaasFetchLike>()
      .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(okResponse(loadAsaasFixture('payment-pending')))

    const payment = await clientWith(fetchImpl).getPayment('pay_3611397460121854')

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(payment.id).toBe('pay_3611397460121854')
  })

  it('GET respeita o backoff exponencial configurado', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => errorResponse(429, 'Too Many Requests'))

    await expect(
      clientWith(fetchImpl, { sleep, retryDelaysMs: [500, 2_000, 8_000] }).getSubscription('sub_1'),
    ).rejects.toThrow(AsaasApiError)

    expect(fetchImpl).toHaveBeenCalledTimes(4) // 1 tentativa + 3 retries
    expect(sleep.mock.calls.flat()).toEqual([500, 2_000, 8_000])
  })

  it('GET não retenta em 404 (não é transitório)', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => errorResponse(404, 'Not Found'))

    await expect(clientWith(fetchImpl).getPayment('pay_inexistente')).rejects.toThrow(AsaasApiError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  /**
   * O ponto mais importante desta suíte: um POST retentado após timeout criaria uma
   * SEGUNDA assinatura para o mesmo usuário — o Asaas não tem idempotency key.
   */
  it('POST NUNCA é retentado, nem em 500', async () => {
    const fetchImpl = vi.fn<AsaasFetchLike>(async () => errorResponse(500, 'Internal Server Error'))

    await expect(
      clientWith(fetchImpl).createSubscription({
        customerId: 'cus_1',
        billingType: 'PIX',
        valueCents: 2490n,
        nextDueDate: '2026-09-02',
        cycle: 'MONTHLY',
        externalReference: 'sub_1',
      }),
    ).rejects.toThrow(AsaasApiError)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('PUT e DELETE também não são retentados', async () => {
    const putFetch = vi.fn<AsaasFetchLike>(async () => errorResponse(503, 'Service Unavailable'))
    await expect(
      clientWith(putFetch).updateSubscription('sub_1', { valueCents: 2490n }),
    ).rejects.toThrow(AsaasApiError)
    expect(putFetch).toHaveBeenCalledTimes(1)

    const deleteFetch = vi.fn<AsaasFetchLike>(async () => errorResponse(503, 'Service Unavailable'))
    await expect(clientWith(deleteFetch).cancelSubscription('sub_1')).rejects.toThrow(AsaasApiError)
    expect(deleteFetch).toHaveBeenCalledTimes(1)
  })
})

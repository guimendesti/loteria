import { describe, expect, it, vi } from 'vitest'

import { CaixaParseError } from '../src/caixa/parse'
import {
  CAIXA_SLUG_PATH,
  CaixaHttpError,
  CaixaNotFoundError,
  CaixaOfficialProvider,
  CaixaTimeoutError,
  CaixaTlsError,
  describeTlsFailure,
  isRetryableError,
  type FetchLike,
  type FetchResponseLike,
} from '../src/caixa/provider'
import { loadFixture } from './load-fixture'

/**
 * Nenhum teste desta suíte abre socket: `fetchImpl` e `sleep` são injetados.
 * Ver `src/caixa/smoke.ts` para a checagem manual contra a API real.
 */

const megasena = loadFixture('megasena-3038')

function okResponse(body: unknown): FetchResponseLike {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  }
}

function errorResponse(status: number, statusText = 'Erro'): FetchResponseLike {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  }
}

/** Erro de TLS como o `fetch` do Node o entrega: embrulhado em `cause`. */
function tlsFailure(): Error {
  const inner = Object.assign(
    new Error('write EPROTO 8158:error:0A000152:SSL routines:final_renegotiate:unsafe legacy'),
    { code: 'EPROTO' },
  )
  return Object.assign(new TypeError('fetch failed'), { cause: inner })
}

const noSleep = async (): Promise<void> => {}

describe('CaixaOfficialProvider — caminho feliz', () => {
  it('monta a URL de fetchLatest com barra final e devolve ContestResult', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    const result = await provider.fetchLatest('megasena')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/',
    )
    expect(result.contestNumber).toBe(3038)
    expect(result.collectedCents).toBe(6660390600n)
  })

  it('envia User-Agent de navegador', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    await new CaixaOfficialProvider({ fetchImpl, sleep: noSleep }).fetchLatest('megasena')

    const headers = fetchImpl.mock.calls[0]?.[1].headers ?? {}
    expect(headers['User-Agent']).toMatch(/Mozilla\/5\.0/)
    expect(headers['User-Agent']).toMatch(/Chrome/)
    expect(headers['Accept']).toContain('application/json')
  })

  it('monta a URL de fetchByNumber', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await provider.fetchByNumber('megasena', 3038)

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/3038',
    )
  })

  it('respeita baseUrl customizada (mirror self-hospedado)', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    const provider = new CaixaOfficialProvider({
      fetchImpl,
      sleep: noSleep,
      baseUrl: 'https://mirror.interno/api/',
      name: 'mirror',
    })

    await provider.fetchLatest('quina')

    expect(provider.name).toBe('mirror')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://mirror.interno/api/quina/')
  })

  it('mapeia todas as 11 modalidades do contrato', () => {
    expect(Object.keys(CAIXA_SLUG_PATH).sort()).toEqual(
      [
        'diadesorte',
        'duplasena',
        'federal',
        'loteca',
        'lotofacil',
        'lotomania',
        'maismilionaria',
        'megasena',
        'quina',
        'supersete',
        'timemania',
      ].sort(),
    )
  })
})

describe('CaixaOfficialProvider — retry e backoff', () => {
  it('retenta erros 5xx e devolve o resultado da tentativa bem-sucedida', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(okResponse(megasena))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})

    const provider = new CaixaOfficialProvider({ fetchImpl, sleep })
    const result = await provider.fetchLatest('megasena')

    expect(result.contestNumber).toBe(3038)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    // Backoff exponencial documentado: 500ms, 2s, 8s.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 2000])
  })

  it('esgota as 3 retentativas e relança o último erro', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => errorResponse(502, 'Bad Gateway'))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})

    const provider = new CaixaOfficialProvider({ fetchImpl, sleep })

    await expect(provider.fetchLatest('megasena')).rejects.toBeInstanceOf(CaixaHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(4) // 1 tentativa + 3 retentativas
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 2000, 8000])
  })

  it('retenta 429 (rate limit não documentado da Caixa)', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(errorResponse(429, 'Too Many Requests'))
      .mockResolvedValueOnce(okResponse(megasena))

    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })
    await provider.fetchLatest('megasena')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('NÃO retenta 404 — concurso inexistente não vira transitório', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => errorResponse(404, 'Not Found'))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await expect(provider.fetchByNumber('megasena', 99999)).rejects.toBeInstanceOf(
      CaixaNotFoundError,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('permite desligar o retry', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => errorResponse(500))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep, retryDelaysMs: [] })

    await expect(provider.fetchLatest('quina')).rejects.toBeInstanceOf(CaixaHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('CaixaOfficialProvider — TLS', () => {
  it('reconhece falhas de handshake na cadeia de causas', () => {
    expect(describeTlsFailure(tlsFailure())).toContain('EPROTO')
    expect(
      describeTlsFailure(new Error('unable to verify the first certificate')),
    ).toBeTruthy()
    expect(describeTlsFailure(new Error('socket hang up'))).toBeNull()
    expect(describeTlsFailure(null)).toBeNull()
  })

  it('relança como CaixaTlsError explicando o problema conhecido', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw tlsFailure()
    })
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    const error = await provider.fetchLatest('megasena').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CaixaTlsError)
    expect((error as CaixaTlsError).message).toContain('01-pesquisa-de-mercado.md')
    expect((error as CaixaTlsError).message).toContain('https.Agent')
    expect((error as CaixaTlsError).detail).toContain('EPROTO')
    expect((error as CaixaTlsError).cause).toBeDefined()
  })

  it('não retenta falha de TLS — não é transitória', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw tlsFailure()
    })
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await expect(provider.fetchLatest('megasena')).rejects.toBeInstanceOf(CaixaTlsError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(isRetryableError(new CaixaTlsError('x', 'y'))).toBe(false)
  })
})

describe('CaixaOfficialProvider — timeout', () => {
  it('aborta a requisição e lança CaixaTimeoutError', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
      })

    const provider = new CaixaOfficialProvider({
      fetchImpl,
      sleep: noSleep,
      timeoutMs: 20,
      retryDelaysMs: [],
    })

    const error = await provider.fetchLatest('megasena').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CaixaTimeoutError)
    expect((error as CaixaTimeoutError).timeoutMs).toBe(20)
  })

  it('timeout é retentável', () => {
    expect(isRetryableError(new CaixaTimeoutError(10_000, 'http://x'))).toBe(true)
  })
})

describe('CaixaOfficialProvider — coerência do payload', () => {
  it('rejeita concurso diferente do pedido (a API devolve o último quando não existe)', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await expect(provider.fetchByNumber('megasena', 1)).rejects.toBeInstanceOf(CaixaParseError)
  })

  it('lança CaixaParseError (não retentável) quando o schema diverge', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse({ mensagem: 'servico indisponivel' }))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await expect(provider.fetchLatest('megasena')).rejects.toBeInstanceOf(CaixaParseError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejeita número de concurso inválido antes de chamar a rede', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => okResponse(megasena))
    const provider = new CaixaOfficialProvider({ fetchImpl, sleep: noSleep })

    await expect(provider.fetchByNumber('megasena', 0)).rejects.toBeInstanceOf(TypeError)
    await expect(provider.fetchByNumber('megasena', 1.5)).rejects.toBeInstanceOf(TypeError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

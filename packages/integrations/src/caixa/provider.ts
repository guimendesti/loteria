/**
 * Provider oficial da Caixa.
 *
 * Contrato definido em docs/06-arquitetura-tecnica.md §6.6. Riscos tratados aqui
 * (docs/01-pesquisa-de-mercado.md §1.3): TLS não-padrão, ausência de SLA, rate limit
 * não documentado, timeout.
 *
 * Usa o `fetch` nativo do Node 20 (undici). Nenhuma dependência de runtime além do Zod
 * usado em `schema.ts`.
 */

import type { ContestResult, LotterySlug } from '@lotopro/core'
import { parseCaixaPayload, CaixaParseError } from './parse'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Abstração exigida pelo doc 01 §1.3 ("abstrair atrás de uma interface") para que a
 * troca de fonte de dados não vaze para o domínio.
 */
export interface LotteryResultProvider {
  /** Identificador estável, usado em log e no circuit breaker. */
  readonly name: string
  fetchLatest(slug: LotterySlug): Promise<ContestResult>
  fetchByNumber(slug: LotterySlug, contestNumber: number): Promise<ContestResult>
}

// ─── Erros ───────────────────────────────────────────────────────────────────

export class CaixaHttpError extends Error {
  readonly status: number
  constructor(status: number, statusText: string, url: string) {
    super(`Caixa respondeu HTTP ${status} ${statusText} em ${url}`)
    this.name = 'CaixaHttpError'
    this.status = status
  }
}

export class CaixaNotFoundError extends CaixaHttpError {
  constructor(status: number, statusText: string, url: string) {
    super(status, statusText, url)
    this.name = 'CaixaNotFoundError'
  }
}

export class CaixaTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(timeoutMs: number, url: string, options?: { cause?: unknown }) {
    super(`Caixa não respondeu em ${timeoutMs}ms: ${url}`, options)
    this.name = 'CaixaTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export class CaixaNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CaixaNetworkError'
  }
}

/**
 * Falha de handshake TLS com `servicebus2.caixa.gov.br`.
 *
 * Risco conhecido e documentado (doc 01 §1.3): o servidor da Caixa rejeita handshakes de
 * vários clientes HTTP modernos — `curl` devolve erro 35 em Windows/Git Bash. Não é um
 * erro transitório: **não adianta retentar**, é incompatibilidade de configuração TLS.
 *
 * Mitigação: usar `https.Agent` explícito (TLSv1.2, ciphers legados, cadeia de CA
 * conferida) ou cair para um provider de fallback. Ver doc 06 §6.6.
 */
export class CaixaTlsError extends Error {
  readonly url: string
  readonly detail: string
  constructor(detail: string, url: string, options?: { cause?: unknown }) {
    super(
      `Falha de TLS ao falar com a API da Caixa (${url}): ${detail}. ` +
        'Risco conhecido — docs/01-pesquisa-de-mercado.md §1.3: o servidor da Caixa ' +
        'rejeita o handshake de vários clientes HTTP modernos. Configure um https.Agent ' +
        'explícito (TLSv1.2 + ciphers legados) ou use um provider de fallback. ' +
        'Retentar não resolve.',
      options,
    )
    this.name = 'CaixaTlsError'
    this.url = url
    this.detail = detail
  }
}

// ─── Mapa de modalidade → path da API ────────────────────────────────────────

/**
 * Slug canônico do domínio → segmento de path da API da Caixa.
 * Hoje são idênticos, mas o mapa é explícito para que uma renomeação na API não exija
 * mexer no domínio (e para que `Record<LotterySlug, string>` force a cobertura de todas
 * as modalidades em tempo de compilação).
 */
export const CAIXA_SLUG_PATH: Record<LotterySlug, string> = {
  megasena: 'megasena',
  lotofacil: 'lotofacil',
  quina: 'quina',
  lotomania: 'lotomania',
  duplasena: 'duplasena',
  timemania: 'timemania',
  diadesorte: 'diadesorte',
  supersete: 'supersete',
  maismilionaria: 'maismilionaria',
  loteca: 'loteca',
  federal: 'federal',
}

export const CAIXA_BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api'

/**
 * User-Agent de navegador. A API é interna do portal e discrimina clientes; um UA de
 * biblioteca aumenta a chance de bloqueio.
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36'

/** Backoff exponencial: 3 retentativas após a tentativa inicial (doc 06 §6.6). */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 2_000, 8_000]

export const DEFAULT_TIMEOUT_MS = 10_000

// ─── Tipos mínimos de HTTP ───────────────────────────────────────────────────

/**
 * Assinatura mínima de `fetch` que usamos. Declarada estruturalmente para (a) não
 * depender da lib DOM e (b) permitir injetar um duplo nos testes sem tocar em globais.
 */
export interface FetchResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  json(): Promise<unknown>
}

export interface FetchInitLike {
  signal: AbortSignal
  headers: Record<string, string>
  redirect?: 'follow'
}

export type FetchLike = (url: string, init: FetchInitLike) => Promise<FetchResponseLike>

// ─── Detecção de falha TLS ───────────────────────────────────────────────────

const TLS_ERROR_CODES = new Set([
  'EPROTO',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_PACKET_LENGTH_TOO_LONG',
  'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_INVALID_PROTOCOL_VERSION',
])

const TLS_MESSAGE_PATTERN =
  /\b(ssl|tls|sslv\d|tlsv\d|handshake|certificate|cipher|alert number|wrong version number|no protocols available|dh key too small)\b/i

interface ErrorLike {
  message?: unknown
  code?: unknown
  cause?: unknown
}

function errorChain(error: unknown, depth = 6): ErrorLike[] {
  const chain: ErrorLike[] = []
  let current: unknown = error
  while (current && typeof current === 'object' && chain.length < depth) {
    const node = current as ErrorLike
    chain.push(node)
    current = node.cause
  }
  return chain
}

/**
 * Devolve uma descrição legível se o erro for (ou contiver) uma falha de TLS.
 * `fetch` do Node embrulha a causa real em `error.cause`, às vezes em dois níveis.
 */
export function describeTlsFailure(error: unknown): string | null {
  for (const node of errorChain(error)) {
    const code = typeof node.code === 'string' ? node.code : ''
    const message = typeof node.message === 'string' ? node.message : ''
    if (code && TLS_ERROR_CODES.has(code)) return `${code}${message ? `: ${message}` : ''}`
    if (TLS_MESSAGE_PATTERN.test(message)) return message
    // ECONNRESET só conta como TLS se o resto da cadeia falar de SSL/TLS.
    if (code === 'ECONNRESET' && TLS_MESSAGE_PATTERN.test(message)) return `${code}: ${message}`
  }
  return null
}

function isAbortError(error: unknown): boolean {
  for (const node of errorChain(error)) {
    const name = (node as { name?: unknown }).name
    if (name === 'AbortError' || name === 'TimeoutError') return true
    if (node.code === 'ABORT_ERR') return true
  }
  return false
}

/**
 * Retentável = provavelmente transitório. TLS e erro de schema **não** são: retentar
 * apenas atrasa o fallback.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof CaixaTlsError) return false
  if (error instanceof CaixaParseError) return false
  if (error instanceof CaixaNotFoundError) return false
  if (error instanceof CaixaHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  return error instanceof CaixaTimeoutError || error instanceof CaixaNetworkError
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface CaixaOfficialProviderOptions {
  baseUrl?: string
  timeoutMs?: number
  /** Um item por retentativa. `[]` desliga o retry. */
  retryDelaysMs?: readonly number[]
  fetchImpl?: FetchLike
  sleep?: (ms: number) => Promise<void>
  userAgent?: string
  name?: string
  /**
   * Confere se o concurso devolvido é o pedido. A API responde com o último concurso
   * quando o número não existe — sem esta checagem, gravaríamos dado errado.
   */
  verifyContestNumber?: boolean
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export class CaixaOfficialProvider implements LotteryResultProvider {
  readonly name: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly retryDelaysMs: readonly number[]
  private readonly fetchImpl: FetchLike
  private readonly sleep: (ms: number) => Promise<void>
  private readonly userAgent: string
  private readonly verifyContestNumber: boolean

  constructor(options: CaixaOfficialProviderOptions = {}) {
    this.name = options.name ?? 'caixa-oficial'
    this.baseUrl = (options.baseUrl ?? CAIXA_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
    this.sleep = options.sleep ?? defaultSleep
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.verifyContestNumber = options.verifyContestNumber ?? true

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError(
        'fetch global indisponível: use Node >= 18 ou injete `fetchImpl` em CaixaOfficialProvider.',
      )
    }
  }

  async fetchLatest(slug: LotterySlug): Promise<ContestResult> {
    const url = `${this.baseUrl}/${pathFor(slug)}/`
    return parseCaixaPayload(await this.request(url), slug)
  }

  async fetchByNumber(slug: LotterySlug, contestNumber: number): Promise<ContestResult> {
    if (!Number.isInteger(contestNumber) || contestNumber < 1) {
      throw new TypeError(`contestNumber deve ser inteiro positivo, recebido: ${contestNumber}`)
    }
    const url = `${this.baseUrl}/${pathFor(slug)}/${contestNumber}`
    const result = parseCaixaPayload(await this.request(url), slug)
    if (this.verifyContestNumber && result.contestNumber !== contestNumber) {
      throw new CaixaParseError(
        `Caixa devolveu o concurso ${result.contestNumber} para "${slug}" quando ` +
          `${contestNumber} foi pedido — provavelmente o concurso não existe.`,
      )
    }
    return result
  }

  /** Tentativa inicial + uma por item de `retryDelaysMs`, com backoff exponencial. */
  private async request(url: string): Promise<unknown> {
    const attempts = this.retryDelaysMs.length + 1
    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.sleep(this.retryDelaysMs[attempt - 1] ?? 0)
      try {
        return await this.requestOnce(url)
      } catch (error) {
        lastError = error
        if (!isRetryableError(error)) throw error
      }
    }

    throw lastError
  }

  private async requestOnce(url: string): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          Referer: 'https://loterias.caixa.gov.br/',
        },
        redirect: 'follow',
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new CaixaNotFoundError(response.status, response.statusText, url)
        }
        throw new CaixaHttpError(response.status, response.statusText, url)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof CaixaHttpError) throw error

      const tls = describeTlsFailure(error)
      if (tls) throw new CaixaTlsError(tls, url, { cause: error })

      if (timedOut || isAbortError(error)) {
        throw new CaixaTimeoutError(this.timeoutMs, url, { cause: error })
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new CaixaNetworkError(`falha de rede ao chamar ${url}: ${message}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }
}

function pathFor(slug: LotterySlug): string {
  const path = CAIXA_SLUG_PATH[slug]
  if (!path) throw new TypeError(`modalidade sem mapeamento na API da Caixa: ${slug}`)
  return path
}

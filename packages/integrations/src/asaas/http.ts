/**
 * Camada HTTP do cliente Asaas (gateway de pagamento — docs/05 §5.5).
 *
 * Mesmo padrão estrutural de `../caixa/provider.ts`:
 * - `fetch` nativo do Node 20 (undici), sem SDK — a API do Asaas é REST/JSON puro;
 * - timeout por `AbortController`;
 * - `FetchLike`/`FetchResponseLike` **estruturais** (sem `lib.dom`), injetáveis em teste;
 * - erros tipados, nunca `throw` de string.
 *
 * Autenticação: header `access_token: <apiKey>` (o Asaas não usa Bearer).
 *
 * Política de retry (decisão de segurança, não de performance):
 * - **GET** é idempotente → 3 retentativas com backoff exponencial (500ms, 2s, 8s);
 * - **POST/PUT/DELETE não são retentados**. Um POST /subscriptions retentado após um
 *   timeout pode criar DUAS assinaturas — o Asaas não expõe idempotency key. Em caso de
 *   timeout numa escrita, o chamador deve reconciliar por `externalReference`
 *   (que é o nosso `subscription.id`) antes de tentar de novo.
 */

// ─── Tipos mínimos de HTTP (estruturais — ver caixa/provider.ts) ─────────────

export type AsaasHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface AsaasFetchResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  json(): Promise<unknown>
}

export interface AsaasFetchInitLike {
  method: AsaasHttpMethod
  signal: AbortSignal
  headers: Record<string, string>
  /** Ausente em GET/DELETE. */
  body?: string | undefined
}

export type AsaasFetchLike = (
  url: string,
  init: AsaasFetchInitLike,
) => Promise<AsaasFetchResponseLike>

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Sandbox é o **default**: nenhum ambiente cobra de verdade por engano de config. */
export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3'
export const ASAAS_PRODUCTION_BASE_URL = 'https://api.asaas.com/v3'

export const DEFAULT_ASAAS_TIMEOUT_MS = 10_000

/** Um item por retentativa — só se aplica a GET. `[]` desliga o retry. */
export const ASAAS_GET_RETRY_DELAYS_MS: readonly number[] = [500, 2_000, 8_000]

export const ASAAS_USER_AGENT = 'LotoPro/1.0 (+https://lotopro.com.br)'

// ─── Erros ───────────────────────────────────────────────────────────────────

/**
 * Falha ao falar com o Asaas.
 *
 * **Toda** falha desta integração (HTTP não-2xx, timeout, rede, resposta 2xx fora do
 * schema) é um `AsaasApiError` ou uma subclasse dele — um único `catch` no chamador
 * cobre a integração inteira.
 *
 * `status` é o HTTP status quando houve resposta, e **`0` quando não houve** (timeout /
 * falha de rede).
 */
export class AsaasApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AsaasApiError'
    this.status = status
    this.body = body
  }
}

/** O Asaas não respondeu dentro de `timeoutMs`. `status === 0`. */
export class AsaasTimeoutError extends AsaasApiError {
  readonly timeoutMs: number
  constructor(timeoutMs: number, method: AsaasHttpMethod, url: string, options?: { cause?: unknown }) {
    super(`Asaas não respondeu em ${timeoutMs}ms: ${method} ${url}`, 0, undefined, options)
    this.name = 'AsaasTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** Falha de transporte antes de qualquer resposta HTTP. `status === 0`. */
export class AsaasNetworkError extends AsaasApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 0, undefined, options)
    this.name = 'AsaasNetworkError'
  }
}

// ─── Extração da mensagem de erro do Asaas ───────────────────────────────────

/**
 * Corpo de erro do Asaas: `{ "errors": [{ "code": "invalid_value", "description": "..." }] }`.
 * Extraímos as descrições para a mensagem; o corpo íntegro fica em `AsaasApiError.body`.
 */
export function describeAsaasError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const errors = (body as { errors?: unknown }).errors
    if (Array.isArray(errors)) {
      const parts = errors
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const { code, description } = item as { code?: unknown; description?: unknown }
          const text = typeof description === 'string' ? description : null
          if (text === null) return null
          return typeof code === 'string' && code.length > 0 ? `${code}: ${text}` : text
        })
        .filter((part): part is string => part !== null)
      if (parts.length > 0) return parts.join('; ')
    }
  }
  return fallback
}

// ─── Classificação de falhas ─────────────────────────────────────────────────

function isAbortError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: unknown; code?: unknown }
    if (name === 'AbortError' || name === 'TimeoutError') return true
    if (code === 'ABORT_ERR') return true
  }
  return false
}

/**
 * Retentável = provavelmente transitório. 4xx (exceto 408/429) é erro nosso: retentar
 * só gasta rate limit.
 */
export function isRetryableAsaasError(error: unknown): boolean {
  if (error instanceof AsaasTimeoutError || error instanceof AsaasNetworkError) return true
  if (error instanceof AsaasApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  return false
}

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

export interface AsaasHttpOptions {
  apiKey: string
  baseUrl?: string | undefined
  fetchImpl?: AsaasFetchLike | undefined
  timeoutMs?: number | undefined
  /** Só afeta GET. Test seam — em teste use `[]` ou `sleep` falso. */
  retryDelaysMs?: readonly number[] | undefined
  /** Test seam: evita esperar o backoff de verdade na suíte. */
  sleep?: ((ms: number) => Promise<void>) | undefined
}

export interface AsaasResponse {
  status: number
  body: unknown
}

export interface AsaasRequestInit {
  /** Serializado como JSON. Ausente ⇒ requisição sem corpo. */
  body?: Record<string, unknown> | undefined
  query?: Record<string, string | number> | undefined
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export class AsaasHttp {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly retryDelaysMs: readonly number[]
  private readonly fetchImpl: AsaasFetchLike
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: AsaasHttpOptions) {
    if (!options.apiKey) {
      throw new TypeError('AsaasClient: apiKey é obrigatório (ASAAS_API_KEY ausente?)')
    }
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? ASAAS_SANDBOX_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_ASAAS_TIMEOUT_MS
    this.retryDelaysMs = options.retryDelaysMs ?? ASAAS_GET_RETRY_DELAYS_MS
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as AsaasFetchLike)
    this.sleep = options.sleep ?? defaultSleep

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError(
        'fetch global indisponível: use Node >= 18 ou injete `fetchImpl` em AsaasClient.',
      )
    }
  }

  async request(
    method: AsaasHttpMethod,
    path: string,
    init: AsaasRequestInit = {},
  ): Promise<AsaasResponse> {
    const url = this.buildUrl(path, init.query)
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body)

    // Escrita nunca é retentada — ver cabeçalho do arquivo.
    const attempts = method === 'GET' ? this.retryDelaysMs.length + 1 : 1
    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.sleep(this.retryDelaysMs[attempt - 1] ?? 0)
      try {
        return await this.requestOnce(method, url, payload)
      } catch (error) {
        lastError = error
        if (!isRetryableAsaasError(error)) throw error
      }
    }

    throw lastError
  }

  private buildUrl(path: string, query?: Record<string, string | number>): string {
    const suffix = path.startsWith('/') ? path : `/${path}`
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) params.set(key, String(value))
    const search = params.toString()
    return `${this.baseUrl}${suffix}${search === '' ? '' : `?${search}`}`
  }

  private async requestOnce(
    method: AsaasHttpMethod,
    url: string,
    payload: string | undefined,
  ): Promise<AsaasResponse> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const headers: Record<string, string> = {
        access_token: this.apiKey,
        Accept: 'application/json',
        'User-Agent': ASAAS_USER_AGENT,
      }
      if (payload !== undefined) headers['Content-Type'] = 'application/json'

      const init: AsaasFetchInitLike = { method, signal: controller.signal, headers }
      if (payload !== undefined) init.body = payload

      const response = await this.fetchImpl(url, init)

      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined // corpo vazio ou não-JSON
      }

      if (!response.ok) {
        const detail = describeAsaasError(body, response.statusText)
        throw new AsaasApiError(
          `Asaas respondeu HTTP ${response.status} em ${method} ${url}: ${detail}`,
          response.status,
          body,
        )
      }

      return { status: response.status, body }
    } catch (error) {
      if (error instanceof AsaasApiError) throw error

      if (timedOut || isAbortError(error)) {
        throw new AsaasTimeoutError(this.timeoutMs, method, url, { cause: error })
      }

      const detail = error instanceof Error ? error.message : String(error)
      throw new AsaasNetworkError(`falha de rede ao chamar ${method} ${url}: ${detail}`, {
        cause: error,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

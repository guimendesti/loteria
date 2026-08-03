/**
 * Provider de FALLBACK: espelho público da API da Caixa.
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * A API oficial (`servicebus2.caixa.gov.br`) responde **403 a partir de IPs de
 * datacenter** — verificado em produção (VPS) em 03/08/2026, com cabeçalhos de
 * navegador completos. Do IP residencial de desenvolvimento ela responde 200.
 * É bloqueio por origem, não por cabeçalho, e nenhuma configuração do cliente
 * contorna. Este é exatamente o risco RT2 previsto em docs/01 §1.3–§1.4, cuja
 * mitigação projetada era um provider de fallback.
 *
 * ── Por que ESTE espelho ─────────────────────────────────────────────────────
 * `api.guidi.dev.br` repassa o payload da Caixa **sem alterar o schema**
 * (`dataApuracao`, `listaDezenas`, `listaRateioPremio`, `trevosSorteados`…), o
 * que permite reaproveitar `parseCaixaPayload` sem nenhuma adaptação — o dado
 * que entra no domínio continua sendo o dado canônico da Caixa.
 *
 * ── Diferenças operacionais ──────────────────────────────────────────────────
 *  • Rota: `/{slug}/ultimo` (mais recente) e `/{slug}/{numero}` (específico).
 *  • Tem **rate limit** (429). Requisições em rajada são recusadas, então este
 *    provider trata 429 como retentável e usa backoff mais generoso que o oficial.
 *
 * ⚠️ É um serviço de terceiro, sem SLA. Continua sendo FALLBACK: o
 * `ResilientResultProvider` só o consulta quando o oficial falha.
 */
import type { ContestResult, LotterySlug } from '@lotopro/core'
import { parseCaixaPayload } from './parse'
import {
  CaixaHttpError,
  CaixaNetworkError,
  CaixaNotFoundError,
  CaixaTimeoutError,
  DEFAULT_USER_AGENT,
  type FetchLike,
  type LotteryResultProvider,
} from './provider'

export const CAIXA_MIRROR_BASE_URL = 'https://api.guidi.dev.br/loteria'

/** Mais espaçado que o oficial: o espelho limita taxa (429). */
export const MIRROR_RETRY_DELAYS_MS = [1_000, 4_000, 10_000] as const
export const MIRROR_TIMEOUT_MS = 15_000

export interface CaixaMirrorProviderOptions {
  name?: string
  baseUrl?: string
  timeoutMs?: number
  retryDelaysMs?: readonly number[]
  fetchImpl?: FetchLike
  sleep?: (ms: number) => Promise<void>
  userAgent?: string
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class CaixaMirrorProvider implements LotteryResultProvider {
  readonly name: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly retryDelaysMs: readonly number[]
  private readonly fetchImpl: FetchLike
  private readonly sleep: (ms: number) => Promise<void>
  private readonly userAgent: string

  constructor(options: CaixaMirrorProviderOptions = {}) {
    this.name = options.name ?? 'caixa-espelho'
    this.baseUrl = (options.baseUrl ?? CAIXA_MIRROR_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? MIRROR_TIMEOUT_MS
    this.retryDelaysMs = options.retryDelaysMs ?? MIRROR_RETRY_DELAYS_MS
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
    this.sleep = options.sleep ?? defaultSleep
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('fetch global indisponível: injete `fetchImpl` em CaixaMirrorProvider.')
    }
  }

  async fetchLatest(slug: LotterySlug): Promise<ContestResult> {
    return parseCaixaPayload(await this.request(`${this.baseUrl}/${slug}/ultimo`), slug)
  }

  async fetchByNumber(slug: LotterySlug, contestNumber: number): Promise<ContestResult> {
    if (!Number.isInteger(contestNumber) || contestNumber < 1) {
      throw new TypeError(`contestNumber deve ser inteiro positivo, recebido: ${contestNumber}`)
    }
    return parseCaixaPayload(await this.request(`${this.baseUrl}/${slug}/${contestNumber}`), slug)
  }

  private async request(url: string): Promise<unknown> {
    const attempts = this.retryDelaysMs.length + 1
    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.sleep(this.retryDelaysMs[attempt - 1] ?? 0)
      try {
        return await this.requestOnce(url)
      } catch (error) {
        lastError = error
        // 404 é resposta definitiva: não existe concurso. Não insiste.
        if (error instanceof CaixaNotFoundError) throw error
      }
    }
    throw lastError
  }

  private async requestOnce(url: string): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 404) throw new CaixaNotFoundError(404, 'Not Found', url)
      if (!response.ok) throw new CaixaHttpError(response.status, response.statusText, url)
      return await response.json()
    } catch (error) {
      if (error instanceof CaixaHttpError || error instanceof CaixaNotFoundError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CaixaTimeoutError(this.timeoutMs, url, { cause: error })
      }
      throw new CaixaNetworkError(`falha de rede ao consultar o espelho: ${url}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }
}

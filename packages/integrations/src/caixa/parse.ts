/**
 * Normalização do payload da Caixa para o contrato canônico `ContestResult`
 * (packages/core/src/types.ts). Esta é a **borda** do sistema: depois daqui,
 * nada no domínio conhece o formato da Caixa.
 *
 * Invariantes (CLAUDE.md):
 * - Dinheiro vira `bigint` de centavos aqui, por manipulação de string decimal.
 *   Nunca `Math.round(valor * 100)` direto sobre o float.
 * - `raw` guarda o payload original intacto, para auditoria/reprocessamento.
 *
 * Ver docs/01-pesquisa-de-mercado.md §1.3 e docs/06-arquitetura-tecnica.md §6.6.
 */

import type {
  ContestPrizeData,
  ContestResult,
  ExtraResult,
  LotterySlug,
} from '@lotopro/core'
import { caixaPayloadSchema, type CaixaPayload, type CaixaRateioPremio } from './schema'

/** Payload inválido, incoerente ou fora do schema esperado. Não é retentável. */
export class CaixaParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CaixaParseError'
  }
}

// ─── Campo extra por modalidade ──────────────────────────────────────────────

/**
 * Mapa de dados (não `if (slug === ...)` — CLAUDE.md regra 6) dizendo qual campo extra
 * do contrato cada modalidade preenche. Modalidades ausentes têm `extraResult: null`.
 *
 * Espelha `LotteryConfig.extraField`; fica aqui porque `parseCaixaPayload` recebe só o
 * slug. Quando o motor de modalidades estiver em banco, este mapa deve ser substituído
 * pela config carregada.
 */
const EXTRA_FIELD_BY_SLUG: Partial<Record<LotterySlug, ExtraResult['kind']>> = {
  maismilionaria: 'CLOVER',
  diadesorte: 'MONTH',
  timemania: 'TEAM',
}

const MONTHS_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
}

// ─── Texto ───────────────────────────────────────────────────────────────────

/**
 * A Caixa devolve campos "vazios" preenchidos com NUL (`"\u0000".repeat(17)`) e faz
 * padding com espaços (`"TOMBENSE         /MG"`). Limpamos ambos.
 */
export function cleanText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

// ─── Dinheiro: float/string → centavos (bigint) ──────────────────────────────

const MAX_DECIMAL_EXPONENT = 30

/**
 * Converte uma string decimal (já normalizada, com `.` como separador e opcional
 * notação científica) para centavos, com aritmética exata de `BigInt` e arredondamento
 * meio-para-cima na 3ª casa. Nenhuma multiplicação em ponto flutuante acontece aqui.
 */
function decimalStringToCents(input: string): bigint {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(input)
  if (!match) throw new CaixaParseError(`valor monetário inválido: ${JSON.stringify(input)}`)

  const sign = match[1] === '-' ? -1n : 1n
  let intPart = match[2] ?? ''
  let fracPart = match[3] ?? ''
  if (intPart === '' && fracPart === '') {
    throw new CaixaParseError(`valor monetário inválido: ${JSON.stringify(input)}`)
  }

  const exponent = match[4] === undefined ? 0 : Number.parseInt(match[4], 10)
  if (Math.abs(exponent) > MAX_DECIMAL_EXPONENT) {
    throw new CaixaParseError(`expoente fora de faixa em valor monetário: ${input}`)
  }

  // Desloca a vírgula manualmente — de novo, sem float.
  if (exponent > 0) {
    const take = Math.min(exponent, fracPart.length)
    intPart += fracPart.slice(0, take)
    fracPart = fracPart.slice(take)
    intPart += '0'.repeat(exponent - take)
  } else if (exponent < 0) {
    const shift = -exponent
    if (shift >= intPart.length) {
      fracPart = '0'.repeat(shift - intPart.length) + intPart + fracPart
      intPart = '0'
    } else {
      fracPart = intPart.slice(intPart.length - shift) + fracPart
      intPart = intPart.slice(0, intPart.length - shift)
    }
  }

  const centDigits = (fracPart + '00').slice(0, 2)
  const thirdDigit = fracPart.length > 2 ? fracPart.charCodeAt(2) - 48 : 0
  let cents = BigInt(intPart === '' ? '0' : intPart) * 100n + BigInt(centDigits)
  if (thirdDigit >= 5) cents += 1n
  return sign * cents
}

/**
 * Normaliza string monetária BR/US para string decimal com `.`.
 *
 * Heurística (documentada por ser ambígua):
 * - se há vírgula, ela é o separador decimal e os pontos são de milhar (`"64.733,96"`);
 * - senão, pontos só são separadores de milhar se o formato for exatamente
 *   `d{1,3}(.d{3})+` (`"66.603.906"` → 66603906); caso contrário, o ponto é decimal
 *   (`"1234.56"` → 1234.56).
 */
function normalizeDecimalString(value: string): string {
  let text = value.trim().replace(/^R\$\s*/i, '').replace(/[\s\u00a0]/g, '')
  if (text === '') return ''
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '')
  }
  return text
}

/**
 * Converte um valor monetário da Caixa (float JSON ou string) para centavos inteiros.
 *
 * Para `number`, usamos `String(value)` — a representação round-trip mais curta do
 * double, que reconstrói exatamente o literal decimal do JSON. Só então operamos em
 * `BigInt`. `Math.round(v * 100)` erraria casos como `1.005` ou `1234.565`.
 *
 * `null`/`undefined`/`""` → `null` (campo ausente ≠ zero).
 */
export function moneyToCents(value: number | string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CaixaParseError(`valor monetário não finito: ${String(value)}`)
    }
    return decimalStringToCents(String(value))
  }
  const normalized = normalizeDecimalString(value)
  if (normalized === '') return null
  return decimalStringToCents(normalized)
}

// ─── Data: DD/MM/AAAA → ISO YYYY-MM-DD ───────────────────────────────────────

/**
 * `dataApuracao` já é a data local do sorteio em America/Sao_Paulo. Reemitimos como
 * `YYYY-MM-DD` sem construir `Date`, para não haver chance de deslocamento de fuso.
 * Aceita também ISO, caso um provider de fallback já normalize.
 */
export function parseBrDate(input: string, field = 'dataApuracao'): string {
  const text = input.trim()

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text)
  if (br) {
    const day = Number.parseInt(br[1] as string, 10)
    const month = Number.parseInt(br[2] as string, 10)
    const year = Number.parseInt(br[3] as string, 10)
    return buildIsoDate(year, month, day, field, text)
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) {
    return buildIsoDate(
      Number.parseInt(iso[1] as string, 10),
      Number.parseInt(iso[2] as string, 10),
      Number.parseInt(iso[3] as string, 10),
      field,
      text,
    )
  }

  throw new CaixaParseError(`${field} em formato inesperado: ${JSON.stringify(input)}`)
}

function buildIsoDate(
  year: number,
  month: number,
  day: number,
  field: string,
  original: string,
): string {
  const probe = new Date(Date.UTC(year, month - 1, day))
  const valid =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  if (!valid) {
    throw new CaixaParseError(`${field} não é uma data válida: ${JSON.stringify(original)}`)
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0')
}

// ─── Números ─────────────────────────────────────────────────────────────────

function toInteger(value: number | string, field: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value.trim(), 10)
  if (!Number.isInteger(parsed)) {
    throw new CaixaParseError(`${field} não é inteiro: ${JSON.stringify(value)}`)
  }
  return parsed
}

function toOptionalInteger(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseInt(value.trim(), 10)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * Dezenas chegam como strings zero-paddeadas (`"07"`, `"00"`, `"084621"`).
 * Convertemos literalmente: `"00"` → `0`. Não reinterpretamos por modalidade — isso é
 * decisão do domínio, e `raw` preserva a forma original.
 */
function toNumbers(
  list: ReadonlyArray<string | number> | null | undefined,
  field: string,
): number[] {
  if (!list) return []
  return list.map((item) => {
    const parsed = typeof item === 'number' ? item : Number.parseInt(String(item).trim(), 10)
    if (!Number.isInteger(parsed)) {
      throw new CaixaParseError(`${field} contém valor não numérico: ${JSON.stringify(item)}`)
    }
    return parsed
  })
}

function toBoolean(value: boolean | string | number | null | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return /^(true|1|sim|s)$/i.test(value.trim())
  return false
}

// ─── Campo extra ─────────────────────────────────────────────────────────────

function parseExtraResult(payload: CaixaPayload, slug: LotterySlug): ExtraResult | null {
  const kind = EXTRA_FIELD_BY_SLUG[slug]
  if (!kind) return null

  if (kind === 'CLOVER') {
    const list = payload.trevosSorteados ?? payload.listaTrevos ?? payload.trevos
    const clovers = toNumbers(list, 'trevosSorteados')
    return clovers.length > 0 ? { kind: 'CLOVER', clovers } : null
  }

  const text = cleanText(payload.nomeTimeCoracaoMesSorte)
  if (text === '') return null

  if (kind === 'MONTH') {
    const key = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const month = MONTHS_PT[key]
    if (month === undefined) {
      throw new CaixaParseError(`mês da sorte não reconhecido: ${JSON.stringify(text)}`)
    }
    return { kind: 'MONTH', month }
  }

  return { kind: 'TEAM', teamName: text }
}

// ─── Premiação ───────────────────────────────────────────────────────────────

/**
 * Dupla Sena: `listaRateioPremio` traz 8 faixas com `descricaoFaixa` REPETIDA
 * ("6 acertos", "5 acertos", "4 acertos", "3 acertos" duas vezes) e `faixa` 1–8.
 * O rótulo não distingue o sorteio; a ordem sim. Assumimos partição na metade:
 * primeira metade = 1º sorteio, segunda = 2º. Quando não há 2º sorteio, `drawIndex`
 * é `null`, conforme o contrato.
 */
function drawIndexFor(index: number, total: number, hasSecondDraw: boolean): number | null {
  if (!hasSecondDraw) return null
  if (total % 2 !== 0) return null
  return index < total / 2 ? 1 : 2
}

function parsePrizes(
  list: ReadonlyArray<CaixaRateioPremio> | null | undefined,
  hasSecondDraw: boolean,
): ContestPrizeData[] {
  if (!list) return []
  const total = list.length
  return list.map((item, index) => {
    const tier = toOptionalInteger(item.faixa) ?? index + 1
    const winners = toOptionalInteger(item.numeroDeGanhadores) ?? 0
    const prizeCents = moneyToCents(item.valorPremio ?? null) ?? 0n
    return {
      tier,
      label: cleanText(item.descricaoFaixa),
      winnersCount: winners,
      prizeCents,
      drawIndex: drawIndexFor(index, total, hasSecondDraw),
    }
  })
}

// ─── Entrada principal ───────────────────────────────────────────────────────

/**
 * Converte o payload cru da Caixa no `ContestResult` canônico.
 *
 * @throws {CaixaParseError} se o payload não passar no schema ou tiver campo incoerente.
 */
export function parseCaixaPayload(raw: unknown, slug: LotterySlug): ContestResult {
  const validation = caixaPayloadSchema.safeParse(raw)
  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ')
    throw new CaixaParseError(
      `payload da Caixa fora do schema esperado para "${slug}" — ${issues}`,
      { cause: validation.error },
    )
  }
  const payload = validation.data

  const numbers = toNumbers(payload.listaDezenas, 'listaDezenas')
  const secondaryNumbers = toNumbers(
    payload.listaDezenasSegundoSorteio,
    'listaDezenasSegundoSorteio',
  )

  /**
   * `dezenasSorteadasOrdemSorteio` concatena tudo que saiu do globo:
   * - Dupla Sena → 12 itens (6 do 1º sorteio + 6 do 2º);
   * - +Milionária → 8 itens (6 dezenas + 2 trevos).
   * O contrato tem um único `numbersDrawOrder`, referente ao sorteio primário, então
   * truncamos no tamanho de `numbers`. A ordem completa continua em `raw`.
   */
  const fullDrawOrder = toNumbers(
    payload.dezenasSorteadasOrdemSorteio,
    'dezenasSorteadasOrdemSorteio',
  )
  const numbersDrawOrder =
    numbers.length > 0 && fullDrawOrder.length > numbers.length
      ? fullDrawOrder.slice(0, numbers.length)
      : fullDrawOrder

  return {
    lottery: slug,
    contestNumber: toInteger(payload.numero, 'numero'),
    drawDate: parseBrDate(payload.dataApuracao),
    numbers,
    numbersDrawOrder,
    secondaryNumbers,
    extraResult: parseExtraResult(payload, slug),
    isAccumulated: toBoolean(payload.acumulado),
    prizes: parsePrizes(payload.listaRateioPremio, secondaryNumbers.length > 0),
    collectedCents: moneyToCents(payload.valorArrecadado ?? null),
    accumulatedNextCents: moneyToCents(payload.valorAcumuladoProximoConcurso ?? null),
    estimatedNextCents: moneyToCents(payload.valorEstimadoProximoConcurso ?? null),
    nextContestNumber: normalizeNextContest(payload.numeroConcursoProximo),
    raw,
  }
}

/** `numeroConcursoProximo` vem `0` quando não há próximo concurso definido. */
function normalizeNextContest(value: number | string | null | undefined): number | null {
  const parsed = toOptionalInteger(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

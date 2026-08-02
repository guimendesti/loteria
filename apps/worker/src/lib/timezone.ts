/**
 * Utilidades de fuso horário — America/Sao_Paulo, sem lib externa (Intl nativo do Node).
 *
 * Usado tanto pelo scheduler (janela quente por hora local) quanto pelos jobs de sync
 * (conversão do `drawDate` ISO do `ContestResult` para o `DateTime` do Postgres e volta).
 */

export const SAO_PAULO_TZ = 'America/Sao_Paulo'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export interface SaoPauloParts {
  /** 0 = domingo … 6 = sábado — mesma convenção de `DrawScheduleEntry.day`. */
  weekday: number
  hour: number
  minute: number
}

/** Hora/dia-da-semana LOCAIS em America/Sao_Paulo para um instante UTC, via `Intl.DateTimeFormat`. */
export function getSaoPauloParts(date: Date): SaoPauloParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00'

  const weekdayIndex = WEEKDAYS.indexOf(weekdayStr as (typeof WEEKDAYS)[number])
  // hour12:false pode devolver "24" à meia-noite em alguns runtimes ICU — normalizamos.
  const hour = Number.parseInt(hourStr, 10) % 24
  const minute = Number.parseInt(minuteStr, 10)

  return { weekday: weekdayIndex === -1 ? 0 : weekdayIndex, hour, minute }
}

/** Deriva o offset atual de America/Sao_Paulo (ex.: "-03:00") para uma data específica. */
function saoPauloOffsetFor(isoDate: string): string {
  const probe = new Date(`${isoDate}T12:00:00Z`) // meio-dia UTC: evita virar o dia no fuso local
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(probe)
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tzName)
  if (!match) return '-03:00'
  const sign = match[1]
  const hh = (match[2] ?? '3').padStart(2, '0')
  const mm = match[3] ?? '00'
  return `${sign}${hh}:${mm}`
}

/**
 * Converte uma data `YYYY-MM-DD` (calendário LOCAL de America/Sao_Paulo — contrato de
 * `ContestResult.drawDate`, ver packages/core/src/types.ts) para o instante UTC de
 * "00:00:00" nesse fuso, para gravar em `Contest.drawDate` (Postgres `timestamptz`).
 *
 * Não hardcoda o offset "-03:00": deriva via `Intl` para o dia pedido, então continua
 * correto mesmo se o Brasil voltar a adotar horário de verão.
 */
export function saoPauloDateToUtc(isoDate: string): Date {
  const offset = saoPauloOffsetFor(isoDate)
  const date = new Date(`${isoDate}T00:00:00${offset}`)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`data inválida ao converter para America/Sao_Paulo: ${JSON.stringify(isoDate)}`)
  }
  return date
}

/** Caminho inverso: `Contest.drawDate` (timestamptz) → `YYYY-MM-DD` local em America/Sao_Paulo. */
export function formatIsoDateInSaoPaulo(date: Date): string {
  // Locale en-CA formata como YYYY-MM-DD — truque padrão para não montar a string na mão.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

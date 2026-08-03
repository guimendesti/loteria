/**
 * Formatadores compartilhados das telas do backoffice. `formatCents` é uma cópia
 * deliberada de `(app)/app/components/format-cents.ts` (mesma fórmula, mesmo motivo —
 * dinheiro é sempre `bigint`, CLAUDE.md §5) em vez de importar do território de outro
 * agente: mantém `(admin)` autocontido, sem depender de arquivos de `(app)`.
 */
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCents(cents: bigint | number): string {
  const value = typeof cents === 'bigint' ? Number(cents) : cents
  return currencyFormatter.format(value / 100)
}

export function formatPct(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

/** "2026-08" → "ago/26" (mesma técnica de `(app)/app/carteira/components/MonthlyChart.tsx`). */
const monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export function formatMonthLabel(month: string): string {
  const parts = month.split('-')
  const year = Number(parts[0])
  const monthNumber = Number(parts[1] ?? '1')
  const date = new Date(Date.UTC(year, monthNumber - 1, 1, 12))
  return monthLabelFormatter.format(date).replace('.', '')
}

/** Minutos → texto compacto ("3h12min", "45min", "2d5h"). Usado no painel de saúde (BO-04). */
export function formatMinutesAgo(minutes: number | null): string {
  if (minutes === null) return 'nunca'
  if (minutes < 60) return `${minutes} min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h${remainingMinutes}min atrás` : `${hours}h atrás`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d${remainingHours}h atrás` : `${days}d atrás`
}

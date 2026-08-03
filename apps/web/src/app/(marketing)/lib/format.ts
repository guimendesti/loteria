/**
 * Formatação compartilhada das páginas públicas — (marketing) não importa de
 * (app) (fora do território desta tarefa, ver relatório), então este é um
 * pequeno duplicado intencional de `apps/web/src/app/(app)/app/components/format-cents.ts`.
 * Dinheiro é sempre `bigint` no domínio (CLAUDE.md §5); a conversão para
 * `number` acontece só aqui, na borda de apresentação.
 */
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCents(cents: bigint | number): string {
  const value = typeof cents === 'bigint' ? Number(cents) : cents
  return currencyFormatter.format(value / 100)
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Formata uma data `YYYY-MM-DD` (ISO local, sem hora) como `DD/MM/AAAA` sem risco de fuso. */
export function formatIsoDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

/** Formata um `Date` (timestamptz do Postgres) como `DD/MM/AAAA` em America/Sao_Paulo. */
export function formatDateBR(date: Date): string {
  return dateFormatter.format(date)
}

const numberFormatter = new Intl.NumberFormat('pt-BR')

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

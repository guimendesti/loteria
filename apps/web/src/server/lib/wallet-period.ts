/**
 * Helpers puros de período/agregação da Carteira (docs/08 §C.7, CL-90..93) —
 * extraídos do router `wallet` para serem testáveis sem Prisma/tRPC (mesmo
 * padrão de `server/lib/bet-cost.ts`).
 *
 * Fuso: todo o agrupamento mensal/anual é em America/Sao_Paulo, calculado com
 * `Intl.DateTimeFormat` (não a hora do servidor). Simplificação assumida:
 * o Brasil não tem mais horário de verão desde 2019, então America/Sao_Paulo
 * é UTC-3 fixo o ano inteiro — não precisamos resolver o offset dinamicamente.
 * Se o horário de verão voltar, `SAO_PAULO_UTC_OFFSET_HOURS` precisa virar
 * uma consulta real de timezone.
 */
const SAO_PAULO_UTC_OFFSET_HOURS = 3

const yearMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
})

/** Ano e mês (1-based) de `date`, na hora local de America/Sao_Paulo. */
export function saoPauloYearMonth(date: Date): { year: number; month: number } {
  const parts = yearMonthFormatter.formatToParts(date)
  const yearPart = parts.find((part) => part.type === 'year')
  const monthPart = parts.find((part) => part.type === 'month')
  if (!yearPart || !monthPart) {
    // Nunca deveria acontecer — Intl sempre devolve as partes pedidas nas opções.
    throw new Error('Intl.DateTimeFormat não devolveu ano/mês para America/Sao_Paulo.')
  }
  return { year: Number(yearPart.value), month: Number(monthPart.value) }
}

/** Chave de agrupamento mensal ("2026-08") de `date`, em America/Sao_Paulo. */
export function monthKey(date: Date): string {
  const { year, month } = saoPauloYearMonth(date)
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Início (00:00) do mês `year`-`month` (1-based) de America/Sao_Paulo, como instante UTC. */
export function startOfSaoPauloMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0))
}

/**
 * Intervalo `[gte, lt)` de um período, em instantes UTC prontos para filtro
 * Prisma (`createdAt`/`checkedAt`). `'all'` devolve `{}` (sem filtro de data).
 */
export function periodRange(period: 'month' | 'year' | 'all', now: Date = new Date()): { gte?: Date; lt?: Date } {
  if (period === 'all') return {}

  const { year, month } = saoPauloYearMonth(now)

  if (period === 'month') {
    const gte = startOfSaoPauloMonthUtc(year, month)
    const lt = month === 12 ? startOfSaoPauloMonthUtc(year + 1, 1) : startOfSaoPauloMonthUtc(year, month + 1)
    return { gte, lt }
  }

  const gte = startOfSaoPauloMonthUtc(year, 1)
  const lt = startOfSaoPauloMonthUtc(year + 1, 1)
  return { gte, lt }
}

/**
 * Últimas `months` chaves de mês ("2026-08"), da mais antiga para a mais
 * recente, terminando no mês atual de `reference` (em America/Sao_Paulo).
 * Usado para preencher o eixo do gráfico mensal (CL-93) mesmo em meses sem
 * nenhum registro (série sempre com `months` pontos, sem buracos).
 */
export function lastMonthKeys(reference: Date, months: number): string[] {
  const { year, month } = saoPauloYearMonth(reference)
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const absoluteMonth = year * 12 + (month - 1) - i
    const keyYear = Math.floor(absoluteMonth / 12)
    const keyMonth = (absoluteMonth % 12) + 1
    keys.push(`${keyYear}-${String(keyMonth).padStart(2, '0')}`)
  }
  return keys
}

/**
 * ROI honesto (docs/08 CL-92, docs/04 D6): aritmética em `bigint` até o
 * último passo, convertendo para `number` só para o percentual final — nunca
 * arredonda o sinal nem "esconde" um ROI negativo. `null` quando não houve
 * gasto no período (ROI indefinido, não é o mesmo que "0%").
 */
export function calculateRoiPct(spentCents: bigint, prizeCents: bigint): number | null {
  if (spentCents <= 0n) return null
  return (Number(prizeCents - spentCents) / Number(spentCents)) * 100
}

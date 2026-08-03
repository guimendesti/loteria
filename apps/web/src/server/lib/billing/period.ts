/**
 * Aritmética de período de assinatura e de preço — 100% pura, sem I/O, sem Prisma.
 *
 * Fica separada de `service.ts` porque é a parte com mais armadilhas (fim de mês, fuso da
 * data de vencimento, arredondamento de desconto em centavos) e a que mais merece teste
 * direto. CLAUDE.md §5: dinheiro sempre em centavos inteiros (`bigint`), nunca `float`.
 */
import { BillingCycle, PaymentMethod } from '@lotopro/db'

/** docs/05 §5.4 — "14 dias de Pro grátis, sem cartão". */
export const TRIAL_DAYS = 14

/**
 * docs/05 §5.5, decisão 2 — "5% de desconto para quem escolhe Pix Automático".
 * Inteiro em pontos percentuais para o desconto ser calculado só com `bigint`.
 */
export const PIX_AUTOMATIC_DISCOUNT_PERCENT = 5n

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

/**
 * Soma `months` meses preservando o dia do mês quando possível e GRUDANDO no último dia
 * do mês de destino quando o dia não existe lá (31/01 + 1 mês = 28/02, não 03/03).
 * Trabalha em UTC — o instante armazenado é o que importa; a apresentação em
 * America/Sao_Paulo é responsabilidade da UI.
 */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  const targetMonthStart = Date.UTC(year, month + months, 1)
  const target = new Date(targetMonthStart)
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()

  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(day, lastDayOfTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

/** Avança `date` em exatamente um ciclo de cobrança. */
export function addCycle(date: Date, cycle: BillingCycle): Date {
  return addMonths(date, cycle === BillingCycle.YEARLY ? 12 : 1)
}

/**
 * Dias INTEIROS decorridos entre dois instantes (piso). Usado pelo dunning para decidir
 * D+1/D+3/D+5/D+7 a partir de `Invoice.dueAt`. Negativo quando `to` é anterior a `from`.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/**
 * Data no formato 'YYYY-MM-DD' que o Asaas espera em `nextDueDate`, no fuso do negócio
 * (America/Sao_Paulo). Sem isso, uma cobrança criada às 22h de Brasília (01h UTC do dia
 * seguinte) venceria "amanhã" para o Asaas e "hoje" para o usuário.
 */
export function formatDueDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: 'year' | 'month' | 'day'): string =>
    parts.find((part) => part.type === type)?.value ?? '01'

  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Interpreta 'YYYY-MM-DD' (data do Asaas) como meio-dia UTC — longe de qualquer virada de fuso. */
export function parseDueDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return null
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

// ─── Preço ────────────────────────────────────────────────────────────────────

export interface PricedPlan {
  priceMonthlyCents: bigint
  priceYearlyCents: bigint
}

/** Preço de tabela do plano no ciclo escolhido (docs/05 §5.2), antes de desconto. */
export function planPriceCents(plan: PricedPlan, cycle: BillingCycle): bigint {
  return cycle === BillingCycle.YEARLY ? plan.priceYearlyCents : plan.priceMonthlyCents
}

/**
 * Valor efetivamente cobrado: preço de tabela menos o incentivo de 5% do Pix Automático
 * (docs/05 §5.5). O desconto é truncado para baixo em centavos — o usuário paga no
 * máximo 1 centavo a mais que os 5% exatos, nunca sobra fração.
 *
 * ⛔ Depende SÓ de (plano, ciclo, meio). Nenhum parâmetro de aposta entra aqui.
 */
export function chargeAmountCents(
  plan: PricedPlan,
  cycle: BillingCycle,
  method: PaymentMethod,
): bigint {
  const listPrice = planPriceCents(plan, cycle)
  if (method !== PaymentMethod.PIX_AUTOMATIC || listPrice <= 0n) return listPrice
  const discount = (listPrice * PIX_AUTOMATIC_DISCOUNT_PERCENT) / 100n
  return listPrice - discount
}

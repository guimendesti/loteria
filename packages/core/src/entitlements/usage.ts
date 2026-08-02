/**
 * Janela e chaves do contador de consumo (`usage_counters`, docs/07 §7.4).
 *
 * Aqui só existe o cálculo PURO da janela e o contrato das métricas. A escrita
 * é do worker / router, porque precisa ser ATÔMICA (docs/06 §6.9):
 *
 * ```ts
 * // Prisma — incremento atômico na chave única (userId, metric, period)
 * await prisma.usageCounter.upsert({
 *   where:  { userId_metric_period: { userId, metric, period: currentPeriod(new Date()) } },
 *   create: { userId, metric, period: currentPeriod(new Date()), used: 1 },
 *   update: { used: { increment: 1 } },
 * })
 * ```
 *
 * ```sql
 * -- Equivalente em SQL cru, com o consumo já atualizado de volta para o guard:
 * INSERT INTO "UsageCounter" ("id", "userId", "metric", "period", "used", "updatedAt")
 * VALUES ($1, $2, $3, $4, 1, now())
 * ON CONFLICT ("userId", "metric", "period")
 * DO UPDATE SET "used" = "UsageCounter"."used" + 1, "updatedAt" = now()
 * RETURNING "used";
 * ```
 *
 * A ordem correta é: ler o consumo → `canUseOcr`/`canUseAi` → executar →
 * incrementar. Nunca incrementar antes de saber se a ação vai acontecer, e
 * nunca fazer read-modify-write em duas queries (corrida entre requisições).
 */
import { z } from 'zod'

/** Todo período de cobrança de consumo é ancorado no fuso de Brasília. */
export const USAGE_TIMEZONE = 'America/Sao_Paulo'

export type UsageMetric = 'ocr_scans' | 'ai_messages' | 'backtests'

export const USAGE_METRICS = ['ocr_scans', 'ai_messages', 'backtests'] as const

export const usageMetricSchema = z.enum(USAGE_METRICS)

/** Formato de `usage_counters.period`: "2026-08". */
export const usagePeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

/** Chave única de `usage_counters` (docs/07 §7.4: @@unique([userId, metric, period])). */
export interface UsageCounterKey {
  userId: string
  metric: UsageMetric
  period: string
}

let periodFormatter: Intl.DateTimeFormat | undefined

/**
 * Janela mensal do contador, no fuso America/Sao_Paulo.
 * `2026-08-31T23:30:00-03:00` → "2026-08"; `2026-09-01T00:30:00Z` (= 31/08
 * 21:30 em Brasília) → "2026-08".
 */
export function currentPeriod(now: Date): string {
  const time = now.getTime()
  if (Number.isNaN(time)) throw new RangeError('currentPeriod: Date inválida')

  periodFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: USAGE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  })

  const parts = periodFormatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  if (year === undefined || month === undefined) {
    throw new RangeError('currentPeriod: fuso America/Sao_Paulo indisponível no runtime')
  }
  return `${year}-${month}`
}

export function isUsageMetric(value: unknown): value is UsageMetric {
  return usageMetricSchema.safeParse(value).success
}

export function isUsagePeriod(value: unknown): value is string {
  return usagePeriodSchema.safeParse(value).success
}

/** Monta a chave do contador do mês corrente. */
export function usageCounterKey(userId: string, metric: UsageMetric, now: Date): UsageCounterKey {
  return { userId, metric, period: currentPeriod(now) }
}

/**
 * BO-34 (docs/08 §D.5) — cálculo de MRR novo/expansão/contração/churn.
 *
 * `computeMrrReport` é puro (sem Prisma) — ver `server/routers/admin/finance.ts` para como o
 * router monta `MrrPaidEvent[]`/`MrrCancelEvent[]` a partir de `Invoice`/`Subscription`.
 */
import { describe, expect, it } from 'vitest'
import { BillingCycle } from '@lotopro/db'
import {
  computeMrrReport,
  monthlyEquivalentCents,
  parseMonth,
  type MrrCancelEvent,
  type MrrPaidEvent,
} from '../admin/finance'

const MONTH_START = new Date('2026-08-01T00:00:00Z')
const MONTH_END = new Date('2026-09-01T00:00:00Z')
const BEFORE_MONTH = new Date('2026-07-15T00:00:00Z')
const IN_MONTH_EARLY = new Date('2026-08-05T00:00:00Z')
const IN_MONTH_LATE = new Date('2026-08-20T00:00:00Z')

describe('monthlyEquivalentCents', () => {
  it('mensal permanece igual; anual divide por 12 (truncado)', () => {
    expect(monthlyEquivalentCents(2500n, BillingCycle.MONTHLY)).toBe(2500n)
    expect(monthlyEquivalentCents(12_000n, BillingCycle.YEARLY)).toBe(1_000n)
    expect(monthlyEquivalentCents(1_205n, BillingCycle.YEARLY)).toBe(100n) // trunca, não arredonda
  })
})

describe('parseMonth', () => {
  it('"YYYY-MM" vira [monthStart, monthEnd) em UTC', () => {
    expect(parseMonth('2026-08')).toEqual({ monthStart: MONTH_START, monthEnd: MONTH_END })
  })

  it('formato inválido lança', () => {
    expect(() => parseMonth('2026/08')).toThrow(RangeError)
    expect(() => parseMonth('agosto-2026')).toThrow(RangeError)
  })
})

describe('computeMrrReport (BO-34)', () => {
  it('classifica novo, expansão, contração e churn no mês', () => {
    const paidEvents: MrrPaidEvent[] = [
      // Sub A: primeira fatura paga cai dentro do mês → MRR novo.
      { subscriptionId: 'sub-a', paidAt: IN_MONTH_EARLY, mrrCents: 2_500n },

      // Sub B: pagava 1.000 antes do mês, passou a pagar 2.500 dentro do mês → expansão de 1.500.
      { subscriptionId: 'sub-b', paidAt: BEFORE_MONTH, mrrCents: 1_000n },
      { subscriptionId: 'sub-b', paidAt: IN_MONTH_EARLY, mrrCents: 2_500n },

      // Sub C: pagava 4.000 antes do mês, caiu para 1.500 dentro do mês → contração de 2.500.
      { subscriptionId: 'sub-c', paidAt: BEFORE_MONTH, mrrCents: 4_000n },
      { subscriptionId: 'sub-c', paidAt: IN_MONTH_LATE, mrrCents: 1_500n },

      // Sub D: só tem pagamento ANTES do mês (usado pelo evento de churn abaixo).
      { subscriptionId: 'sub-d', paidAt: BEFORE_MONTH, mrrCents: 1_800n },
    ]

    const cancelEvents: MrrCancelEvent[] = [{ subscriptionId: 'sub-d', canceledAt: IN_MONTH_LATE }]

    const report = computeMrrReport(paidEvents, cancelEvents, MONTH_START, MONTH_END)

    expect(report).toEqual({
      newCents: 2_500n,
      expansionCents: 1_500n,
      contractionCents: 2_500n,
      churnCents: 1_800n,
      netNewCents: 2_500n + 1_500n - 2_500n - 1_800n, // -300n
    })
  })

  it('sem eventos no mês, todo o relatório é zero', () => {
    const report = computeMrrReport([], [], MONTH_START, MONTH_END)
    expect(report).toEqual({
      newCents: 0n,
      expansionCents: 0n,
      contractionCents: 0n,
      churnCents: 0n,
      netNewCents: 0n,
    })
  })

  it('pagamento repetido com o MESMO valor não gera expansão nem contração (renovação normal)', () => {
    const paidEvents: MrrPaidEvent[] = [
      { subscriptionId: 'sub-e', paidAt: BEFORE_MONTH, mrrCents: 2_000n },
      { subscriptionId: 'sub-e', paidAt: IN_MONTH_EARLY, mrrCents: 2_000n },
    ]
    const report = computeMrrReport(paidEvents, [], MONTH_START, MONTH_END)
    expect(report.newCents).toBe(0n)
    expect(report.expansionCents).toBe(0n)
    expect(report.contractionCents).toBe(0n)
  })

  it('cancelamento fora do mês não conta como churn deste relatório', () => {
    const paidEvents: MrrPaidEvent[] = [{ subscriptionId: 'sub-f', paidAt: BEFORE_MONTH, mrrCents: 900n }]
    const cancelEvents: MrrCancelEvent[] = [{ subscriptionId: 'sub-f', canceledAt: new Date('2026-09-02T00:00:00Z') }]
    const report = computeMrrReport(paidEvents, cancelEvents, MONTH_START, MONTH_END)
    expect(report.churnCents).toBe(0n)
  })
})

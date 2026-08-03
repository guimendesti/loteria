'use client'

/**
 * LP-02 — Toggle mensal/anual + tabela comparativa completa dos 3 planos
 * públicos (docs/05 §5.2). Client component só pelo `useState` do toggle —
 * os dados (`content/plans.ts`) são estáticos, importados direto (sem
 * necessidade de passar por props do server component pai).
 */
import { useState } from 'react'
import Link from 'next/link'
import { ANNUAL_DISCOUNT_LABEL, PLAN_COMPARISON_ROWS, PLANS, type PlanId } from '@/app/(marketing)/content/plans'
import { formatCents } from '@/app/(marketing)/lib/format'

type Cycle = 'monthly' | 'yearly'

function priceForCycle(cents: number, yearlyCents: number | null, cycle: Cycle): { price: string; suffix: string } {
  if (cents === 0) return { price: 'Grátis', suffix: '' }
  if (cycle === 'monthly' || yearlyCents === null) {
    return { price: formatCents(cents), suffix: '/mês' }
  }
  return { price: formatCents(yearlyCents), suffix: '/ano' }
}

export function PlanToggle() {
  const [cycle, setCycle] = useState<Cycle>('monthly')

  return (
    <div>
      {/* Toggle mensal/anual */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${cycle === 'monthly' ? 'text-ink-900' : 'text-ink-400'}`}>
          Mensal
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cycle === 'yearly'}
          aria-label="Alternar entre cobrança mensal e anual"
          onClick={() => setCycle((c) => (c === 'monthly' ? 'yearly' : 'monthly'))}
          className="relative inline-flex h-7 w-12 items-center rounded-full bg-brand-500 transition-colors"
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              cycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${cycle === 'yearly' ? 'text-ink-900' : 'text-ink-400'}`}>
          Anual
        </span>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          {ANNUAL_DISCOUNT_LABEL}
        </span>
      </div>

      {/* Cartões de plano */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const { price, suffix } = priceForCycle(plan.priceMonthlyCents, plan.priceYearlyCents, cycle)
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-lg border p-6 ${
                plan.featured ? 'border-brand-500 shadow-md' : 'border-ink-200'
              }`}
            >
              {plan.featured && (
                <span className="mb-2 inline-block w-fit rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Mais popular
                </span>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{plan.tier}</p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">{plan.commercialName}</p>
              <p className="mt-1 text-sm text-ink-600">{plan.personaHint}</p>
              <p className="mt-4 font-display text-3xl font-bold text-brand-700">
                {price}
                {suffix && <span className="text-base font-normal text-ink-600">{suffix}</span>}
              </p>
              {cycle === 'yearly' && plan.priceYearlyCents !== null && (
                <p className="text-xs text-ink-400">
                  equivale a {formatCents(Math.round(plan.priceYearlyCents / 12))}/mês
                </p>
              )}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-600">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2">
                    <span aria-hidden="true" className="text-success">
                      ✓
                    </span>
                    {highlight}
                  </li>
                ))}
              </ul>
              <Link
                href={`/cadastro?plano=${plan.id}`}
                className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-semibold ${
                  plan.featured
                    ? 'bg-brand-500 text-white hover:bg-brand-700'
                    : 'border border-brand-500 text-brand-700 hover:bg-brand-100'
                }`}
              >
                {plan.ctaLabel}
              </Link>
            </div>
          )
        })}
      </div>

      {/* Tabela comparativa completa */}
      <div className="mt-16 overflow-x-auto rounded-lg border border-ink-200">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-ink-50">
              <th className="p-3 font-semibold text-ink-900">Recurso</th>
              {PLANS.map((plan) => (
                <th key={plan.id} className="p-3 font-semibold text-ink-900">
                  {plan.commercialName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON_ROWS.map((row) => (
              <tr key={row.label} className="border-t border-ink-200">
                <td className="p-3 font-medium text-ink-900">{row.label}</td>
                {(Object.keys(row.values) as PlanId[]).map((planId) => (
                  <td key={planId} className="p-3 text-ink-600">
                    {row.values[planId]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

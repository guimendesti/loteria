import Link from 'next/link'
import { PLANS } from '@/app/(marketing)/content/plans'
import { formatCents } from '@/app/(marketing)/lib/format'

/**
 * Seção 7 — Planos, comparativo resumido com CTA (docs/08 §A.3.7, docs/05 §5.2).
 * Dados em `content/plans.ts`, reaproveitados pela página `/planos` (LP-02), que
 * traz a tabela comparativa completa.
 */
export function PlansSummary() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Planos
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-ink-600">
          Sua assinatura nunca varia com quanto você aposta ou quanto ganha — é sempre licença
          de software.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-lg border p-6 ${
                plan.featured ? 'border-brand-500 shadow-md' : 'border-ink-200'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                {plan.tier}
              </p>
              <p className="mt-1 font-display text-lg font-bold text-ink-900">
                {plan.commercialName}
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-brand-700">
                {plan.priceMonthlyCents === 0 ? 'Grátis' : formatCents(plan.priceMonthlyCents)}
                {plan.priceMonthlyCents > 0 && <span className="text-sm font-normal text-ink-600">/mês</span>}
              </p>
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
                href="/cadastro"
                className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-semibold ${
                  plan.featured
                    ? 'bg-brand-500 text-white hover:bg-brand-700'
                    : 'border border-brand-500 text-brand-700 hover:bg-brand-100'
                }`}
              >
                {plan.ctaLabel}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/planos"
            className="inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Ver todos os planos
          </Link>
        </div>
      </div>
    </section>
  )
}

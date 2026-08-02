import Link from 'next/link'

/** Seção 7 — Planos, comparativo resumido com CTA (docs/08 §A.3.7, docs/05 §5.2). */
const PLANS = [
  { name: 'Apostador', tier: 'Free', price: 'R$ 0' },
  { name: 'Estrategista', tier: 'Premium', price: 'R$ 24,90/mês' },
  { name: 'Bolão Master', tier: 'Pro', price: 'R$ 59,90/mês' },
]

export function PlansSummary() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Planos
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className="flex flex-col items-center rounded-lg border border-ink-200 p-6 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                {plan.tier}
              </p>
              <p className="mt-1 font-display text-lg font-bold text-ink-900">
                {plan.name}
              </p>
              <p className="mt-2 text-brand-700">{plan.price}</p>
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

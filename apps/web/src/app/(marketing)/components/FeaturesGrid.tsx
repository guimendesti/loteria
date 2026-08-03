import Link from 'next/link'
import { FEATURES } from '@/app/(marketing)/content/features'

/**
 * Seção 5 — Recursos, grid dos 10 diferenciais (docs/08 §A.3.5, docs/04 §4.3).
 * Conteúdo em `content/features.ts`, reaproveitado pela página `/recursos` (LP-03).
 */
export function FeaturesGrid() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Recursos
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((feature) =>
            feature.href ? (
              <Link
                key={feature.id}
                href={feature.href}
                className="rounded-lg border border-ink-200 p-4 transition-colors hover:border-brand-500 hover:bg-brand-100/40"
              >
                <p className="font-display font-semibold text-ink-900">{feature.title}</p>
                <p className="mt-2 text-sm text-ink-600">{feature.short}</p>
                <span className="mt-3 inline-block text-sm font-semibold text-brand-700">
                  Saiba mais →
                </span>
              </Link>
            ) : (
              <div key={feature.id} className="rounded-lg border border-ink-200 p-4">
                <p className="font-display font-semibold text-ink-900">{feature.title}</p>
                <p className="mt-2 text-sm text-ink-600">{feature.short}</p>
              </div>
            ),
          )}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/recursos"
            className="inline-block rounded-md border border-brand-500 px-6 py-3 font-semibold text-brand-700 hover:bg-brand-100"
          >
            Ver todos os recursos
          </Link>
        </div>
      </div>
    </section>
  )
}

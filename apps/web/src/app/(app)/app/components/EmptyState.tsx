import Link from 'next/link'

export interface EmptyStateProps {
  title: string
  description?: string
  actionHref?: string
  actionLabel?: string
}

/**
 * C7 — Empty state (docs/09 §9.3/§9.5): ilustração geométrica simples (sem
 * dinheiro/sorte — docs/09 §9.8) + frase + CTA.
 */
export function EmptyState({ title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <circle cx="28" cy="28" r="25" stroke="var(--brand-300)" strokeWidth="2" strokeDasharray="4 6" />
        <circle cx="28" cy="28" r="9" fill="var(--brand-100)" />
      </svg>
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-600">{description}</p> : null}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

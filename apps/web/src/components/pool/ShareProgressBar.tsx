export interface ShareProgressBarProps {
  sharesTaken: number
  totalShares: number
}

/** C5 (docs/09 §9.4) — barra de cotas preenchidas, "14/20 cotas". */
export function ShareProgressBar({ sharesTaken, totalShares }: ShareProgressBarProps) {
  const pct = totalShares > 0 ? Math.min(100, Math.round((sharesTaken / totalShares) * 100)) : 0

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={sharesTaken}
        aria-valuemin={0}
        aria-valuemax={totalShares}
        aria-label={`${sharesTaken} de ${totalShares} cotas vendidas`}
        className="h-2 w-full overflow-hidden rounded-full bg-ink-50"
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-600">
        {sharesTaken}/{totalShares} cotas vendidas
      </p>
    </div>
  )
}

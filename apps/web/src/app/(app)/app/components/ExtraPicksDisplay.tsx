import { NumberBall } from '@lotopro/ui'
import type { ExtraPicks, LotterySlug } from '@lotopro/core'
import { MONTH_NAMES } from './labels'

export interface ExtraPicksDisplayProps {
  extra: ExtraPicks | undefined
  lotterySlug: LotterySlug
}

/** Exibição somente-leitura do campo extra (trevos/mês/time) — BetCard e detalhe. */
export function ExtraPicksDisplay({ extra, lotterySlug }: ExtraPicksDisplayProps) {
  if (!extra) return null

  if (extra.kind === 'CLOVER') {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-ink-600">Trevos:</span>
        {extra.clovers.map((n) => (
          <NumberBall key={n} number={n} state="selected" size="sm" lotterySlug={lotterySlug} />
        ))}
      </div>
    )
  }

  if (extra.kind === 'MONTH') {
    const name = MONTH_NAMES[extra.month - 1] ?? String(extra.month)
    return (
      <span className="text-xs text-ink-600">
        Mês da Sorte: <strong className="font-medium text-ink-900">{name}</strong>
      </span>
    )
  }

  return (
    <span className="text-xs text-ink-600">
      Time do Coração: <strong className="font-medium text-ink-900">{extra.teamId}</strong>
    </span>
  )
}

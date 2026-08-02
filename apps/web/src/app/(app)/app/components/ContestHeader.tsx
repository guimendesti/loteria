import { Badge } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'

export interface ContestHeaderProps {
  lotterySlug: LotterySlug
  contestFrom: number
  contestTo: number
  /** Data do sorteio do concurso `contestFrom`, quando já apurado. */
  drawDate?: Date | null
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

/** Header de agrupamento "Concurso 3040 · sorteio 03/08" (docs/08 CL-11). */
export function ContestHeader({ lotterySlug, contestFrom, contestTo, drawDate }: ContestHeaderProps) {
  const range = contestTo > contestFrom ? `Concursos ${contestFrom}–${contestTo}` : `Concurso ${contestFrom}`

  return (
    <div className="mb-2 mt-6 flex items-center gap-2 first:mt-0">
      <Badge lotterySlug={lotterySlug} />
      <h2 className="font-display text-base font-semibold text-ink-900">
        {range}
        {drawDate ? (
          <span className="ml-1 font-normal text-ink-600">· sorteio {dateFormatter.format(drawDate)}</span>
        ) : null}
      </h2>
    </div>
  )
}

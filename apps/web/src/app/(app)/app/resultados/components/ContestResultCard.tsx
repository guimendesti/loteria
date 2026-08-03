import Link from 'next/link'
import { NumberBall, Badge } from '@lotopro/ui'
import type { NumberBallSize } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'
import { MONTH_NAMES } from '../../components/labels'
import { formatCents } from '../../components/format-cents'
import { parseExtraResult } from '../lib/parse-extra-result'

type RouterOutputs = inferRouterOutputs<AppRouter>
/** Mesmo `contestSelect` alimenta `contests.latest` e `contests.byNumber` (server/routers/contests.ts). */
export type ContestData = RouterOutputs['contests']['byNumber']['contest']

export interface ContestResultCardProps {
  lotterySlug: LotterySlug
  contest: ContestData
  numberBallSize?: NumberBallSize
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * C3 — ContestResultCard (docs/09-design-system-e-ux.md §9.3): modalidade,
 * nº do concurso, data, dezenas sorteadas, premiação por faixa (tabela
 * compacta), valor acumulado, botão "conferir meus jogos" (docs/08 CL-70).
 */
export function ContestResultCard({ lotterySlug, contest, numberBallSize = 'md' }: ContestResultCardProps) {
  const extra = parseExtraResult(contest.extraResult)
  const sortedPrizes = [...contest.prizes].sort((a, b) => a.tier - b.tier)
  const hasSecondaryDraw = contest.secondaryNumbers.length > 0
  const nextEstimateCents = contest.estimatedNextCents ?? contest.accumulatedNextCents

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge lotterySlug={lotterySlug} />
          <span className="text-sm font-medium text-ink-900">
            Concurso {contest.number} · {dateFormatter.format(new Date(contest.drawDate))}
          </span>
        </div>
        {contest.isAccumulated ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Acumulou</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {contest.numbers.map((n) => (
          <NumberBall key={n} number={n} state="drawn" size={numberBallSize} lotterySlug={lotterySlug} />
        ))}
      </div>

      {hasSecondaryDraw ? (
        <div className="mt-2">
          <p className="text-xs text-ink-600">2º sorteio</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {contest.secondaryNumbers.map((n) => (
              <NumberBall key={n} number={n} state="drawn" size={numberBallSize} lotterySlug={lotterySlug} />
            ))}
          </div>
        </div>
      ) : null}

      {extra ? (
        <p className="mt-2 text-xs text-ink-600">
          {extra.kind === 'CLOVER'
            ? `Trevos: ${extra.clovers.join(', ')}`
            : extra.kind === 'MONTH'
              ? `Mês da Sorte: ${MONTH_NAMES[extra.month - 1] ?? extra.month}`
              : `Time do Coração: ${extra.teamName}`}
        </p>
      ) : null}

      {contest.isAccumulated && nextEstimateCents !== null ? (
        <div className="mt-3 rounded-md bg-warning/10 p-3 text-sm text-warning">
          Estimativa do próximo concurso: {formatCents(nextEstimateCents)}
        </div>
      ) : null}

      {sortedPrizes.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-400">
                <th className="pb-1 font-normal">Faixa</th>
                <th className="pb-1 font-normal">Ganhadores</th>
                <th className="pb-1 text-right font-normal">Prêmio</th>
              </tr>
            </thead>
            <tbody>
              {sortedPrizes.map((prize) => (
                <tr key={prize.id} className="border-t border-ink-200">
                  <td className="py-1 text-ink-900">{prize.label}</td>
                  <td className="py-1 text-ink-900">
                    {prize.winnersCount === 0 ? 'Nenhum' : prize.winnersCount}
                  </td>
                  <td className="py-1 text-right font-medium text-ink-900">{formatCents(prize.prizeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-600">Premiação ainda não publicada para este concurso.</p>
      )}

      <div className="mt-3 border-t border-ink-200 pt-3">
        {/*
         * docs/08 CL-70 — "conferir meus jogos deste concurso". A listagem
         * (`/app/jogos`) ainda não lê `?concurso=` (só `?lotterySlug=`, ver
         * `apps/web/src/app/(app)/app/jogos/page.tsx`) — fora do território
         * desta tarefa (`jogos/*` é de outro agente). Link já fica correto
         * para quando isso for cabeado; por ora abre a listagem filtrada só
         * pela modalidade. Pendência anotada no relatório.
         */}
        <Link
          href={`/app/jogos?lotterySlug=${lotterySlug}&concurso=${contest.number}`}
          className="text-sm font-medium text-brand-500 hover:text-brand-700"
        >
          Conferir meus jogos deste concurso →
        </Link>
      </div>
    </div>
  )
}

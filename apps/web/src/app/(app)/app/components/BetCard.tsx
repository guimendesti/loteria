'use client'

import Link from 'next/link'
import { useState } from 'react'
import { NumberBall, Badge } from '@lotopro/ui'
import { getLotteryConfig, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { parseColumns, parseExtraPicks } from '@/server/lib/bet-json'
import { formatCents } from './format-cents'
import { ExtraPicksDisplay } from './ExtraPicksDisplay'
import { DuplicateBetDialog } from './DuplicateBetDialog'
import { BetPoolBadge } from './BetPoolBadge'
import { SOURCE_LABEL } from './labels'
import type { BetCheckItem, BetListItem } from './types'

export interface BetCardProps {
  bet: BetListItem
}

function pickLatestCheck(checks: BetCheckItem[]): BetCheckItem | undefined {
  return checks.reduce<BetCheckItem | undefined>((latest, check) => {
    if (!latest || check.contestNumber > latest.contestNumber) return check
    return latest
  }, undefined)
}

/**
 * C4 — BetCard (docs/09 §9.3): dezenas, modalidade, faixa de concursos,
 * custo, status (aguardando/conferido/premiado), origem, ações.
 */
export function BetCard({ bet }: BetCardProps) {
  const [showDuplicate, setShowDuplicate] = useState(false)
  const lotterySlug = bet.lottery.slug as LotterySlug
  const config = getLotteryConfig(lotterySlug)
  const extra = parseExtraPicks(bet.extraPicks)
  const columns = parseColumns(bet.columns)

  const latestCheck = pickLatestCheck(bet.checks)

  // BetCheck não expõe `hitNumbers` na API (ver checkSelect em
  // apps/web/src/server/routers/bets.ts) — só o agregado `hits`. Para
  // colorir hit/missed dezena-a-dezena (CL-22), buscamos as dezenas
  // sorteadas do concurso mais recente conferido e cruzamos aqui.
  const contestQuery = trpc.contests.byNumber.useQuery(
    { lotterySlug, number: latestCheck?.contestNumber ?? 1 },
    { enabled: latestCheck !== undefined, retry: false },
  )

  const drawnNumbers =
    latestCheck && contestQuery.data
      ? latestCheck.drawIndex === 2
        ? contestQuery.data.contest.secondaryNumbers
        : contestQuery.data.contest.numbers
      : []
  const drawnSet = new Set(drawnNumbers)

  const utils = trpc.useUtils()
  const archiveMutation = trpc.bets.archive.useMutation({
    onSuccess: () => {
      utils.bets.list.invalidate()
      utils.bets.summary.invalidate()
    },
  })

  const contestCount = bet.contestTo - bet.contestFrom + 1
  const status: 'premiado' | 'conferido' | 'aguardando' = bet.isPrized
    ? 'premiado'
    : bet.checks.length > 0
      ? 'conferido'
      : 'aguardando'

  const statusStyle: Record<typeof status, string> = {
    premiado: 'bg-success/10 text-success',
    conferido: 'bg-info/10 text-info',
    aguardando: 'bg-ink-50 text-ink-600',
  }
  const statusLabel: Record<typeof status, string> = {
    premiado: 'Premiado',
    conferido: 'Conferido',
    aguardando: 'Aguardando sorteio',
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge lotterySlug={lotterySlug} />
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-600">
            {SOURCE_LABEL[bet.source]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[status]}`}>
            {statusLabel[status]}
          </span>
          {!bet.isActive ? (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-400">Arquivado</span>
          ) : null}
          <BetPoolBadge pool={bet.pool} />
        </div>
        <Link href={`/app/jogos/${bet.id}`} className="text-sm font-medium text-brand-500 hover:text-brand-700">
          Ver detalhes →
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {config.format === 'PICK_N' ? (
          bet.numbers.map((n) => {
            const state = latestCheck && contestQuery.data ? (drawnSet.has(n) ? 'hit' : 'missed') : 'selected'
            return <NumberBall key={n} number={n} state={state} size="sm" lotterySlug={lotterySlug} />
          })
        ) : (
          <span className="text-sm text-ink-600">{columns?.length ?? 0} colunas marcadas</span>
        )}
      </div>

      <div className="mt-2">
        <ExtraPicksDisplay extra={extra} lotterySlug={lotterySlug} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-600">
          {contestCount > 1 ? `Concursos ${bet.contestFrom}–${bet.contestTo}` : `Concurso ${bet.contestFrom}`}
        </span>
        <span className="font-display font-semibold text-ink-900">{formatCents(bet.costCents)}</span>
      </div>

      {bet.isPrized ? (
        <p className="mt-1 text-sm font-semibold text-success">Prêmio total: {formatCents(bet.totalPrizeCents)}</p>
      ) : null}

      {bet.notes ? <p className="mt-2 text-sm italic text-ink-600">&ldquo;{bet.notes}&rdquo;</p> : null}

      <div className="mt-3 flex items-center gap-3 border-t border-ink-200 pt-3 text-sm">
        {bet.isActive ? (
          <button
            type="button"
            onClick={() => archiveMutation.mutate({ id: bet.id })}
            disabled={archiveMutation.isPending}
            className="font-medium text-ink-600 hover:text-danger"
          >
            {archiveMutation.isPending ? 'Arquivando…' : 'Arquivar'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowDuplicate(true)}
          className="font-medium text-ink-600 hover:text-brand-700"
        >
          Duplicar
        </button>
      </div>

      {showDuplicate ? (
        <DuplicateBetDialog
          betId={bet.id}
          currentContestFrom={bet.contestFrom}
          currentContestTo={bet.contestTo}
          onClose={() => setShowDuplicate(false)}
          onDuplicated={() => setShowDuplicate(false)}
        />
      ) : null}
    </div>
  )
}

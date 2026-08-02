'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { NumberBall, Badge } from '@lotopro/ui'
import { getLotteryConfig, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents } from './components/format-cents'
import { useCountdown, type Countdown } from './components/use-countdown'
import { nextDrawDateTime } from './components/next-draw'
import { EmptyState } from './components/EmptyState'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

function formatCountdown(countdown: Countdown | null): string {
  if (!countdown) return '—'
  if (countdown.isPast) return 'em apuração'
  if (countdown.days > 0) return `${countdown.days}d ${String(countdown.hours).padStart(2, '0')}h`
  return `${String(countdown.hours).padStart(2, '0')}h ${String(countdown.minutes).padStart(2, '0')}m`
}

/** CL-01..CL-04 — Dashboard real: resumo, próximo sorteio, últimos resultados. */
export default function DashboardPage() {
  const summaryQuery = trpc.bets.summary.useQuery()
  // limit:1 por modalidade → o resultado mais recente de cada uma; ordenamos
  // e cortamos em 5 no cliente para formar um feed cross-modalidade (CL-02).
  const resultsQuery = trpc.contests.latest.useQuery({ limit: 1 })

  const nextDraw = useMemo(() => {
    const candidates = (summaryQuery.data?.nextContestsByLottery ?? [])
      .map((entry) => {
        const config = getLotteryConfig(entry.lotterySlug as LotterySlug)
        const date = nextDrawDateTime(config)
        return date ? { ...entry, date } : null
      })
      .filter((entry): entry is { lotterySlug: string; lotteryName: string; nextContestNumber: number; date: Date } => entry !== null)
    candidates.sort((a, b) => a.date.getTime() - b.date.getTime())
    return candidates[0] ?? null
  }, [summaryQuery.data])

  const countdown = useCountdown(nextDraw?.date ?? null)

  const latestResults = useMemo(() => {
    const flat = (resultsQuery.data ?? []).flatMap((group) =>
      group.contests.map((contest) => ({ lotterySlug: group.lotterySlug, lotteryName: group.lotteryName, contest })),
    )
    flat.sort((a, b) => new Date(b.contest.drawDate).getTime() - new Date(a.contest.drawDate).getTime())
    return flat.slice(0, 5)
  }, [resultsQuery.data])

  const cards = [
    { label: 'Jogos ativos', value: summaryQuery.data ? String(summaryQuery.data.activeBetsCount) : '—' },
    {
      label: 'Próximo sorteio',
      value: nextDraw ? `${nextDraw.lotteryName} · ${formatCountdown(countdown)}` : 'Nenhum jogo ativo',
    },
    { label: 'Gasto do mês', value: summaryQuery.data ? formatCents(summaryQuery.data.monthSpendCents) : 'R$ 0,00' },
    { label: 'Prêmios do mês', value: summaryQuery.data ? formatCents(summaryQuery.data.monthPrizeCents) : 'R$ 0,00' },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Dashboard</h1>

      {summaryQuery.data && summaryQuery.data.activeBetsCount === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Cadastre seu primeiro jogo"
            description="Nunca mais esqueça de conferir — em menos de 3 minutos."
            actionHref="/app/jogos/novo"
            actionLabel="Cadastrar jogo"
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="text-sm text-ink-600">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">Últimos resultados</h2>
          <Link href="/app/jogos" className="text-sm font-medium text-brand-500 hover:text-brand-700">
            Conferir meus jogos →
          </Link>
        </div>

        {/*
         * Cruzar cada resultado com bets.list para destacar "você tinha jogo
         * aqui" (CL-02) seria caro nesta query (N modalidades × lookup de
         * apostas do usuário) — por ora só mostramos os resultados com um
         * link para a listagem. Otimização futura: view materializada
         * (lottery_id, contest_number) -> boolean "usuário tem jogo", ou
         * expor isso via bets.summary já com os últimos concursos batidos.
         */}
        {resultsQuery.isLoading ? (
          <p className="mt-3 text-sm text-ink-600">Carregando resultados…</p>
        ) : latestResults.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">Nenhum resultado publicado ainda.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {latestResults.map(({ lotterySlug, lotteryName, contest }) => (
              <div key={`${lotterySlug}-${contest.number}`} className="rounded-lg border border-ink-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge lotterySlug={lotterySlug as LotterySlug} />
                    <span className="text-sm font-medium text-ink-900">
                      Concurso {contest.number} · {dateFormatter.format(new Date(contest.drawDate))}
                    </span>
                  </div>
                  {contest.isAccumulated ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                      Acumulou
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {contest.numbers.map((n) => (
                    <NumberBall key={n} number={n} state="drawn" size="sm" lotterySlug={lotterySlug as LotterySlug} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-ink-200 p-6 text-sm text-ink-400">
        Bolões ativos (CL-04) — módulo de bolões ainda não implementado nesta fase.
      </div>
    </div>
  )
}

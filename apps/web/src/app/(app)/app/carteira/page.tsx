'use client'

import Link from 'next/link'
import { useState } from 'react'
import { lotteryColors } from '@lotopro/ui'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents } from '../components/format-cents'
import { EmptyState } from '../components/EmptyState'
import { MonthlyChart } from './components/MonthlyChart'

/** Mesmo filtro de `jogos/page.tsx`: só modalidades com tabela de preço (Federal não é apostável pelo motor). */
const BETTABLE_LOTTERIES = ALL_LOTTERIES.filter((lottery) => lottery.priceTiers.length > 0)

type Period = 'month' | 'year' | 'all'

const PERIOD_LABEL: Record<Period, string> = {
  month: 'Mês atual',
  year: 'Este ano',
  all: 'Tudo',
}

/** Honesto, mas sem tom punitivo (docs/04 D6): explica o sinal, não o dramatiza. */
function roiNote(roiPct: number | null): string {
  if (roiPct === null) return 'Sem gastos registrados neste período.'
  if (roiPct > 0) return 'Você recebeu mais do que gastou neste período.'
  if (roiPct === 0) return 'Você recebeu exatamente o que gastou neste período.'
  return 'Você recebeu menos do que gastou neste período — normal em loterias.'
}

function formatRoiPct(roiPct: number | null): string {
  if (roiPct === null) return '—'
  const sign = roiPct > 0 ? '+' : ''
  return `${sign}${roiPct.toFixed(1)}%`
}

/** CL-90..93 — Carteira: gasto/prêmio/ROI do período + evolução mensal. */
export default function CarteiraPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [lotterySlug, setLotterySlug] = useState<LotterySlug | null>(null)

  const overviewQuery = trpc.wallet.overview.useQuery({
    period,
    ...(lotterySlug ? { lotterySlug } : {}),
  })
  const monthlyQuery = trpc.wallet.monthly.useQuery({ months: 12 })

  const overview = overviewQuery.data
  const isEmptyPeriod = overviewQuery.isSuccess && overview !== undefined && overview.betCount === 0

  const cards = [
    {
      label: 'Gasto no período',
      value: overview ? formatCents(overview.spentCents) : '—',
      note: overview ? `${overview.betCount} jogo${overview.betCount === 1 ? '' : 's'} cadastrado${overview.betCount === 1 ? '' : 's'}` : undefined,
    },
    {
      label: 'Prêmios recebidos',
      value: overview ? formatCents(overview.prizeCents) : '—',
      note: overview
        ? `${overview.prizedCount} conferência${overview.prizedCount === 1 ? '' : 's'} premiada${overview.prizedCount === 1 ? '' : 's'}`
        : undefined,
    },
    {
      label: 'ROI do período',
      value: overview ? formatRoiPct(overview.roiPct) : '—',
      note: overview ? roiNote(overview.roiPct) : undefined,
    },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Carteira</h1>

      {/* R3 — jogo responsável: nota fixa, sem eufemismo e sem tom punitivo. */}
      <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
        Loterias são jogos de azar; o retorno esperado é negativo. Use esta tela para controlar seu orçamento.
      </div>

      {/* Filtros: período + modalidade. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(['month', 'year', 'all'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              period === p ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-600'
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLotterySlug(null)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            lotterySlug === null ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-600'
          }`}
        >
          Todas as modalidades
        </button>
        {BETTABLE_LOTTERIES.map((lottery) => (
          <button
            key={lottery.slug}
            type="button"
            onClick={() => setLotterySlug(lottery.slug)}
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={
              lotterySlug === lottery.slug
                ? { backgroundColor: lotteryColors[lottery.slug], color: '#FFFFFF' }
                : { border: '1px solid var(--ink-200)', color: 'var(--ink-600)', backgroundColor: '#FFFFFF' }
            }
          >
            {lottery.name}
          </button>
        ))}
      </div>

      {/* Cards de resumo (CL-90/91/92). */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="text-sm text-ink-600">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">
              {overviewQuery.isLoading ? '…' : card.value}
            </p>
            {card.note ? <p className="mt-1 text-xs text-ink-600">{card.note}</p> : null}
          </div>
        ))}
      </div>

      {isEmptyPeriod ? (
        <div className="mt-6">
          <EmptyState
            title="Nenhum jogo neste período"
            description="Ajuste o período ou a modalidade acima, ou cadastre seu primeiro jogo."
            actionHref="/app/jogos/novo"
            actionLabel="Cadastrar jogo"
          />
        </div>
      ) : null}

      {/* Evolução mensal (CL-93). */}
      <div className="mt-8 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Evolução mensal</h2>
        <p className="mt-1 text-sm text-ink-600">Gasto e prêmios dos últimos 12 meses, mês a mês.</p>

        {monthlyQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : (
          <div className="mt-4">
            <MonthlyChart data={monthlyQuery.data ?? []} />
          </div>
        )}
      </div>

      <div className="mt-6 text-sm text-ink-600">
        <Link href="/app/jogos" className="font-medium text-brand-500 hover:text-brand-700">
          Ver meus jogos →
        </Link>
      </div>
    </div>
  )
}

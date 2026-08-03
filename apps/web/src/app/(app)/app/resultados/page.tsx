'use client'

import { useState } from 'react'
import { lotteryColors } from '@lotopro/ui'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { ContestResultCard } from './components/ContestResultCard'
import { ContestSearchForm } from './components/ContestSearchForm'

const LOTTERY_OPTIONS = ALL_LOTTERIES.map((lottery) => ({ slug: lottery.slug, name: lottery.name }))

/**
 * CL-70/71 — Resultados: feed dos últimos concursos (1 por modalidade sem
 * filtro, histórico de 10 com uma modalidade selecionada) + busca por número
 * de concurso (CL-71 também cita busca por data — não implementada nesta
 * tarefa, ver relatório).
 */
export default function ResultadosPage() {
  const [lotterySlug, setLotterySlug] = useState<LotterySlug | null>(null)

  const resultsQuery = trpc.contests.latest.useQuery({
    ...(lotterySlug ? { lotterySlug } : {}),
    limit: lotterySlug ? 10 : 1,
  })

  const groups = resultsQuery.data ?? []
  const isEmpty = !resultsQuery.isLoading && groups.every((group) => group.contests.length === 0)

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Resultados</h1>

      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-ink-900">Buscar concurso</p>
        <ContestSearchForm
          lotteries={LOTTERY_OPTIONS}
          {...(lotterySlug ? { defaultLotterySlug: lotterySlug } : {})}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLotterySlug(null)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            lotterySlug === null ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-600'
          }`}
        >
          Todas
        </button>
        {LOTTERY_OPTIONS.map((lottery) => (
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

      <div className="mt-4">
        {resultsQuery.isLoading ? (
          <p className="text-sm text-ink-600">Carregando resultados…</p>
        ) : isEmpty ? (
          <p className="mt-8 text-center text-sm text-ink-600">Nenhum resultado publicado ainda.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.flatMap((group) =>
              group.contests.map((contest) => (
                <ContestResultCard
                  key={`${group.lotterySlug}-${contest.number}`}
                  lotterySlug={group.lotterySlug as LotterySlug}
                  contest={contest}
                />
              )),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

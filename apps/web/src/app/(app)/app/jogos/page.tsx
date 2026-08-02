'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import { lotteryColors } from '@lotopro/ui'
import { trpc } from '@/lib/trpc'
import { BetCard } from '../components/BetCard'
import { ContestHeader } from '../components/ContestHeader'
import { EmptyState } from '../components/EmptyState'
import { ToastBanner } from '../components/ToastBanner'
import type { BetListItem } from '../components/types'

type StatusFilter = 'all' | 'active' | 'finished'
type PrizedFilter = 'all' | 'prized' | 'not-prized'

/** Apenas modalidades apostáveis pelo motor (Federal não tem tabela de preço — packages/core/src/lottery/configs.ts). */
const BETTABLE_LOTTERIES = ALL_LOTTERIES.filter((lottery) => lottery.priceTiers.length > 0)

interface Group {
  lotterySlug: LotterySlug
  contestFrom: number
  contestTo: number
  drawDate: Date | null
  bets: BetListItem[]
}

/** CL-10/CL-11 — Meus Jogos: filtros + agrupamento por concurso/modalidade. */
export default function JogosPage() {
  const [lotterySlug, setLotterySlug] = useState<LotterySlug | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [prized, setPrized] = useState<PrizedFilter>('all')

  // Filtro inicial vindo do dashboard ("conferir meus jogos" de uma modalidade
  // específica) — lido via window.location em vez de useSearchParams para não
  // exigir um Suspense boundary só por causa de um deep-link opcional.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initial = params.get('lotterySlug')
    if (initial && BETTABLE_LOTTERIES.some((lottery) => lottery.slug === initial)) {
      setLotterySlug(initial as LotterySlug)
    }
  }, [])

  const query = trpc.bets.list.useInfiniteQuery(
    {
      ...(lotterySlug ? { lotterySlug } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(prized !== 'all' ? { prized: prized === 'prized' } : {}),
      limit: 20,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  )

  const items: BetListItem[] = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>()
    for (const bet of items) {
      const slug = bet.lottery.slug as LotterySlug
      const key = `${slug}-${bet.contestFrom}`
      const existing = map.get(key)
      if (existing) {
        existing.bets.push(bet)
        existing.contestTo = Math.max(existing.contestTo, bet.contestTo)
      } else {
        const matchingCheck = bet.checks.find((check) => check.contestNumber === bet.contestFrom)
        map.set(key, {
          lotterySlug: slug,
          contestFrom: bet.contestFrom,
          contestTo: bet.contestTo,
          drawDate: matchingCheck?.drawDate ?? null,
          bets: [bet],
        })
      }
    }
    return [...map.values()]
  }, [items])

  const hasFilters = lotterySlug !== null || status !== 'all' || prized !== 'all'
  const isEmpty = !query.isLoading && items.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900">Meus Jogos</h1>
        <Link
          href="/app/jogos/novo"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Novo jogo
        </Link>
      </div>

      <ToastBanner />

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

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="finished">Encerrados</option>
        </select>
        <select
          value={prized}
          onChange={(event) => setPrized(event.target.value as PrizedFilter)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="all">Premiados e não premiados</option>
          <option value="prized">Só premiados</option>
          <option value="not-prized">Só não premiados</option>
        </select>
      </div>

      <div className="mt-2">
        {query.isLoading ? (
          <p className="mt-8 text-sm text-ink-600">Carregando seus jogos…</p>
        ) : isEmpty ? (
          hasFilters ? (
            <p className="mt-8 text-center text-sm text-ink-600">Nenhum jogo encontrado com esses filtros.</p>
          ) : (
            <div className="mt-8">
              <EmptyState
                title="Nenhum jogo cadastrado ainda"
                description="Cadastre seu primeiro jogo e nunca mais esqueça de conferir."
                actionHref="/app/jogos/novo"
                actionLabel="Cadastrar jogo"
              />
            </div>
          )
        ) : (
          groups.map((group) => (
            <div key={`${group.lotterySlug}-${group.contestFrom}`}>
              <ContestHeader
                lotterySlug={group.lotterySlug}
                contestFrom={group.contestFrom}
                contestTo={group.contestTo}
                drawDate={group.drawDate}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.bets.map((bet) => (
                  <BetCard key={bet.id} bet={bet} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {query.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

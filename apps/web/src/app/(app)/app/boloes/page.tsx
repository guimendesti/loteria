'use client'

import Link from 'next/link'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { EmptyState } from '@/app/(app)/app/components/EmptyState'
import { ToastBanner } from '@/app/(app)/app/components/ToastBanner'
import { LegalBanner } from '@/components/pool/LegalBanner'
import { PoolCard } from '@/components/pool/PoolCard'
import type { PoolListScope, PoolStatus } from '@/components/pool/types'

const TABS: { value: PoolListScope; label: string }[] = [
  { value: 'organizing', label: 'Organizando' },
  { value: 'participating', label: 'Participando' },
]

const STATUS_OPTIONS: { value: PoolStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'OPEN', label: 'Aberto' },
  { value: 'CLOSED', label: 'Fechado' },
  { value: 'BET_PLACED', label: 'Aposta registrada' },
  { value: 'SETTLED', label: 'Encerrado' },
  { value: 'CANCELED', label: 'Cancelado' },
]

/** CL-44/CL-60 — lista de bolões, abas Organizando/Participando (docs/08 §C.4). */
export default function BoloesPage() {
  const [scope, setScope] = useState<PoolListScope>('organizing')
  const [status, setStatus] = useState<PoolStatus | 'all'>('all')

  const query = trpc.pool.list.useQuery({ scope, ...(status !== 'all' ? { status } : {}) })

  const isEmpty = !query.isLoading && (query.data?.length ?? 0) === 0
  const hasFilter = status !== 'all'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900">Bolões</h1>
        <Link
          href="/app/boloes/novo"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Novo bolão
        </Link>
      </div>

      <ToastBanner />
      <LegalBanner />

      <div role="tablist" aria-label="Filtrar bolões por participação" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={scope === tab.value}
            onClick={() => setScope(tab.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              scope === tab.value ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="sr-only" htmlFor="pool-status-filter">
          Filtrar por status
        </label>
        <select
          id="pool-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as PoolStatus | 'all')}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <p className="text-sm text-ink-600">Carregando seus bolões…</p>
        ) : query.isError ? (
          <p className="text-sm text-danger">Não foi possível carregar seus bolões. Tente novamente.</p>
        ) : isEmpty ? (
          hasFilter ? (
            <p className="mt-8 text-center text-sm text-ink-600">Nenhum bolão encontrado com esse filtro.</p>
          ) : (
            <EmptyState
              title={
                scope === 'organizing'
                  ? 'Você ainda não organiza nenhum bolão'
                  : 'Você ainda não participa de nenhum bolão'
              }
              description="Organize seu bolão sem planilha e sem confusão — convite por link, Pix direto com você, comprovante e rateio automático."
              actionHref="/app/boloes/novo"
              actionLabel="Criar bolão"
            />
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {query.data?.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
          </div>
        )}
      </div>
    </div>
  )
}

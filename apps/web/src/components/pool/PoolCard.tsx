'use client'

import Link from 'next/link'
import { Badge } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { ShareProgressBar } from './ShareProgressBar'
import { PoolStatusBadge } from './StatusBadges'
import type { PoolCard as PoolCardData } from './types'

/**
 * C5 (docs/09 §9.4) — cartão de bolão: modalidade, concursos, barra de cotas,
 * valor da cota e — só para o dono — badge de pendências de pagamento.
 * ⚠️ O contrato `PoolCard` não traz nome/avatar do organizador (só existe
 * `role`), então na aba "Participando" o card não identifica quem organiza —
 * ver observações no relatório do agente pool-ui.
 */
export function PoolCard({ pool }: { pool: PoolCardData }) {
  const contestLabel =
    pool.contestFrom === pool.contestTo ? `Concurso ${pool.contestFrom}` : `Concursos ${pool.contestFrom}–${pool.contestTo}`

  return (
    <Link
      href={`/app/boloes/${pool.id}`}
      className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-white p-4 hover:border-brand-500"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge lotterySlug={pool.lottery.slug as LotterySlug} />
          <PoolStatusBadge status={pool.status} />
        </div>
        {pool.role === 'OWNER' && pool.pendingPayments !== null && pool.pendingPayments > 0 ? (
          <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
            {pool.pendingPayments} pendência{pool.pendingPayments > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      <div>
        <p className="font-display text-lg font-semibold text-ink-900">{pool.name}</p>
        <p className="text-sm text-ink-600">{contestLabel}</p>
      </div>

      <ShareProgressBar sharesTaken={pool.sharesTaken} totalShares={pool.totalShares} />

      <p className="text-sm text-ink-900">
        Cota: <span className="font-semibold">{formatCents(pool.shareValueCents)}</span>
      </p>
    </Link>
  )
}

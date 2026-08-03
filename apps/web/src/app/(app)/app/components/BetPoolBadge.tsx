import { PoolStatusBadge } from '@/components/pool/StatusBadges'
import type { PoolStatus } from '@/components/pool/types'

export interface BetPoolBadgeProps {
  pool: { id: string; name: string; status: PoolStatus } | null
}

/**
 * Onda 8b (docs/contracts/onda8-bolao.md) — indicador visual de que um jogo já
 * pertence a um bolão, com o status do bolão junto (ex.: "congelado" fica óbvio
 * quando `status` é BET_PLACED em diante). `pool: null` → não renderiza nada.
 */
export function BetPoolBadge({ pool }: BetPoolBadgeProps) {
  if (!pool) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        Bolão: {pool.name}
      </span>
      <PoolStatusBadge status={pool.status} />
    </span>
  )
}

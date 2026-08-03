'use client'

import type { LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'

/**
 * Estados em que o dono ainda pode mudar quais jogos pertencem ao bolão — espelha
 * `EDITABLE_POOL_STATUSES` de `server/lib/bet-pool.ts` (não importável aqui: aquele
 * módulo puxa `@lotopro/db`, que carrega o runtime do Prisma Client e não deve
 * entrar no bundle do navegador — mesma decisão já tomada em
 * `@/components/pool/types.ts` para os enums do bolão).
 */
export const EDITABLE_POOL_STATUSES: readonly string[] = ['DRAFT', 'OPEN', 'CLOSED']

export interface PoolLinkSelectProps {
  value: string | null
  onChange: (poolId: string | null) => void
  /** Quando informado, só lista bolões da mesma modalidade — evita mostrar uma opção que o servidor recusaria. */
  lotterySlug?: LotterySlug
  disabled?: boolean
}

/**
 * Onda 8b (docs/contracts/onda8-bolao.md) — seletor "a qual bolão este jogo
 * pertence?". Só lista bolões que o usuário ORGANIZA (participante não vincula
 * jogos — regra de negócio) e que ainda estão em estado editável (DRAFT/OPEN/
 * CLOSED — a partir de BET_PLACED o vínculo está congelado; `bets.assignPool`/
 * `bets.create` também recusam no servidor, isto é só para não oferecer uma
 * opção que vai bater erro).
 */
export function PoolLinkSelect({ value, onChange, lotterySlug, disabled }: PoolLinkSelectProps) {
  const poolsQuery = trpc.pool.list.useQuery({ scope: 'organizing' })

  const options = (poolsQuery.data ?? []).filter(
    (pool) =>
      EDITABLE_POOL_STATUSES.includes(pool.status) && (lotterySlug === undefined || pool.lottery.slug === lotterySlug),
  )

  return (
    <label className="block text-sm font-medium text-ink-900">
      Vincular a um bolão (opcional)
      <select
        value={value ?? ''}
        disabled={disabled === true || poolsQuery.isLoading}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-base disabled:opacity-60"
      >
        <option value="">Nenhum — jogo pessoal</option>
        {options.map((pool) => (
          <option key={pool.id} value={pool.id}>
            {pool.name} (
            {pool.contestFrom === pool.contestTo
              ? `concurso ${pool.contestFrom}`
              : `concursos ${pool.contestFrom}–${pool.contestTo}`}
            )
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-ink-400">
        {poolsQuery.isLoading
          ? 'Carregando seus bolões…'
          : options.length === 0
            ? 'Nenhum bolão seu está aceitando mudança de jogos no momento.'
            : 'Só bolões que você organiza e que ainda aceitam mudança de jogos aparecem aqui.'}
      </span>
    </label>
  )
}

'use client'

import { trpc } from '@/lib/trpc'
import { formatCents } from '@/app/(app)/app/components/format-cents'

export interface PoolLinkedBetsPanelProps {
  poolId: string
}

function absBigint(value: bigint): bigint {
  return value < 0n ? -value : value
}

/**
 * Addendum v2 §5 — `bets.byPool` (agente H): jogos vinculados ao bolão + comparação entre
 * a soma dos custos deles e `totalCostCents` (o custo declarado na criação do bolão, base
 * do valor de cota que os participantes já pagaram). Só o dono vê esta consolidação
 * financeira — a query já garante isso no servidor (`FORBIDDEN` para quem não é dono).
 *
 * Quando `matchesDeclaredCost` é falso, isso é um alerta importante — não um erro do
 * sistema: o servidor não corrige nada sozinho, só torna a divergência visível para o
 * organizador decidir (jogo esquecido, jogo a mais, custo declarado errado na criação…).
 */
export function PoolLinkedBetsPanel({ poolId }: PoolLinkedBetsPanelProps) {
  const query = trpc.bets.byPool.useQuery({ poolId })

  if (query.isLoading) {
    return <p className="text-sm text-ink-600">Carregando jogos vinculados a este bolão…</p>
  }

  if (query.isError) {
    return <p className="text-sm text-danger">Não foi possível carregar os jogos vinculados a este bolão.</p>
  }

  const data = query.data
  if (!data || data.betCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-white p-4 text-sm text-ink-600">
        Nenhum jogo vinculado a este bolão ainda.
      </div>
    )
  }

  const diffOver = data.costDiffCents > 0n

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Jogos vinculados</h2>

      {!data.matchesDeclaredCost ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <span aria-hidden="true" className="mt-0.5 text-base">
            ⚠️
          </span>
          <div className="text-sm text-ink-900">
            <p className="font-semibold text-warning">Divergência entre os jogos e o custo declarado</p>
            <p className="mt-1">
              A soma dos jogos vinculados é {formatCents(data.linkedCostCents)}, {diffOver ? 'a mais' : 'a menos'} que
              os {formatCents(data.declaredCostCents)} declarados na criação do bolão — diferença de{' '}
              {formatCents(absBigint(data.costDiffCents))}. As cotas dos participantes já foram calculadas em cima do
              custo declarado, não da soma dos jogos. O LotoPro não ajusta nada sozinho — confira os jogos vinculados
              ou o valor declarado do bolão.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-success">Os jogos vinculados batem com o custo declarado do bolão.</p>
      )}

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {data.bets.map((bet) => (
          <li
            key={bet.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-200 px-3 py-2"
          >
            <span className="text-ink-900">
              {bet.lottery.name} · Concurso {bet.contestFrom}
              {bet.contestTo !== bet.contestFrom ? `–${bet.contestTo}` : ''} · {bet.numbers.join(', ')}
            </span>
            <span className="font-medium text-ink-900">{formatCents(bet.costCents)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-ink-600">
        Total dos jogos vinculados: <span className="font-semibold text-ink-900">{formatCents(data.linkedCostCents)}</span>
        {' · '}
        Custo declarado do bolão: <span className="font-semibold text-ink-900">{formatCents(data.declaredCostCents)}</span>
      </p>
    </div>
  )
}

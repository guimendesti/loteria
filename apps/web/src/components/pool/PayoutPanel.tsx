'use client'

import { useMemo, useState } from 'react'
import type { LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { formatShareRatioPercent } from './format-ratio'
import { PayoutStatusBadge } from './StatusBadges'

export interface PayoutPanelProps {
  poolId: string
  /** Só usados no modo dono (calcular rateio). Dispensável em `readOnly`. */
  lotterySlug?: LotterySlug
  bets?: { id: string; contestNumber: number }[]
  /** `true` para a visão do participante: só lista o rateio, sem ações. */
  readOnly?: boolean
}

/**
 * CL-49/CL-50/CL-60 — painel de rateio. `pool.payout.compute` e
 * `pool.payout.markPaid` são só do dono (contrato); `pool.payout.list` é
 * compartilhado. `contestId` não vem em `PoolDetail.bets` (só `contestNumber`)
 * — resolvido aqui via `contests.byNumber`, mesmo padrão já usado em
 * `app/jogos/[id]` para casar conferência com o concurso.
 *
 * ⚠️ `PayoutRow` (contrato) não traz `pixPayload` nem `memberId`: o dono não
 * tem, pela API documentada, como gerar o Pix de devolução (CL-50) direto
 * desta tela — ver observações no relatório do agente pool-ui.
 */
export function PayoutPanel({ poolId, lotterySlug, bets = [], readOnly = false }: PayoutPanelProps) {
  const contestNumbers = useMemo(() => [...new Set(bets.map((bet) => bet.contestNumber))].sort((a, b) => a - b), [bets])
  const [selectedContest, setSelectedContest] = useState<number | null>(contestNumbers[0] ?? null)
  const [lastComputed, setLastComputed] = useState<{ remainderCents: bigint; totalCents: bigint } | null>(null)

  const contestQuery = trpc.contests.byNumber.useQuery(
    { lotterySlug: lotterySlug as LotterySlug, number: selectedContest ?? 0 },
    { enabled: !readOnly && lotterySlug !== undefined && selectedContest !== null },
  )

  const utils = trpc.useUtils()
  const payoutListQuery = trpc.pool.payout.list.useQuery({ poolId })

  const compute = trpc.pool.payout.compute.useMutation({
    onSuccess: (result) => {
      setLastComputed({ remainderCents: result.remainderCents, totalCents: result.totalCents })
      utils.pool.payout.list.invalidate({ poolId })
    },
  })

  const markPaid = trpc.pool.payout.markPaid.useMutation({
    onSuccess: () => utils.pool.payout.list.invalidate({ poolId }),
  })

  const contestId = contestQuery.data?.contest.id ?? null
  const rows = payoutListQuery.data ?? []

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Rateio do prêmio</h2>
      <p className="mt-1 text-sm text-ink-600">
        O Pix de devolução é combinado direto com cada participante — o LotoPro só calcula quanto cabe a cada um.
      </p>

      {!readOnly ? (
        <>
          {contestNumbers.length > 1 ? (
            <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="payout-contest">
              Concurso
              <select
                id="payout-contest"
                value={selectedContest ?? ''}
                onChange={(event) => setSelectedContest(Number(event.target.value))}
                className="mt-1 w-full max-w-xs rounded-md border border-ink-200 px-3 py-2 text-base"
              >
                {contestNumbers.map((number) => (
                  <option key={number} value={number}>
                    Concurso {number}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            disabled={!contestId || compute.isPending}
            onClick={() => contestId && compute.mutate({ poolId, contestId })}
            className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {compute.isPending ? 'Calculando…' : 'Calcular rateio deste concurso'}
          </button>

          {compute.error ? <p className="mt-2 text-sm text-danger">{compute.error.message}</p> : null}

          {lastComputed ? (
            <p className="mt-2 text-sm text-ink-600">
              Prêmio total: {formatCents(lastComputed.totalCents)}. Sobra de arredondamento:{' '}
              {formatCents(lastComputed.remainderCents)} — fica com você, o organizador.
            </p>
          ) : null}
        </>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-ink-400">
                  <th className="pb-2 font-normal">Participante</th>
                  <th className="pb-2 font-normal">Concurso</th>
                  <th className="pb-2 font-normal">Cotas</th>
                  <th className="pb-2 font-normal">Valor</th>
                  <th className="pb-2 font-normal">Status</th>
                  {!readOnly ? <th className="pb-2 text-right font-normal">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-ink-200">
                    <td className="py-2 text-ink-900">{row.memberName}</td>
                    <td className="py-2 text-ink-900">{row.contestNumber}</td>
                    <td className="py-2 text-ink-900">{formatShareRatioPercent(row.sharesRatio)}</td>
                    <td className="py-2 font-medium text-ink-900">{formatCents(row.amountCents)}</td>
                    <td className="py-2">
                      <PayoutStatusBadge status={row.status} />
                    </td>
                    {!readOnly ? (
                      <td className="py-2 text-right">
                        {row.status === 'PENDING' ? (
                          <button
                            type="button"
                            onClick={() => markPaid.mutate({ payoutId: row.id })}
                            disabled={markPaid.isPending}
                            className="rounded-md border border-success/40 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-60"
                          >
                            Marcar como pago
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-ink-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-ink-900">{row.memberName}</p>
                  <PayoutStatusBadge status={row.status} />
                </div>
                <p className="mt-1 text-sm text-ink-600">
                  Concurso {row.contestNumber} · {formatShareRatioPercent(row.sharesRatio)} das cotas
                </p>
                <p className="mt-1 font-semibold text-ink-900">{formatCents(row.amountCents)}</p>
                {!readOnly && row.status === 'PENDING' ? (
                  <button
                    type="button"
                    onClick={() => markPaid.mutate({ payoutId: row.id })}
                    disabled={markPaid.isPending}
                    className="mt-2 w-full rounded-md border border-success/40 px-3 py-2 text-sm font-semibold text-success hover:bg-success/10 disabled:opacity-60"
                  >
                    Marcar como pago
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-600">Nenhum rateio calculado ainda.</p>
      )}
    </div>
  )
}

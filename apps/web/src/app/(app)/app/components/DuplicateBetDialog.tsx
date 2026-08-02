'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { MAX_CONTESTS_PER_BET } from './bet-cost-estimate'

export interface DuplicateBetDialogProps {
  betId: string
  currentContestFrom: number
  currentContestTo: number
  onClose: () => void
  onDuplicated: (newBetId: string) => void
}

/**
 * Modal "duplicar jogo para novo intervalo de concursos" (docs/08 CL-17,
 * CL-21). Reaproveita `bets.duplicate` (mesmas dezenas/extra/colunas,
 * intervalo novo) — usado tanto pela listagem quanto pelo detalhe.
 */
export function DuplicateBetDialog({
  betId,
  currentContestFrom,
  currentContestTo,
  onClose,
  onDuplicated,
}: DuplicateBetDialogProps) {
  const span = currentContestTo - currentContestFrom + 1
  const [contestFrom, setContestFrom] = useState(currentContestTo + 1)
  const [quantity, setQuantity] = useState(Math.min(span, MAX_CONTESTS_PER_BET))
  const contestTo = contestFrom + quantity - 1

  const utils = trpc.useUtils()
  const duplicate = trpc.bets.duplicate.useMutation({
    onSuccess: (newBet) => {
      utils.bets.list.invalidate()
      utils.bets.summary.invalidate()
      onDuplicated(newBet.id)
    },
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Duplicar jogo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-md">
        <h3 className="font-display text-lg font-semibold text-ink-900">Duplicar jogo</h3>
        <p className="mt-1 text-sm text-ink-600">Mesmas dezenas, novo intervalo de concursos.</p>

        <label className="mt-4 block text-sm font-medium text-ink-900">
          A partir do concurso
          <input
            type="number"
            min={1}
            value={contestFrom}
            onChange={(event) => setContestFrom(Math.max(1, Number(event.target.value) || 1))}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink-900">
          Quantidade de concursos
          <select
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          >
            {Array.from({ length: MAX_CONTESTS_PER_BET }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-2 text-sm text-ink-600">Valerá até o concurso {contestTo}.</p>

        {duplicate.error ? <p className="mt-2 text-sm text-danger">{duplicate.error.message}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate({ id: betId, contestFrom, contestTo })}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {duplicate.isPending ? 'Duplicando…' : 'Duplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}

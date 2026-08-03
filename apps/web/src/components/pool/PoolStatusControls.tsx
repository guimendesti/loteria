'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ConfirmDialog } from './ConfirmDialog'
import type { PoolStatus } from './types'

export interface PoolStatusControlsProps {
  poolId: string
  status: PoolStatus
  receiptUrl: string | null
  onChanged: () => void
}

/**
 * Máquina de estados do bolão (docs/contracts/onda8-bolao.md):
 * DRAFT -> OPEN -> CLOSED -> BET_PLACED -> SETTLED, com CANCELED a qualquer
 * momento antes de SETTLED. `BET_PLACED` exige `receiptUrl` — a transição
 * fica bloqueada no cliente até o comprovante ser anexado (o servidor também
 * bloqueia; isso é só para não deixar o usuário bater num erro evitável).
 *
 * `BET_PLACED -> SETTLED` é uma transição manual do dono, feita depois de
 * calcular o rateio (`server/lib/pool/state-machine.ts` permite esse par) —
 * o servidor não fecha o bolão sozinho quando o concurso é conferido.
 */
export function PoolStatusControls({ poolId, status, receiptUrl, onChanged }: PoolStatusControlsProps) {
  const [receiptDraft, setReceiptDraft] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const updateStatus = trpc.pool.updateStatus.useMutation({ onSuccess: onChanged })
  const attachReceipt = trpc.pool.attachReceipt.useMutation({
    onSuccess: () => {
      setReceiptDraft('')
      onChanged()
    },
  })

  const busy = updateStatus.isPending || attachReceipt.isPending
  const error = updateStatus.error ?? attachReceipt.error

  function advance(next: PoolStatus) {
    updateStatus.mutate({ poolId, status: next })
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Andamento do bolão</h2>

      {error ? <p className="mt-2 text-sm text-danger">{error.message}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'DRAFT' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => advance('OPEN')}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {updateStatus.isPending ? 'Publicando…' : 'Publicar bolão'}
          </button>
        ) : null}

        {status === 'OPEN' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => advance('CLOSED')}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {updateStatus.isPending ? 'Encerrando…' : 'Encerrar entradas'}
          </button>
        ) : null}

        {status !== 'CANCELED' && status !== 'SETTLED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowCancelConfirm(true)}
            className="rounded-md border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Cancelar bolão
          </button>
        ) : null}
      </div>

      {status === 'CLOSED' ? (
        <div className="mt-4 border-t border-ink-200 pt-4">
          <p className="text-sm font-medium text-ink-900">Comprovante oficial da aposta</p>
          <p className="mt-1 text-sm text-ink-600">
            Obrigatório antes de marcar a aposta como registrada — é o que dá confiança a quem participa (CL-48).
          </p>

          {receiptUrl ? (
            <p className="mt-2 text-sm text-success">
              Comprovante anexado.{' '}
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="underline">
                Ver
              </a>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="receipt-url">
                Link do comprovante
              </label>
              <input
                id="receipt-url"
                type="url"
                value={receiptDraft}
                onChange={(event) => setReceiptDraft(event.target.value)}
                placeholder="https://..."
                className="min-w-0 flex-1 rounded-md border border-ink-200 px-3 py-2 text-base"
              />
              <button
                type="button"
                disabled={busy || receiptDraft.trim() === ''}
                onClick={() => attachReceipt.mutate({ poolId, receiptUrl: receiptDraft.trim() })}
                className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50 disabled:opacity-60"
              >
                {attachReceipt.isPending ? 'Anexando…' : 'Anexar comprovante'}
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={busy || !receiptUrl}
            onClick={() => advance('BET_PLACED')}
            className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {updateStatus.isPending ? 'Registrando…' : 'Marcar aposta como registrada'}
          </button>
        </div>
      ) : null}

      {status === 'BET_PLACED' ? (
        <div className="mt-3 border-t border-ink-200 pt-4">
          <p className="text-sm text-ink-600">
            Depois que o concurso for conferido, calcule o rateio abaixo e marque o bolão como encerrado.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => advance('SETTLED')}
            className="mt-2 rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50 disabled:opacity-60"
          >
            {updateStatus.isPending ? 'Encerrando…' : 'Marcar bolão como encerrado'}
          </button>
        </div>
      ) : null}

      {status === 'SETTLED' ? (
        <p className="mt-3 text-sm text-ink-600">Concurso conferido — veja o rateio abaixo.</p>
      ) : null}

      {status === 'CANCELED' ? <p className="mt-3 text-sm text-danger">Este bolão foi cancelado.</p> : null}

      {showCancelConfirm ? (
        <ConfirmDialog
          title="Cancelar este bolão?"
          description="Todos os participantes serão avisados. Essa ação não pode ser desfeita."
          confirmLabel="Cancelar bolão"
          isLoading={updateStatus.isPending}
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            advance('CANCELED')
            setShowCancelConfirm(false)
          }}
        />
      ) : null}
    </div>
  )
}

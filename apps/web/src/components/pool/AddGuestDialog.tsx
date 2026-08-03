'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'

export interface AddGuestDialogProps {
  poolId: string
  sharesAvailable: number
  onClose: () => void
  onAdded: () => void
}

/** CL-46 — adicionar participante sem conta (dono). */
export function AddGuestDialog({ poolId, sharesAvailable, onClose, onAdded }: AddGuestDialogProps) {
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [shares, setShares] = useState(1)

  const addGuest = trpc.pool.members.addGuest.useMutation({
    onSuccess: () => onAdded(),
  })

  const maxShares = Math.max(sharesAvailable, 1)
  const canSubmit = guestName.trim().length > 0 && shares >= 1 && shares <= maxShares && !addGuest.isPending

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-guest-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-md"
      >
        <h3 id="add-guest-title" className="font-display text-lg font-semibold text-ink-900">
          Adicionar participante sem conta
        </h3>
        <p className="mt-1 text-sm text-ink-600">Para quem entrou no bolão mas ainda não tem cadastro no LotoPro.</p>

        <label className="mt-4 block text-sm font-medium text-ink-900" htmlFor="guest-name">
          Nome
          <input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="guest-phone">
          Telefone (opcional)
          <input
            id="guest-phone"
            type="tel"
            value={guestPhone}
            onChange={(event) => setGuestPhone(event.target.value)}
            placeholder="(11) 99999-9999"
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="guest-shares">
          Cotas
          <input
            id="guest-shares"
            type="number"
            min={1}
            max={maxShares}
            value={shares}
            onChange={(event) => setShares(Math.max(1, Math.trunc(Number(event.target.value)) || 1))}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>
        <p className="mt-1 text-xs text-ink-400">{sharesAvailable} cota(s) disponível(is).</p>

        {addGuest.error ? <p className="mt-2 text-sm text-danger">{addGuest.error.message}</p> : null}

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
            disabled={!canSubmit}
            onClick={() =>
              addGuest.mutate({
                poolId,
                guestName: guestName.trim(),
                ...(guestPhone.trim() ? { guestPhone: guestPhone.trim() } : {}),
                shares,
              })
            }
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {addGuest.isPending ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

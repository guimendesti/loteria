'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { setToast } from '@/app/(app)/app/components/toast'
import { ConfirmDialog } from './ConfirmDialog'

export interface LeavePoolButtonProps {
  poolId: string
}

/**
 * Addendum v2 §4 — `pool.leave`: o próprio participante sai do bolão. A página só
 * renderiza este componente quando `status === 'OPEN'` e o pagamento do participante
 * ainda não foi declarado/confirmado (mesma checagem de `assertCanLeavePool`,
 * `server/lib/pool/state-machine.ts` — o servidor valida de novo; isto é só UX). Depois
 * disso um Pix P2P pode já ter circulado e não dá pra desfazer — nesse caso o servidor
 * recusa com uma mensagem orientando a falar com o organizador, mostrada aqui tal como
 * veio (`leave.error.message`), em vez de um erro genérico.
 */
export function LeavePoolButton({ poolId }: LeavePoolButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  const leave = trpc.pool.leave.useMutation({
    onSuccess: () => {
      setShowConfirm(false)
      setToast('Você saiu do bolão.')
      router.push('/app/boloes')
    },
  })

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Sair do bolão</h2>
      <p className="mt-1 text-sm text-ink-600">
        Sua(s) cota(s) voltam a ficar disponíveis para outros participantes. Depois que você declarar ou o
        organizador confirmar seu pagamento, só ele resolve isso — não dá mais pra sair sozinho por aqui.
      </p>

      {leave.error ? <p className="mt-2 text-sm text-danger">{leave.error.message}</p> : null}

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={leave.isPending}
        className="mt-3 rounded-md border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
      >
        {leave.isPending ? 'Saindo…' : 'Sair do bolão'}
      </button>

      {showConfirm ? (
        <ConfirmDialog
          title="Sair deste bolão?"
          description="Você libera sua(s) cota(s) de volta para o bolão. Essa ação não pode ser desfeita."
          confirmLabel="Sair do bolão"
          isLoading={leave.isPending}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => leave.mutate({ poolId })}
        />
      ) : null}
    </div>
  )
}

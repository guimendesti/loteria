'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { CopyButton } from './CopyButton'
import { LegalBanner } from './LegalBanner'
import { MemberStatusBadge } from './StatusBadges'
import type { PoolMemberRow } from './types'

export interface MemberPaymentPanelProps {
  member: PoolMemberRow
  ownerPixKeyMasked: string | null
  onDeclared: () => void
}

/**
 * CL-57/CL-58 — visão do participante: cota, valor devido, Pix copia-e-cola
 * do organizador (P2P, docs/03) e botão "já paguei". Nunca busca o Pix depois
 * que o pagamento já foi confirmado (não há mais o que cobrar).
 */
export function MemberPaymentPanel({ member, ownerPixKeyMasked, onDeclared }: MemberPaymentPanelProps) {
  const [proofUrl, setProofUrl] = useState('')

  const alreadyDeclared = member.status === 'PAID'
  const confirmed = member.status === 'CONFIRMED'
  const canPay = !confirmed && member.status !== 'REMOVED'

  const pixQuery = trpc.pool.payments.pixPayload.useQuery({ memberId: member.id }, { enabled: canPay && !alreadyDeclared })

  const declare = trpc.pool.payments.declare.useMutation({ onSuccess: onDeclared })

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Sua parte no bolão</h2>

      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-ink-600">Suas cotas</dt>
        <dd className="text-right font-medium text-ink-900">{member.shares}</dd>
        <dt className="text-ink-600">Você deve</dt>
        <dd className="text-right font-medium text-ink-900">{formatCents(member.amountCents)}</dd>
        <dt className="text-ink-600">Status</dt>
        <dd className="text-right">
          <MemberStatusBadge status={member.status} />
        </dd>
      </dl>

      {confirmed ? (
        <p className="mt-3 text-sm text-success">Pagamento confirmado pelo organizador. Obrigado!</p>
      ) : (
        <>
          {!alreadyDeclared ? (
            <div className="mt-4 border-t border-ink-200 pt-4">
              <p className="text-sm font-medium text-ink-900">Pix do organizador</p>
              {ownerPixKeyMasked ? <p className="mt-1 text-sm text-ink-600">Chave: {ownerPixKeyMasked}</p> : null}

              {pixQuery.isLoading ? (
                <p className="mt-2 text-sm text-ink-600">Gerando o Pix copia-e-cola…</p>
              ) : pixQuery.data ? (
                <>
                  <p className="mt-2 break-all rounded-md bg-ink-50 px-3 py-2 font-mono text-xs text-ink-900">
                    {pixQuery.data.emv}
                  </p>
                  <div className="mt-2">
                    <CopyButton value={pixQuery.data.emv} label="Copiar Pix copia-e-cola" />
                  </div>
                </>
              ) : pixQuery.isError ? (
                <p className="mt-2 text-sm text-danger">Não foi possível gerar o Pix agora. Tente novamente.</p>
              ) : null}

              <LegalBanner variant="inline" />
            </div>
          ) : null}

          <div className="mt-4 border-t border-ink-200 pt-4">
            {alreadyDeclared ? (
              <p className="text-sm text-warning">
                Você já declarou este pagamento — aguardando o organizador confirmar o recebimento.
              </p>
            ) : (
              <>
                <label className="block text-sm font-medium text-ink-900" htmlFor="proof-url">
                  Link do comprovante (opcional)
                  <input
                    id="proof-url"
                    type="url"
                    value={proofUrl}
                    onChange={(event) => setProofUrl(event.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
                  />
                </label>
                {declare.error ? <p className="mt-2 text-sm text-danger">{declare.error.message}</p> : null}
                <button
                  type="button"
                  disabled={declare.isPending}
                  onClick={() =>
                    declare.mutate({ memberId: member.id, ...(proofUrl.trim() ? { proofUrl: proofUrl.trim() } : {}) })
                  }
                  className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {declare.isPending ? 'Enviando…' : 'Já paguei'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

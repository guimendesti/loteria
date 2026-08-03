'use client'

import { useState } from 'react'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { ConfirmDialog } from './ConfirmDialog'
import { MemberStatusBadge } from './StatusBadges'
import type { PoolMemberRow } from './types'

export interface MembersTableProps {
  members: PoolMemberRow[]
  onConfirmPayment: (memberId: string) => void
  confirmPaymentPendingId: string | null
  onRemove: (memberId: string) => void
  removePendingId: string | null
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Tabela de participantes (visão do dono) — vira cards no mobile em vez de
 * scroll horizontal (esse produto é usado no grupo do WhatsApp, no celular).
 */
export function MembersTable({
  members,
  onConfirmPayment,
  confirmPaymentPendingId,
  onRemove,
  removePendingId,
}: MembersTableProps) {
  const [pendingRemoval, setPendingRemoval] = useState<PoolMemberRow | null>(null)

  if (members.length === 0) {
    return <p className="text-sm text-ink-600">Ainda não há participantes.</p>
  }

  function canConfirm(member: PoolMemberRow) {
    // Espelha `assertCanConfirmPayment` (server/lib/pool/state-machine.ts): tudo
    // que não é CONFIRMED nem REMOVED ainda pode ser confirmado pelo dono.
    return member.status === 'INVITED' || member.status === 'JOINED' || member.status === 'PAID'
  }

  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-ink-400">
              <th className="pb-2 font-normal">Participante</th>
              <th className="pb-2 font-normal">Cotas</th>
              <th className="pb-2 font-normal">Valor</th>
              <th className="pb-2 font-normal">Status</th>
              <th className="pb-2 font-normal">Comprovante</th>
              <th className="pb-2 text-right font-normal">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-ink-200">
                <td className="py-2 align-top text-ink-900">
                  {member.displayName}
                  {member.paymentDeclaredAt ? (
                    <span className="block text-xs text-ink-400">
                      Declarou pagamento em {dateFormatter.format(new Date(member.paymentDeclaredAt))}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 align-top text-ink-900">{member.shares}</td>
                <td className="py-2 align-top font-medium text-ink-900">{formatCents(member.amountCents)}</td>
                <td className="py-2 align-top">
                  <MemberStatusBadge status={member.status} />
                </td>
                <td className="py-2 align-top">
                  {member.proofUrl ? (
                    <a
                      href={member.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-500 underline hover:text-brand-700"
                    >
                      Ver
                    </a>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="py-2 align-top">
                  <div className="flex justify-end gap-2">
                    {canConfirm(member) ? (
                      <button
                        type="button"
                        onClick={() => onConfirmPayment(member.id)}
                        disabled={confirmPaymentPendingId === member.id}
                        className="rounded-md border border-success/40 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-60"
                      >
                        {confirmPaymentPendingId === member.id ? 'Confirmando…' : 'Confirmar pagamento'}
                      </button>
                    ) : null}
                    {member.status !== 'REMOVED' ? (
                      <button
                        type="button"
                        onClick={() => setPendingRemoval(member)}
                        disabled={removePendingId === member.id}
                        className="rounded-md border border-danger/40 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <div key={member.id} className="rounded-lg border border-ink-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink-900">{member.displayName}</p>
              <MemberStatusBadge status={member.status} />
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-400">Cotas</dt>
              <dd className="text-right text-ink-900">{member.shares}</dd>
              <dt className="text-ink-400">Valor</dt>
              <dd className="text-right font-medium text-ink-900">{formatCents(member.amountCents)}</dd>
            </dl>

            {member.proofUrl ? (
              <a
                href={member.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-brand-500 underline hover:text-brand-700"
              >
                Ver comprovante de pagamento
              </a>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {canConfirm(member) ? (
                <button
                  type="button"
                  onClick={() => onConfirmPayment(member.id)}
                  disabled={confirmPaymentPendingId === member.id}
                  className="flex-1 rounded-md border border-success/40 px-3 py-2 text-sm font-semibold text-success hover:bg-success/10 disabled:opacity-60"
                >
                  {confirmPaymentPendingId === member.id ? 'Confirmando…' : 'Confirmar pagamento'}
                </button>
              ) : null}
              {member.status !== 'REMOVED' ? (
                <button
                  type="button"
                  onClick={() => setPendingRemoval(member)}
                  disabled={removePendingId === member.id}
                  className="flex-1 rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {pendingRemoval ? (
        <ConfirmDialog
          title="Remover participante?"
          description={`${pendingRemoval.displayName} perde a(s) ${pendingRemoval.shares} cota(s) deste bolão. Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          isLoading={removePendingId === pendingRemoval.id}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            onRemove(pendingRemoval.id)
            setPendingRemoval(null)
          }}
        />
      ) : null}
    </>
  )
}

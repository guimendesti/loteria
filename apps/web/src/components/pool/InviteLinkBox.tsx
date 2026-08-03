'use client'

import { CopyButton } from './CopyButton'
import type { PoolStatus } from './types'

export interface InviteLinkBoxProps {
  inviteCode: string
  inviteExpiresAt: Date | null
  poolStatus: PoolStatus
  lotteryName: string
  totalShares: number
  shareValueLabel: string
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * CL-43 — link de convite + botão "Compartilhar no WhatsApp" com texto
 * pronto (texto conforme docs/09 §F3). A página pública que recebe esse link
 * (`(marketing)/bolao/[codigo]`) é território de outro agente da mesma onda.
 */
export function InviteLinkBox({
  inviteCode,
  inviteExpiresAt,
  poolStatus,
  lotteryName,
  totalShares,
  shareValueLabel,
}: InviteLinkBoxProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/bolao/${inviteCode}`
  const whatsappText = `Criei nosso bolão da ${lotteryName} no LotoPro! 🎯 ${totalShares} cotas de ${shareValueLabel}. Entra aqui: ${link}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h2 className="font-display text-base font-semibold text-ink-900">Link de convite</h2>

      {poolStatus === 'DRAFT' ? (
        <p className="mt-1 text-sm text-warning">
          Este bolão ainda é um rascunho — publique-o abaixo para o link passar a valer.
        </p>
      ) : null}

      <p className="mt-2 break-all rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-900">{link}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={link} label="Copiar link" />
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-success px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Compartilhar no WhatsApp
        </a>
      </div>

      {inviteExpiresAt ? (
        <p className="mt-2 text-xs text-ink-400">Convite válido até {dateFormatter.format(inviteExpiresAt)}.</p>
      ) : null}
    </div>
  )
}

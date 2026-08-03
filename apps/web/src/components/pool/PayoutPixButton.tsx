'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { CopyButton } from './CopyButton'

export interface PayoutPixButtonProps {
  payoutId: string
  memberName: string
}

/**
 * Addendum v2 §2 — Pix do rateio (organizador → participante). `pool.payout.pixPayload`
 * é só do dono; gera o EMV com a chave do PARTICIPANTE (direção oposta de
 * `MemberPaymentPanel`, que usa a chave do organizador). A query só dispara quando o
 * organizador pede ("Gerar Pix…") — evita N queries automáticas por linha pendente.
 *
 * `null` cobre dois casos que o servidor não distingue (nem precisa: a ação da UI é a
 * mesma nos dois) — convidado sem conta ou participante que não cadastrou chave Pix.
 * Não é erro: explica que o repasse é combinado fora do app. Continua P2P — o LotoPro só
 * monta o código, quem paga é o organizador, direto, pessoa para pessoa.
 */
export function PayoutPixButton({ payoutId, memberName }: PayoutPixButtonProps) {
  const [requested, setRequested] = useState(false)

  const query = trpc.pool.payout.pixPayload.useQuery({ payoutId }, { enabled: requested })

  if (!requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="rounded-md border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-900 hover:bg-ink-50"
      >
        Gerar Pix para repassar
      </button>
    )
  }

  return (
    <div className="mt-2 max-w-xs rounded-md border border-ink-200 bg-ink-50 p-3 text-left">
      {query.isLoading ? (
        <p className="text-xs text-ink-600">Gerando o Pix copia-e-cola…</p>
      ) : query.isError ? (
        <p className="text-xs text-danger">Não foi possível gerar o Pix agora. Tente novamente.</p>
      ) : query.data ? (
        <>
          <p className="break-all font-mono text-xs text-ink-900">{query.data.emv}</p>
          <div className="mt-2">
            <CopyButton
              value={query.data.emv}
              label={`Copiar Pix para ${memberName}`}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-900 hover:bg-ink-50"
            />
          </div>
          <p className="mt-2 text-xs text-ink-600">
            Pague direto para {memberName}, pela chave Pix dele — o LotoPro só montou o código; o repasse é feito por
            você, o organizador, pessoa para pessoa.
          </p>
        </>
      ) : (
        <p className="text-xs text-ink-600">
          Não deu para gerar o Pix automaticamente: {memberName} ainda não tem conta no LotoPro ou não cadastrou uma
          chave Pix. Combine esse repasse diretamente com {memberName}, fora do app.
        </p>
      )}
    </div>
  )
}

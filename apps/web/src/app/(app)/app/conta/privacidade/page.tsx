'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { authClient } from '@/lib/auth-client'

/**
 * Precisa ser IDÊNTICA a `DELETE_ACCOUNT_CONFIRMATION_PHRASE` em
 * `server/routers/account.ts` — o servidor valida a mesma frase de novo (nunca confiar só
 * na checagem client-side).
 */
const CONFIRMATION_PHRASE = 'EXCLUIR MINHA CONTA'

/** `bigint` não serializa em `JSON.stringify` — converte para string só na hora do download. */
function toDownloadableJson(data: unknown): string {
  return JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
}

function downloadJson(filename: string, data: unknown): void {
  const json = toDownloadableJson(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * CL-108/109 (docs/08 §C.8) + docs/03 §3.5 (LGPD) — exportar dados e excluir conta.
 *
 * Exclusão: dupla confirmação client-side (checkbox de ciência + frase digitada, validada
 * de novo no servidor). Antes de anonimizar, cancela uma assinatura paga ativa via
 * `billing.cancel` (mutation já pronta, consumida aqui, best-effort) —
 * `account.deleteAccount` não chama o gateway de pagamento de propósito (chamada de rede
 * externa dentro de uma transação de banco é anti-padrão; ver comentário em `account.ts`).
 */
export default function PrivacidadePage() {
  const exportMutation = trpc.account.exportData.useMutation()
  const subscriptionQuery = trpc.billing.subscription.current.useQuery()
  const cancelMutation = trpc.billing.cancel.useMutation()
  const deleteMutation = trpc.account.deleteAccount.useMutation()

  const [ack, setAck] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canDelete = ack && confirmation.trim().toUpperCase() === CONFIRMATION_PHRASE && !isDeleting

  async function handleExport() {
    try {
      const data = await exportMutation.mutateAsync()
      downloadJson(`lotopro-meus-dados-${new Date().toISOString().slice(0, 10)}.json`, data)
    } catch {
      // erro já fica disponível em exportMutation.error para a UI abaixo
    }
  }

  async function handleDelete() {
    if (!canDelete) return
    setDeleteError(null)
    setIsDeleting(true)

    try {
      const subscription = subscriptionQuery.data
      const hasActiveBilling =
        subscription !== null &&
        subscription !== undefined &&
        !subscription.cancelAtPeriodEnd &&
        (subscription.status === 'ACTIVE' ||
          subscription.status === 'TRIALING' ||
          subscription.status === 'PAST_DUE')

      if (hasActiveBilling) {
        try {
          await cancelMutation.mutateAsync({ reason: 'Exclusão de conta' })
        } catch {
          // Best-effort: uma falha no gateway não pode travar um direito do titular
          // (LGPD, docs/03 §3.5) — a anonimização segue mesmo assim.
        }
      }

      await deleteMutation.mutateAsync({ confirmation })
      await authClient.signOut()
      // Reload completo (não router.push): garante que nenhum estado/cache de sessão
      // autenticada sobrevive na SPA depois da conta ter sido anonimizada.
      window.location.href = '/'
    } catch (error) {
      setIsDeleting(false)
      setDeleteError(error instanceof Error ? error.message : 'Não foi possível excluir a conta.')
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Exportar meus dados</h2>
        <p className="mt-1 text-sm text-ink-600">
          Baixe um arquivo JSON com seu perfil, apostas, conferências, bolões (os que você organiza e os
          que você participa) e faturas (CL-108 — direito de portabilidade da LGPD).
        </p>

        <button
          type="button"
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {exportMutation.isPending ? 'Gerando arquivo…' : 'Baixar meus dados (.json)'}
        </button>

        {exportMutation.error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {exportMutation.error.message}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-danger/40 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-danger">Excluir minha conta</h2>
        <div className="mt-2 space-y-2 text-sm text-ink-600">
          <p>Isso é definitivo. Ao confirmar:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Seu e-mail e nome são substituídos por dados anônimos — você não conseguirá mais entrar.</li>
            <li>Telefone, avatar e chave Pix são apagados.</li>
            <li>
              Seus jogos, conferências e participações em bolões de OUTRAS pessoas são preservados (sem
              isso, o rateio e o histórico de quem organiza um bolão com você quebrariam) — mas deixam de
              ficar associados a um nome ou e-mail seus.
            </li>
            <li>Uma assinatura paga ativa é cancelada.</li>
            <li>Todas as suas sessões são encerradas, em todos os dispositivos.</li>
          </ul>
        </div>

        <div className="mt-4 space-y-3 rounded-md bg-ink-50 p-4">
          <label className="flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-200 text-danger focus:ring-danger"
            />
            <span>
              Entendo que essa ação não pode ser desfeita e que meus dados serão anonimizados, não
              apagados.
            </span>
          </label>

          <div>
            <label htmlFor="confirmation" className="block text-sm font-medium text-ink-900">
              Para confirmar, digite <span className="font-mono font-semibold">{CONFIRMATION_PHRASE}</span>
            </label>
            <input
              id="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="mt-1 w-full max-w-sm rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
            />
          </div>
        </div>

        {deleteError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {deleteError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete}
          className="mt-4 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {isDeleting ? 'Excluindo…' : 'Excluir minha conta'}
        </button>
      </section>
    </div>
  )
}

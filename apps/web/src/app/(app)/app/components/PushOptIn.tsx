'use client'

import { usePushSubscription } from './use-push-subscription'

/**
 * P5 — opt-in de push (docs/08 SY-04, docs/09 §9.6). Regras de exibição:
 * - Navegador sem suporte (`state === 'unsupported'`) → não renderiza nada.
 * - Já decidido (`'granted'`) → não renderiza nada (nada para pedir).
 * - Negado (`'denied'`) → mensagem explicando como reverter nas configurações do navegador,
 *   SEM botão — não há como reabrir o prompt nativo via JS, então insistir seria só ruído.
 * - `'default'` (ainda não perguntado) → botão "Ativar notificações".
 *
 * Onde renderizar: fora do território desta tarefa (dashboard é de outro agente) — ver a
 * linha sugerida no relatório.
 */
export function PushOptIn() {
  const { state, loading, error, subscribe } = usePushSubscription()

  if (state === null || state === 'unsupported' || state === 'granted') return null

  if (state === 'denied') {
    return (
      <div
        role="status"
        className="mb-4 rounded-md border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600"
      >
        Notificações push estão bloqueadas no seu navegador. Para ativar, permita notificações
        para o LotoPro nas configurações do navegador.
      </div>
    )
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink-900">Ativar notificações</p>
        <p className="text-sm text-ink-600">Receba um aviso no navegador quando seus jogos forem conferidos.</p>
        {error ? (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void subscribe()}
        disabled={loading}
        className="shrink-0 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? 'Ativando…' : 'Ativar notificações'}
      </button>
    </div>
  )
}

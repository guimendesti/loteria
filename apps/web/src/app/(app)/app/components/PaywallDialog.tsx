'use client'

import Link from 'next/link'
import { DEFAULT_PAYWALL_COPY, PAYWALL_COPY } from './paywall-copy'
import { PAYWALL_PLAN_PRICES } from './paywall-plans'
import type { PaywallErrorData } from './use-paywall'

export interface PaywallDialogProps {
  open: boolean
  paywall: PaywallErrorData | null
  onClose: () => void
}

/**
 * C6 (docs/09 §9.3) — modal de limite de plano atingido. Estrutura fixa:
 * título do bloqueio → 3 bullets do que o plano superior destrava → preço →
 * CTA "Testar 14 dias grátis" → link discreto "continuar no plano gratuito".
 * **Nunca bloqueia o usuário sem saída** — fechar (X, clique fora, ou o link
 * discreto) sempre funciona; quem chamou o dialog decide se mantém o
 * formulário/estado de origem intacto (docs/05 §5.4: nunca perder trabalho).
 */
export function PaywallDialog({ open, paywall, onClose }: PaywallDialogProps) {
  if (!open || !paywall) return null

  const copy = paywall.gate ? PAYWALL_COPY[paywall.gate] : DEFAULT_PAYWALL_COPY
  const plan = PAYWALL_PLAN_PRICES[copy.plan]

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-t-lg bg-white p-6 shadow-lg sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="paywall-dialog-title" className="font-display text-lg font-bold text-ink-900">
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 text-xl leading-none text-ink-400 hover:text-ink-600"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm font-medium text-ink-600">O plano {plan.name} destrava:</p>
        <ul className="mt-2 space-y-2 text-sm text-ink-900">
          {copy.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-success">
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4">
          <span className="font-display text-2xl font-bold text-ink-900">{plan.monthlyLabel}</span>
        </p>

        <Link
          // TODO: rota de assinatura ainda não existe (router de billing de
          // outro agente, em paralelo — ver server/routers/_app.ts). Usar o
          // caminho já definido em docs/08 mesmo assim; ligar quando existir.
          href="/app/conta/assinatura"
          className="mt-5 block rounded-md bg-brand-500 px-4 py-3 text-center text-base font-semibold text-white hover:bg-brand-700"
        >
          Testar 14 dias grátis
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 block w-full text-center text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          Continuar no plano gratuito
        </button>
      </div>
    </div>
  )
}

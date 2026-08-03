import type { Metadata } from 'next'
import Link from 'next/link'
import { PlanToggle } from './PlanToggle'
import { PIX_AUTOMATIC_DISCOUNT_LABEL } from '@/app/(marketing)/content/plans'

export const metadata: Metadata = {
  title: 'Planos e preços',
  description:
    'Compare os planos Free, Premium e Pro do LotoPro: jogos ilimitados, conferência automática, bolões e mais. Sua assinatura nunca varia com quanto você aposta.',
}

/**
 * LP-02 — Planos e preços (docs/08 §A.2, docs/05 §5.2). Tabela comparativa
 * completa + toggle mensal/anual em `PlanToggle` (client component).
 */
export default function PlanosPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            Um plano para cada jeito de jogar
          </h1>
          <p className="mt-4 text-lg text-ink-600">
            Comece grátis. Assine quando o plano gratuito não for mais suficiente — nunca porque
            apagamos algo seu.
          </p>
        </div>

        <div className="mt-12">
          <PlanToggle />
        </div>

        {/* Nota do desconto Pix Automático (docs/05 §5.5). */}
        <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-brand-500/30 bg-brand-100 p-5 text-center">
          <p className="text-sm font-semibold text-brand-900">Pix Automático</p>
          <p className="mt-1 text-sm text-brand-900">{PIX_AUTOMATIC_DISCOUNT_LABEL}</p>
          <p className="mt-1 text-xs text-ink-600">
            A cobrança é sempre da sua assinatura de software — nunca de valores apostados ou de
            bolão.
          </p>
        </div>

        {/* Lotérica / White-label — plano sob consulta, fora do checkout self-service. */}
        <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-ink-200 bg-white p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">B2B</p>
          <p className="mt-1 font-display text-lg font-bold text-ink-900">Lotérica / White-label</p>
          <p className="mt-2 text-sm text-ink-600">
            Sua marca, seu domínio, todos os recursos do plano Pro para os seus clientes. A partir
            de R$ 349/mês, contrato anual com SLA.
          </p>
          <Link
            href="/contato"
            className="mt-4 inline-block rounded-md border border-brand-500 px-6 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          >
            Falar com a gente
          </Link>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-ink-600">
          Dúvidas sobre planos e cobrança?{' '}
          <Link href="/faq" className="font-semibold text-brand-700 hover:underline">
            Veja o FAQ
          </Link>{' '}
          ou{' '}
          <Link href="/contato" className="font-semibold text-brand-700 hover:underline">
            fale com o suporte
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

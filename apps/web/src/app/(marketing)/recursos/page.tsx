import type { Metadata } from 'next'
import Link from 'next/link'
import { FEATURES } from '@/app/(marketing)/content/features'

export const metadata: Metadata = {
  title: 'Recursos',
  description:
    'Conheça os recursos do LotoPro: Bolão Manager, conferência automática, fechamentos com garantia, backtesting honesto, OCR de comprovante, carteira e mais.',
}

/**
 * LP-03 — Recursos, visão geral (docs/08 §A.2, docs/04 §4.3). Grid completo
 * dos 10 diferenciais, com descrição mais longa que o resumo da home.
 */
export default function RecursosPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            Tudo que você precisa para organizar seus jogos
          </h1>
          <p className="mt-4 text-lg text-ink-600">
            O LotoPro organiza, confere e analisa os jogos que você já faz — nunca aposta por você
            e nunca promete aumentar sua chance de ganhar.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.id} className="flex flex-col rounded-lg border border-ink-200 bg-white p-6">
              <p className="font-display text-lg font-semibold text-ink-900">{feature.title}</p>
              <p className="mt-2 flex-1 text-sm text-ink-600">{feature.description}</p>
              {feature.href && (
                <Link
                  href={feature.href}
                  className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
                >
                  Ver como funciona →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/cadastro"
            className="inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Começar grátis
          </Link>
        </div>
      </div>
    </div>
  )
}

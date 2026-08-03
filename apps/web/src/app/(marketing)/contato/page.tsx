import type { Metadata } from 'next'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Fale com o suporte do LotoPro — dúvidas sobre conta, planos, bolões e privacidade.',
}

/** LP-14 — Contato / suporte (docs/08 §A.2). */
export default function ContatoPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">Fale com a gente</h1>
        <p className="mt-4 text-lg text-ink-600">
          Dúvidas sobre sua conta, planos, bolões ou privacidade — antes de escrever, veja se a
          resposta já está no{' '}
          <a href="/faq" className="font-semibold text-brand-700 hover:underline">
            FAQ
          </a>
          .
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="font-display font-semibold text-ink-900">Suporte</p>
            <a href="mailto:suporte@lotopro.com.br" className="mt-1 inline-block text-sm text-brand-700 hover:underline">
              suporte@lotopro.com.br
            </a>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="font-display font-semibold text-ink-900">Privacidade / LGPD</p>
            <a
              href="mailto:privacidade@lotopro.com.br"
              className="mt-1 inline-block text-sm text-brand-700 hover:underline"
            >
              privacidade@lotopro.com.br
            </a>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  )
}

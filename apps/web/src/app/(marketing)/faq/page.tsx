import type { Metadata } from 'next'
import Link from 'next/link'
import { FAQ_CATEGORIES } from '@/app/(marketing)/content/faq'

export const metadata: Metadata = {
  title: 'Perguntas frequentes',
  description:
    'Tire suas dúvidas sobre o LotoPro: bolões, planos, conferência de resultados, privacidade e o vínculo (inexistente) com a Caixa Econômica Federal.',
}

/** LP-10 — FAQ completo (docs/08 §A.2). Conteúdo em `content/faq.ts`, agrupado por categoria. */
export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_CATEGORIES.flatMap((category) =>
      category.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    ),
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        {/* eslint-disable-next-line react/no-danger -- JSON-LD estrutural, sem HTML de usuário */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Perguntas frequentes
        </h1>
        <p className="mt-4 text-lg text-ink-600">
          Se sua dúvida não estiver aqui,{' '}
          <Link href="/contato" className="font-semibold text-brand-700 hover:underline">
            fale com a gente
          </Link>
          .
        </p>

        <div className="mt-12 space-y-12">
          {FAQ_CATEGORIES.map((category) => (
            <div key={category.title}>
              <h2 className="font-display text-xl font-bold text-ink-900">{category.title}</h2>
              <dl className="mt-4 space-y-4">
                {category.items.map((item) => (
                  <div key={item.question} className="rounded-lg border border-ink-200 bg-white p-5">
                    <dt className="font-semibold text-ink-900">{item.question}</dt>
                    <dd className="mt-1 text-sm text-ink-600">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

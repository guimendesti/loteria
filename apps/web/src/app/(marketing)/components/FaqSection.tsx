import Link from 'next/link'
import { HOME_FAQ } from '@/app/(marketing)/content/faq'

/**
 * Seção 8 — FAQ, com foco nas objeções de compliance (docs/08 §A.3.8;
 * fundamentos em docs/03 §3.2/§3.3). Conteúdo em `content/faq.ts`
 * (`HOME_FAQ`), reaproveitado pela página completa `/faq` (LP-10).
 */
export function FaqSection() {
  return (
    <section className="bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Perguntas frequentes
        </h2>
        <dl className="mt-10 space-y-6">
          {HOME_FAQ.map((item) => (
            <div key={item.question} className="rounded-lg border border-ink-200 bg-white p-6">
              <dt className="font-display font-semibold text-ink-900">{item.question}</dt>
              <dd className="mt-2 text-ink-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-center text-sm text-ink-600">
          Mais dúvidas?{' '}
          <Link href="/faq" className="font-semibold text-brand-700 hover:underline">
            Veja o FAQ completo
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

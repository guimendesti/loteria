/**
 * Seção 8 — FAQ, com foco nas objeções de compliance (docs/08 §A.3.8;
 * fundamentos em docs/03 §3.2/§3.3).
 */
const FAQ = [
  {
    question: 'Vocês apostam por mim?',
    answer:
      'Não. O LotoPro organiza e confere os jogos que você já fez ou pretende fazer. Todas as apostas devem ser feitas nos canais oficiais da CAIXA.',
  },
  {
    question: 'Tem vínculo com a Caixa?',
    answer:
      'Não. Somos um software independente, sem vínculo, parceria ou autorização da Caixa Econômica Federal.',
  },
  {
    question: 'Isso aumenta minha chance de ganhar?',
    answer:
      'Não. Sorteios são eventos independentes e aleatórios — nenhuma ferramenta de organização, estatística ou fechamento muda a probabilidade de acerto. O LotoPro existe para organizar e analisar, não para prever.',
  },
]

export function FaqSection() {
  return (
    <section className="bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Perguntas frequentes
        </h2>
        <dl className="mt-10 space-y-6">
          {FAQ.map((item) => (
            <div key={item.question} className="rounded-lg border border-ink-200 bg-white p-6">
              <dt className="font-display font-semibold text-ink-900">{item.question}</dt>
              <dd className="mt-2 text-ink-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

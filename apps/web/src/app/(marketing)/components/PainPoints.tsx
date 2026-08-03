/** Seção 2 — Prova de dor, 3 cards (docs/08 §A.3.2). */
const PAINS = [
  {
    question: 'Perdeu prêmio por não conferir?',
    detail: 'O bilhete fica na gaveta e a conferência só acontece "quando lembra".',
  },
  {
    question: 'Bolão virou planilha e briga?',
    detail: 'Cobrança por WhatsApp, foto do bilhete perdida e gente desconfiando do rateio.',
  },
  {
    question: 'Não sabe quanto já gastou?',
    detail: 'Sem controle, fica difícil saber se vale a pena continuar jogando do jeito que joga.',
  },
]

export function PainPoints() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Se algo aqui soa familiar…
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PAINS.map((pain) => (
            <div key={pain.question} className="rounded-lg border border-ink-200 bg-ink-50 p-6">
              <p className="font-display text-lg font-semibold text-ink-900">{pain.question}</p>
              <p className="mt-2 text-sm text-ink-600">{pain.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Seção 3 — Como funciona, 3 passos (docs/08 §A.3.3). */
const STEPS = [
  {
    n: 1,
    title: 'Cadastre seus jogos',
    detail: 'Digite as dezenas ou fotografe o comprovante — leva menos de 1 minuto.',
  },
  {
    n: 2,
    title: 'Aposte na Caixa',
    detail: 'A aposta em si sempre acontece nos canais oficiais da CAIXA, como sempre.',
  },
  {
    n: 3,
    title: 'Receba o resultado no celular',
    detail: 'O LotoPro confere sozinho depois de cada sorteio e te avisa se você ganhou.',
  },
]

export function HowItWorks() {
  return (
    <section className="bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Como funciona
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 font-display font-bold text-white">
                {step.n}
              </span>
              <p className="mt-4 font-semibold text-ink-900">{step.title}</p>
              <p className="mt-1 text-sm text-ink-600">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

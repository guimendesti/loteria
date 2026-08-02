/** Seção 3 — Como funciona, 3 passos (docs/08 §A.3.3). */
const STEPS = [
  { n: 1, title: 'Cadastre seus jogos' },
  { n: 2, title: 'Aposte na Caixa' },
  { n: 3, title: 'Receba o resultado no celular' },
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

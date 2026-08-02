/** Seção 2 — Prova de dor, 3 cards (docs/08 §A.3.2). */
const PAINS = [
  'Perdeu prêmio por não conferir?',
  'Bolão virou planilha e briga?',
  'Não sabe quanto já gastou?',
]

export function PainPoints() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
        {PAINS.map((pain) => (
          <div
            key={pain}
            className="rounded-lg border border-ink-200 bg-ink-50 p-6"
          >
            <p className="font-display text-lg font-semibold text-ink-900">
              {pain}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Seção 6 — Resultados ao vivo (docs/08 §A.3.6). No produto real, ISR
 * disparado por `contest.settled` (docs/08 §A.4) — aqui é só o esqueleto
 * visual; a busca do resultado fica para quando `packages/integrations`
 * (provedor da Caixa) existir.
 */
const PLACEHOLDER_LOTTERIES = ['Mega-Sena', 'Lotofácil'] as const

export function LiveResults() {
  return (
    <section className="bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-2xl font-bold text-ink-900">
          Resultados ao vivo
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {PLACEHOLDER_LOTTERIES.map((name) => (
            <div key={name} className="rounded-lg border border-ink-200 bg-white p-6">
              <p className="font-display font-semibold text-ink-900">{name}</p>
              <p className="mt-1 text-sm text-ink-400">
                Concurso — · aguardando integração com a Caixa
              </p>
              <div aria-hidden="true" className="mt-4 flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-ink-50 text-sm text-ink-400"
                  >
                    –
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

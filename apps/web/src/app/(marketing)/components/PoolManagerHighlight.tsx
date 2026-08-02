/**
 * Seção 4 — Bolão Manager, destaque com demo do fluxo convite → Pix →
 * comprovante → rateio (docs/08 §A.3.4). Demo visual é placeholder.
 */
const FLOW = ['Convite', 'Pix (P2P)', 'Comprovante', 'Rateio']

export function PoolManagerHighlight() {
  return (
    <section className="bg-brand-100 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-2xl font-bold text-brand-900">
          Bolão Manager
        </h2>
        <p className="mt-2 max-w-2xl text-ink-600">
          Organize o bolão do escritório sem planilha e sem desconfiança. O
          LotoPro nunca recebe, guarda ou repassa o dinheiro do bolão — o Pix
          é sempre direto entre você e o organizador.
        </p>

        {/* Placeholder — demo visual do fluxo. */}
        <div
          aria-hidden="true"
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          {FLOW.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <span className="rounded-full border border-brand-500 bg-white px-4 py-2 text-sm font-semibold text-brand-700">
                {step}
              </span>
              {i < FLOW.length - 1 && (
                <span className="text-brand-500" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

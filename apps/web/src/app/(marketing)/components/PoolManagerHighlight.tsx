import Link from 'next/link'

/**
 * Seção 4 — Bolão Manager, destaque com demo do fluxo convite → Pix →
 * comprovante → rateio (docs/08 §A.3.4).
 */
const FLOW = [
  { step: 'Convite', detail: 'Link + QR code, 1 toque para compartilhar no WhatsApp.' },
  { step: 'Pix (P2P)', detail: 'Cada participante paga direto na chave do organizador.' },
  { step: 'Comprovante', detail: 'A aposta oficial anexada, visível para todo mundo.' },
  { step: 'Rateio', detail: 'Calculado sozinho depois do sorteio, por cota.' },
]

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

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {FLOW.map((item, i) => (
            <div key={item.step} className="relative rounded-lg border border-brand-500/30 bg-white p-4">
              <span className="text-xs font-semibold text-brand-500">Passo {i + 1}</span>
              <p className="mt-1 font-display font-semibold text-brand-900">{item.step}</p>
              <p className="mt-1 text-sm text-ink-600">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/recursos/bolao"
            className="inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Conhecer o Bolão Manager
          </Link>
        </div>
      </div>
    </section>
  )
}

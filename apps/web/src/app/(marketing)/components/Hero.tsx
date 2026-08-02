import Link from 'next/link'

/**
 * Seção 1 — Hero (docs/08-especificacao-funcional.md §A.3.1).
 * Headline e sub são o texto real do doc; o "mockup do painel no celular" é
 * um placeholder — não faz parte do escopo deste shell.
 */
export function Hero() {
  return (
    <section className="bg-brand-900 px-6 py-16 text-white sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 sm:grid-cols-2">
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            Seus jogos e bolões de loteria, finalmente organizados.
          </h1>
          <p className="mt-4 text-lg text-brand-100">
            Cadastre uma vez. O LotoPro confere todos os concursos e te avisa
            se você ganhou.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/cadastro"
              className="rounded-md bg-white px-6 py-3 font-semibold text-brand-900 hover:bg-brand-100"
            >
              Começar grátis
            </Link>
            <Link
              href="/planos"
              className="rounded-md border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              Ver planos
            </Link>
          </div>
        </div>

        {/* Placeholder — mockup do painel no celular (docs/08 §A.3.1). */}
        <div
          aria-hidden="true"
          className="mx-auto flex h-80 w-full max-w-xs items-center justify-center rounded-lg border border-white/20 bg-white/5 text-sm text-brand-100"
        >
          [ mockup do painel — placeholder ]
        </div>
      </div>
    </section>
  )
}

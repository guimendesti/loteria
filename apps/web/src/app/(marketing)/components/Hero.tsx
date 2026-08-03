import Link from 'next/link'
import { NumberBall } from '@lotopro/ui'

/**
 * Seção 1 — Hero (docs/08-especificacao-funcional.md §A.3.1).
 * Headline e sub são o texto real do doc. O "mockup do painel no celular" é
 * um cartão estilizado com os componentes reais do design system
 * (NumberBall) — sem imagem/foto de produto ainda, mas honesto sobre o que o
 * painel mostra (jogo conferido, sem imagética de sorte/cassino — docs/09 §9.8).
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

        {/* Mockup do painel no celular — cartão estilizado, componentes reais do design system. */}
        <div aria-hidden="true" className="mx-auto w-full max-w-xs rounded-2xl border border-white/15 bg-white p-4 text-ink-900 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Lotofácil · concurso 3040</p>
          <p className="mt-1 font-display text-sm font-bold text-success">Você acertou 14 números</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[3, 5, 8, 9, 11, 14, 16, 17, 19, 20, 21, 23, 24, 25].map((n) => (
              <NumberBall key={n} number={n} state="hit" size="sm" lotterySlug="lotofacil" />
            ))}
            <NumberBall number={2} state="missed" size="sm" lotterySlug="lotofacil" />
          </div>
          <div className="mt-4 rounded-lg bg-ink-50 p-3">
            <p className="text-xs text-ink-600">Próximo sorteio</p>
            <p className="font-display text-sm font-semibold text-ink-900">Hoje, 20h</p>
          </div>
        </div>
      </div>
    </section>
  )
}

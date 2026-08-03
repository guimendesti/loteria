import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Jogue com responsabilidade',
  description:
    'Loterias são jogos de azar. Veja como o LotoPro ajuda no controle de gastos e onde buscar ajuda: CVV (188) e Jogadores Anônimos.',
}

/**
 * LP-11 — Jogo responsável (docs/08 §A.2, P0 de compliance; fundamentos em
 * docs/03 §3.6 — MVP: R1 (maioridade), R2 (disclaimer de aleatoriedade), R3
 * (painel de gastos), R6 (esta página, com canais de ajuda).
 */
export default function JogoResponsavelPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Jogue com responsabilidade
        </h1>
        <p className="mt-4 text-lg text-ink-600">
          Loterias são jogos de azar. O LotoPro existe para organizar e conferir os jogos que você
          já decidiu fazer — nunca para incentivar você a apostar mais.
        </p>

        {/* Disclaimer de aleatoriedade (docs/03 §3.4 D4, texto literal) */}
        <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-5">
          <p className="text-sm leading-relaxed text-ink-900">
            Loterias são jogos de azar. Os sorteios são eventos independentes e aleatórios:
            resultados passados não influenciam resultados futuros. Nenhuma estratégia, filtro ou
            fechamento aumenta a probabilidade de acerto. Estas ferramentas servem para organizar e
            analisar seus jogos, não para prever resultados.
          </p>
        </div>

        <h2 className="mt-12 font-display text-xl font-bold text-ink-900">O que o LotoPro faz por isso</h2>
        <ul className="mt-4 space-y-3 text-ink-600">
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            <span>
              <strong className="text-ink-900">Verificação de maioridade.</strong> O cadastro exige a
              declaração de que você tem 18 anos ou mais.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            <span>
              <strong className="text-ink-900">Disclaimer de aleatoriedade.</strong> Toda tela de
              estatística, gerador ou fechamento repete o aviso acima — não escondemos essa
              informação em letra miúda.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            <span>
              <strong className="text-ink-900">Painel de gastos.</strong> Sua Carteira mostra quanto
              você gastou no mês e no ano, com destaque visual — inclusive quando o retorno é
              negativo.
            </span>
          </li>
        </ul>

        <h2 className="mt-12 font-display text-xl font-bold text-ink-900">Sinais de que vale pedir ajuda</h2>
        <ul className="mt-4 space-y-2 text-ink-600">
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            Apostar mais do que planejava, com frequência crescente.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            Usar dinheiro reservado para contas essenciais para apostar.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            Apostar para tentar recuperar o que já foi perdido.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-500">•</span>
            Sentir ansiedade, culpa ou irritação relacionadas ao jogo.
          </li>
        </ul>

        <h2 className="mt-12 font-display text-xl font-bold text-ink-900">Onde buscar ajuda</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="font-display font-semibold text-ink-900">CVV — Centro de Valorização da Vida</p>
            <p className="mt-2 text-sm text-ink-600">
              Apoio emocional gratuito e sigiloso, 24 horas por dia, todos os dias.
            </p>
            <p className="mt-3 font-display text-lg font-bold text-brand-700">188</p>
            <a
              href="https://www.cvv.org.br"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline"
            >
              cvv.org.br
            </a>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="font-display font-semibold text-ink-900">Jogadores Anônimos (JA)</p>
            <p className="mt-2 text-sm text-ink-600">
              Grupos de apoio gratuitos, presenciais e online, para quem quer parar de apostar.
              Busque &ldquo;Jogadores Anônimos Brasil&rdquo; para encontrar um grupo perto de você.
            </p>
          </div>
        </div>

        <p className="mt-10 text-sm text-ink-600">
          Quer mais controle sobre o quanto você gasta?{' '}
          <Link href="/recursos" className="font-semibold text-brand-700 hover:underline">
            Veja os recursos do LotoPro
          </Link>
          , incluindo a Carteira com o histórico de gastos e prêmios.
        </p>
      </div>
    </div>
  )
}

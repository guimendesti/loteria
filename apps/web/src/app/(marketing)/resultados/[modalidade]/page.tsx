import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ALL_LOTTERIES, findLotteryConfig, type LotteryConfig } from '@lotopro/core'
import { NumberBall, Badge } from '@lotopro/ui'
import { getResultsPageData, type ResultsContestRow } from './data'
import { formatCents, formatDateBR, formatNumber } from '@/app/(marketing)/lib/format'
import { describeDrawSchedule } from '@/app/(marketing)/lib/draw-schedule'
import { SITE_URL } from '@/app/(marketing)/lib/site'

/** LP-07 — ISR: resultado no ar em até 5 min após o sorteio (docs/08 §A.4). */
export const revalidate = 300

/** As 11 modalidades — SSG das 11 páginas de resultado (docs/08 §A.4 "LP-07 gera 11 páginas"). */
export async function generateStaticParams() {
  return ALL_LOTTERIES.map((lottery) => ({ modalidade: lottery.slug }))
}

type PageParams = { params: Promise<{ modalidade: string }> }

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { modalidade } = await params
  const data = await getResultsPageData(modalidade)
  if (!data) return { title: 'Modalidade não encontrada' }

  const latest = data.recent[0]
  const canonical = `${SITE_URL}/resultados/${data.config.slug}`

  if (!latest) {
    return {
      title: `Resultados da ${data.lotteryName}`,
      description: `Resultado mais recente e histórico de concursos da ${data.lotteryName}. Dezenas sorteadas, premiação por faixa e acumulado.`,
      alternates: { canonical },
    }
  }

  const dateBR = formatDateBR(latest.drawDate)
  return {
    title: `Resultado da ${data.lotteryName} — concurso ${latest.number} (${dateBR})`,
    description: `Confira o resultado do concurso ${latest.number} da ${data.lotteryName}, sorteado em ${dateBR}: dezenas, premiação por faixa${latest.isAccumulated ? ' e acumulado' : ''}. Últimos 10 concursos e estatísticas.`,
    alternates: { canonical },
  }
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

function describeExtraResult(config: LotteryConfig, raw: unknown): string | null {
  const field = config.extraField
  if (field === null || raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (field.kind === 'CLOVER' && Array.isArray(obj.clovers)) {
    return `Trevos sorteados: ${obj.clovers.join(', ')}`
  }
  if (field.kind === 'MONTH' && typeof obj.month === 'number') {
    return `Mês da Sorte: ${MONTH_NAMES[obj.month - 1] ?? obj.month}`
  }
  if (field.kind === 'TEAM' && typeof obj.team === 'string') {
    return `Time do Coração: ${obj.team}`
  }
  return null
}

function ContestNumbers({ contest, config }: { contest: ResultsContestRow; config: LotteryConfig }) {
  if (contest.numbers.length === 0) return null
  const label = config.format === 'PICK_N' ? 'Dezenas sorteadas' : 'Resultado'
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {label}
        {config.drawsPerContest > 1 ? ' — 1º sorteio' : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {contest.numbers.map((n, i) => (
          <NumberBall key={`${n}-${i}`} number={n} state="drawn" size="lg" lotterySlug={config.slug} />
        ))}
      </div>
      {config.drawsPerContest > 1 && contest.secondaryNumbers.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-400">2º sorteio</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {contest.secondaryNumbers.map((n, i) => (
              <NumberBall key={`2-${n}-${i}`} number={n} state="drawn" size="lg" lotterySlug={config.slug} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PrizeTable({ contest }: { contest: ResultsContestRow }) {
  if (contest.prizes.length === 0) {
    return <p className="mt-4 text-sm text-ink-600">Nenhuma faixa de premiação cadastrada para este concurso.</p>
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-ink-400">
            <th className="pb-2 font-normal">Faixa</th>
            <th className="pb-2 font-normal">Ganhadores</th>
            <th className="pb-2 text-right font-normal">Prêmio (cada)</th>
          </tr>
        </thead>
        <tbody>
          {contest.prizes.map((prize) => (
            <tr key={prize.tier} className="border-t border-ink-200">
              <td className="py-2 font-medium text-ink-900">{prize.label}</td>
              <td className="py-2 text-ink-600">{formatNumber(prize.winnersCount)}</td>
              <td className="py-2 text-right font-medium text-ink-900">{formatCents(prize.prizeCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function ResultadosModalidadePage({ params }: PageParams) {
  const { modalidade } = await params
  const data = await getResultsPageData(modalidade)

  // Distingue "slug inexistente" (404 de verdade) de "modalidade válida, mas ainda
  // sem dados" (banco vazio ou fora do ar — inclusive durante o `next build`, que
  // roda sem banco). Sem essa distinção a página seria pré-renderizada como 404 e
  // ficaria assim até o ISR revalidar. Ver data.ts.
  if (!data) {
    if (!findLotteryConfig(modalidade)) notFound()
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Resultados a caminho</h1>
        <p style={{ color: 'var(--ink-600)' }}>
          Estamos carregando os resultados desta modalidade. Atualize a página em alguns instantes.
        </p>
      </main>
    )
  }

  const { config, lotteryName, recent, mostDrawn, leastDrawn } = data
  const latest = recent[0] ?? null
  const scheduleText = describeDrawSchedule(config.drawSchedule)
  const showStats = mostDrawn.length > 0
  const canonical = `${SITE_URL}/resultados/${config.slug}`
  const extraResultText = latest ? describeExtraResult(config, latest.extraResult) : null

  const faqItems = latest
    ? [
        {
          q: `Quando sai o resultado da ${lotteryName}?`,
          a: `Os sorteios da ${lotteryName} acontecem ${scheduleText} (horário de Brasília). O resultado aparece nesta página poucos minutos depois de divulgado.`,
        },
        {
          q: `Como conferir meu jogo da ${lotteryName} online, de graça?`,
          a: `Marque suas dezenas no nosso conferidor público, sem precisar criar conta, ou cadastre-se grátis no LotoPro para ter a conferência automática em todo concurso novo.`,
        },
        latest.isAccumulated
          ? {
              q: `A ${lotteryName} acumulou no concurso ${latest.number}?`,
              a: `Sim, ninguém acertou a faixa principal do concurso ${latest.number} da ${lotteryName}. O prêmio segue para o próximo sorteio.`,
            }
          : {
              q: `O concurso ${latest.number} da ${lotteryName} teve ganhador?`,
              a: `Sim — veja a tabela de premiação por faixa acima para os detalhes de quantos ganhadores e o valor de cada faixa.`,
            },
      ]
    : []

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `Resultados da ${lotteryName} — LotoPro`,
      description: `Histórico de resultados da ${lotteryName}: dezenas sorteadas, premiação por faixa e acumulados, atualizado a cada concurso.`,
      url: canonical,
      creator: { '@type': 'Organization', name: 'LotoPro' },
      ...(latest
        ? { temporal: latest.drawDate.toISOString(), dateModified: latest.drawDate.toISOString() }
        : {}),
    },
    ...(faqItems.length > 0
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqItems.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          },
        ]
      : []),
  ]

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-4xl">
        {/* eslint-disable-next-line react/no-danger -- JSON-LD estrutural, sem HTML de usuário */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <Badge lotterySlug={config.slug}>{lotteryName}</Badge>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          {latest ? `Resultado da ${lotteryName} — concurso ${latest.number}` : `Resultados da ${lotteryName}`}
        </h1>
        {latest && <p className="mt-2 text-ink-600">Sorteio de {formatDateBR(latest.drawDate)}</p>}
        <p className="mt-2 text-sm text-ink-400">Sorteios: {scheduleText}.</p>

        {!latest ? (
          <div className="mt-10 rounded-lg border border-ink-200 bg-white p-8 text-center">
            <p className="text-ink-900">
              Ainda não temos nenhum concurso da {lotteryName} sincronizado por aqui.
            </p>
            <p className="mt-2 text-sm text-ink-600">
              Assim que o próximo sorteio sair, o resultado aparece automaticamente nesta página.
            </p>
            <Link
              href="/cadastro"
              className="mt-6 inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Cadastre-se para ser avisado
            </Link>
          </div>
        ) : (
          <>
            {/* Resultado mais recente */}
            <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                {latest.isAccumulated && (
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                    Acumulou
                  </span>
                )}
                {latest.isSpecial && (
                  <span className="rounded-full bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">
                    Concurso especial
                  </span>
                )}
              </div>

              <div className="mt-3">
                <ContestNumbers contest={latest} config={config} />
              </div>

              {extraResultText && <p className="mt-4 text-sm text-ink-600">{extraResultText}</p>}

              <PrizeTable contest={latest} />

              <dl className="mt-4 grid gap-3 border-t border-ink-200 pt-4 text-sm sm:grid-cols-3">
                {latest.collectedCents !== null && (
                  <div>
                    <dt className="text-ink-400">Arrecadação</dt>
                    <dd className="font-medium text-ink-900">{formatCents(latest.collectedCents)}</dd>
                  </div>
                )}
                {latest.accumulatedNextCents !== null && (
                  <div>
                    <dt className="text-ink-400">Acumulado para o próximo</dt>
                    <dd className="font-medium text-ink-900">{formatCents(latest.accumulatedNextCents)}</dd>
                  </div>
                )}
                {latest.estimatedNextCents !== null && (
                  <div>
                    <dt className="text-ink-400">Estimativa do próximo prêmio</dt>
                    <dd className="font-medium text-ink-900">{formatCents(latest.estimatedNextCents)}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/conferir/${config.slug}`}
                  className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Conferir meus jogos deste concurso, grátis
                </Link>
                <Link
                  href="/cadastro"
                  className="rounded-md border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
                >
                  Cadastrar e conferir automático todo concurso
                </Link>
              </div>
            </div>

            {/* Últimos concursos */}
            <div className="mt-10">
              <h2 className="font-display text-xl font-bold text-ink-900">Últimos concursos</h2>
              <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-ink-50 text-ink-400">
                      <th className="p-3 font-normal">Concurso</th>
                      <th className="p-3 font-normal">Data</th>
                      <th className="p-3 font-normal">Dezenas</th>
                      <th className="p-3 font-normal">Acumulou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((contest) => (
                      <tr key={contest.number} className="border-t border-ink-200">
                        <td className="p-3 font-medium text-ink-900">{contest.number}</td>
                        <td className="p-3 text-ink-600">{formatDateBR(contest.drawDate)}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {contest.numbers.map((n, i) => (
                              <NumberBall key={`${n}-${i}`} number={n} state="drawn" size="sm" lotterySlug={config.slug} />
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-ink-600">{contest.isAccumulated ? 'Sim' : 'Não'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Estatística resumida — conteúdo único, docs/08 §A.4. */}
            {showStats && (
              <div className="mt-10 rounded-lg border border-ink-200 bg-white p-6">
                <h2 className="font-display text-xl font-bold text-ink-900">
                  Dezenas mais e menos sorteadas
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  Considerando os últimos {recent.length < 50 ? recent.length : 50} concursos da {lotteryName}.
                </p>

                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Mais sorteadas</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {mostDrawn.map((f) => (
                        <div key={f.number} className="flex flex-col items-center gap-1">
                          <NumberBall number={f.number} state="selected" size="md" lotterySlug={config.slug} />
                          <span className="text-xs text-ink-600">{f.count}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Menos sorteadas</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {leastDrawn.map((f) => (
                        <div key={f.number} className="flex flex-col items-center gap-1">
                          <NumberBall number={f.number} state="missed" size="md" lotterySlug={config.slug} />
                          <span className="text-xs text-ink-600">{f.count}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* D4 — disclaimer obrigatório em toda tela de estatística (docs/03 §3.4). Texto literal. */}
                <p className="mt-6 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-400">
                  Loterias são jogos de azar. Os sorteios são eventos independentes e aleatórios:
                  resultados passados não influenciam resultados futuros. Nenhuma estratégia, filtro
                  ou fechamento aumenta a probabilidade de acerto. Estas ferramentas servem para
                  organizar e analisar seus jogos, não para prever resultados.
                </p>
              </div>
            )}

            {/* FAQ visível (também no JSON-LD acima) */}
            {faqItems.length > 0 && (
              <div className="mt-10">
                <h2 className="font-display text-xl font-bold text-ink-900">Perguntas frequentes</h2>
                <dl className="mt-4 space-y-4">
                  {faqItems.map((item) => (
                    <div key={item.q} className="rounded-lg border border-ink-200 bg-white p-5">
                      <dt className="font-semibold text-ink-900">{item.q}</dt>
                      <dd className="mt-1 text-sm text-ink-600">{item.a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

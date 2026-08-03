import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ALL_LOTTERIES, findLotteryConfig, type LotteryConfig } from '@lotopro/core'
import { getCheckerPageData } from './data'
import { PublicChecker } from './PublicChecker'
import type { CheckerContestDTO } from './types'
import { formatDateBR } from '@/app/(marketing)/lib/format'
import { formatIsoDateInSaoPaulo } from '@/app/(marketing)/lib/timezone'
import { SITE_URL } from '@/app/(marketing)/lib/site'

/** LP-08 é SSR no doc (docs/08 §A.2) — mantemos ISR curto para acompanhar concursos novos. */
export const revalidate = 300

export async function generateStaticParams() {
  return ALL_LOTTERIES.map((lottery) => ({ modalidade: lottery.slug }))
}

type PageParams = { params: Promise<{ modalidade: string }> }

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { modalidade } = await params
  const data = await getCheckerPageData(modalidade)
  if (!data) return { title: 'Modalidade não encontrada' }
  return {
    title: `Conferir ${data.lotteryName} online, grátis`,
    description: `Marque suas dezenas e confira seu jogo da ${data.lotteryName} contra os últimos concursos, sem cadastro e sem custo.`,
    alternates: { canonical: `${SITE_URL}/conferir/${data.config.slug}` },
  }
}

/**
 * Nem toda modalidade cabe no conferidor público interativo hoje:
 *  - Super Sete/Loteca são `COLUMNS`/`MATCH_LIST` — apostadas por coluna, não por um único
 *    `NumberGrid` de dezenas (packages/ui/src/NumberGrid.tsx não modela colunas).
 *  - Federal não tem `prizeTiers` cadastradas e o "universo" é o bilhete (0–99999) — um
 *    `NumberGrid` desse tamanho não faz sentido de UI, e não haveria o que conferir.
 *  - +Milionária: TODAS as faixas exigem o campo extra (trevos) — são faixas "cruzadas"
 *    (packages/core/src/checking/check.ts `tierCountFor`, ramo `CLOVER`). Como o conferidor
 *    público não coleta trevos (ver disclaimer em `PublicChecker.tsx`), sem esse dado
 *    `computeExtraHits` volta `null` e TODA faixa zera — reportaríamos "nenhum prêmio" mesmo
 *    para quem acertou as 6 dezenas. Preferimos não suportar a modalidade a mentir o resultado.
 */
function isPublicCheckerSupported(config: LotteryConfig): boolean {
  if (config.format !== 'PICK_N') return false
  if (config.slug === 'federal') return false
  if (config.slug === 'maismilionaria') return false
  return true
}

export default async function ConferirModalidadePage({ params }: PageParams) {
  const { modalidade } = await params
  const data = await getCheckerPageData(modalidade)

  // Ver nota idêntica em resultados/[modalidade]/page.tsx: slug inválido é 404,
  // modalidade válida sem dados é estado transitório (build sem banco / ISR).
  if (!data) {
    if (!findLotteryConfig(modalidade)) notFound()
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Conferidor a caminho</h1>
        <p style={{ color: 'var(--ink-600)' }}>
          Estamos carregando os concursos desta modalidade. Atualize a página em alguns instantes.
        </p>
      </main>
    )
  }

  const { config, lotteryName, contests } = data
  const supported = isPublicCheckerSupported(config)

  const dtoContests: CheckerContestDTO[] = contests.map((contest) => ({
    id: contest.id,
    number: contest.number,
    drawDateIso: formatIsoDateInSaoPaulo(contest.drawDate),
    drawDateBR: formatDateBR(contest.drawDate),
    numbers: contest.numbers,
    numbersDrawOrder: contest.numbersDrawOrder,
    secondaryNumbers: contest.secondaryNumbers,
    prizes: contest.prizes.map((prize) => ({
      tier: prize.tier,
      label: prize.label,
      winnersCount: prize.winnersCount,
      prizeCentsStr: prize.prizeCents.toString(),
    })),
  }))

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Confira seu jogo da {lotteryName}, grátis
        </h1>
        <p className="mt-4 text-lg text-ink-600">
          Marque as dezenas que você apostou e veja na hora se acertou — sem criar conta, direto
          contra os últimos concursos oficiais.
        </p>

        {!supported ? (
          <div className="mt-10 rounded-lg border border-ink-200 bg-white p-8 text-center">
            <p className="text-ink-900">
              O conferidor público ainda não está disponível para {lotteryName}.
            </p>
            <p className="mt-2 text-sm text-ink-600">
              Crie uma conta grátis para cadastrar e conferir automaticamente os seus jogos desta
              modalidade.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/resultados/${config.slug}`}
                className="rounded-md border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
              >
                Ver resultados da {lotteryName}
              </Link>
              <Link
                href="/cadastro"
                className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Criar conta grátis
              </Link>
            </div>
          </div>
        ) : contests.length === 0 ? (
          <div className="mt-10 rounded-lg border border-ink-200 bg-white p-8 text-center">
            <p className="text-ink-900">
              Ainda não temos concursos da {lotteryName} sincronizados por aqui.
            </p>
            <Link
              href="/cadastro"
              className="mt-6 inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Cadastre-se para ser avisado
            </Link>
          </div>
        ) : (
          <div className="mt-10 rounded-lg border border-ink-200 bg-white p-6">
            <PublicChecker lotterySlug={config.slug} contests={dtoContests} />
          </div>
        )}

        <p className="mt-8 text-sm text-ink-600">
          Quer parar de conferir na mão? Veja como funciona a{' '}
          <Link href="/recursos" className="font-semibold text-brand-700 hover:underline">
            conferência automática
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

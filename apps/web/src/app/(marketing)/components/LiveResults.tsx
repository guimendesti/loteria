import Link from 'next/link'
import { prisma } from '@lotopro/db'
import { NumberBall, Badge } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'
import { formatDateBR } from '@/app/(marketing)/lib/format'

/**
 * Seção 6 — Resultados ao vivo (docs/08 §A.3.6): últimos concursos de Mega e
 * Lotofácil, também alimentando SEO e dando utilidade imediata. Server
 * Component assíncrono, consultando `@lotopro/db` (Prisma) DIRETO — mesma
 * decisão de LP-07 (`resultados/[modalidade]`): os routers tRPC de `contests`
 * existem, mas para um Server Component é mais simples e menos acoplado ler
 * o banco diretamente do que ir e voltar por HTTP. Ver `revalidate` no
 * `page.tsx` da home (ISR, docs/08 §A.4).
 */
const TEASER_LOTTERIES: readonly LotterySlug[] = ['megasena', 'lotofacil']

interface TeaserResult {
  slug: LotterySlug
  name: string
  contestNumber: number
  drawDate: Date
  numbers: number[]
  isAccumulated: boolean
}

async function getTeaserResults(): Promise<TeaserResult[]> {
  const lotteries = await prisma.lottery.findMany({
    where: { slug: { in: [...TEASER_LOTTERIES] } },
    select: { id: true, slug: true, name: true },
  })

  const results = await Promise.all(
    lotteries.map(async (lottery) => {
      const contest = await prisma.contest.findFirst({
        where: { lotteryId: lottery.id },
        orderBy: { number: 'desc' },
        select: { number: true, drawDate: true, numbers: true, isAccumulated: true },
      })
      if (!contest) return null
      return {
        slug: lottery.slug as LotterySlug,
        name: lottery.name,
        contestNumber: contest.number,
        drawDate: contest.drawDate,
        numbers: contest.numbers,
        isAccumulated: contest.isAccumulated,
      }
    }),
  )

  // Preserva a ordem de TEASER_LOTTERIES (Mega antes de Lotofácil), não a ordem de retorno do banco.
  const bySlug = new Map(results.filter((r): r is TeaserResult => r !== null).map((r) => [r.slug, r]))
  return TEASER_LOTTERIES.map((slug) => bySlug.get(slug)).filter((r): r is TeaserResult => r !== undefined)
}

export async function LiveResults() {
  const results = await getTeaserResults()

  return (
    <section className="bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-ink-900">Resultados ao vivo</h2>
          <Link href="/resultados/megasena" className="text-sm font-semibold text-brand-700 hover:underline">
            Ver todas as modalidades →
          </Link>
        </div>

        {results.length === 0 ? (
          <p className="mt-8 rounded-lg border border-ink-200 bg-white p-6 text-sm text-ink-600">
            Ainda não temos concursos sincronizados por aqui. Assim que o primeiro sorteio for
            processado, o resultado aparece nesta seção automaticamente.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {results.map((result) => (
              <Link
                key={result.slug}
                href={`/resultados/${result.slug}`}
                className="block rounded-lg border border-ink-200 bg-white p-6 transition-colors hover:border-brand-500"
              >
                <div className="flex items-center justify-between">
                  <Badge lotterySlug={result.slug}>{result.name}</Badge>
                  {result.isAccumulated && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                      Acumulou
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-ink-600">
                  Concurso {result.contestNumber} · {formatDateBR(result.drawDate)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.numbers.map((n) => (
                    <NumberBall key={n} number={n} state="drawn" size="sm" lotterySlug={result.slug} />
                  ))}
                </div>
                <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
                  Ver resultado completo →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

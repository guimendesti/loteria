'use client'

import { use } from 'react'
import Link from 'next/link'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { ContestResultCard } from '../../components/ContestResultCard'

const VALID_SLUGS = new Set<string>(ALL_LOTTERIES.map((lottery) => lottery.slug))

function isLotterySlug(value: string): value is LotterySlug {
  return VALID_SLUGS.has(value)
}

/** CL-70/71 — Detalhe de um concurso, acessado via busca por número ou link direto. */
export default function ContestDetailPage({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = use(params)
  const number = Number(numero)
  const validSlug = isLotterySlug(slug)
  const validNumber = Number.isInteger(number) && number > 0
  const lotterySlugParam: LotterySlug = validSlug ? slug : 'megasena'

  const contestQuery = trpc.contests.byNumber.useQuery(
    { lotterySlug: lotterySlugParam, number: validNumber ? number : 1 },
    { enabled: validSlug && validNumber, retry: false },
  )

  return (
    <div className="max-w-2xl">
      <Link href="/app/resultados" className="text-sm font-medium text-brand-500 hover:text-brand-700">
        ← Resultados
      </Link>

      <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Resultado do concurso</h1>

      <div className="mt-4">
        {!validSlug || !validNumber ? (
          <p className="text-sm text-danger">Link de concurso inválido.</p>
        ) : contestQuery.isLoading ? (
          <p className="text-sm text-ink-600">Carregando…</p>
        ) : contestQuery.isError || !contestQuery.data ? (
          <p className="text-sm text-ink-600">
            Concurso {number} não encontrado para esta modalidade — pode ainda não ter sido sorteado ou publicado.
          </p>
        ) : (
          <ContestResultCard
            lotterySlug={contestQuery.data.lotterySlug as LotterySlug}
            contest={contestQuery.data.contest}
            numberBallSize="lg"
          />
        )}
      </div>
    </div>
  )
}

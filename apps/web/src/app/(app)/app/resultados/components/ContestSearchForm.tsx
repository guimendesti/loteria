'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { LotterySlug } from '@lotopro/core'

export interface ContestSearchFormProps {
  lotteries: { slug: LotterySlug; name: string }[]
  defaultLotterySlug?: LotterySlug
}

/** CL-71 — busca de concurso por número (a busca por data fica como pendência, ver relatório). */
export function ContestSearchForm({ lotteries, defaultLotterySlug }: ContestSearchFormProps) {
  const router = useRouter()
  const firstSlug = lotteries[0]?.slug ?? 'megasena'
  const [slug, setSlug] = useState<LotterySlug>(defaultLotterySlug ?? firstSlug)
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(number)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Informe um número de concurso válido.')
      return
    }
    setError(null)
    router.push(`/app/resultados/${slug}/${parsed}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="contest-search-lottery" className="block text-xs text-ink-600">
          Modalidade
        </label>
        <select
          id="contest-search-lottery"
          value={slug}
          onChange={(event) => setSlug(event.target.value as LotterySlug)}
          className="mt-1 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
        >
          {lotteries.map((lottery) => (
            <option key={lottery.slug} value={lottery.slug}>
              {lottery.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="contest-search-number" className="block text-xs text-ink-600">
          Nº do concurso
        </label>
        <input
          id="contest-search-number"
          type="number"
          min={1}
          inputMode="numeric"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="Ex.: 3040"
          aria-describedby={error ? 'contest-search-error' : undefined}
          className="mt-1 w-32 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Buscar concurso
      </button>
      {error ? (
        <p id="contest-search-error" role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}

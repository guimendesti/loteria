'use client'

/**
 * LP-08 — Conferidor público (docs/08 §A.4, "a maior isca de aquisição").
 *
 * Roda inteiramente no navegador: o visitante marca as dezenas no `NumberGrid`
 * (@lotopro/ui), escolhe um dos últimos concursos e a conferência usa
 * `check()`/`getLotteryConfig()` de `@lotopro/core` — funções PURAS, sem
 * requisição ao servidor. O resultado dos últimos concursos já veio embutido
 * como prop (`contests`), servido pelo Server Component pai
 * (`page.tsx` → `getCheckerPageData`). Sem login, sem chamada de API.
 *
 * Limite de 3 conferências por sessão (docs/08 §A.4) — "soft": guardado em
 * `sessionStorage`, contornável trivialmente (ex.: aba anônima); o objetivo é
 * só um empurrão para o cadastro, não uma trava de segurança.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NumberGrid, NumberBall } from '@lotopro/ui'
import { check, getLotteryConfig } from '@lotopro/core'
import type { BetInput, CheckOutcome, ContestPrizeData, ContestResult, LotterySlug } from '@lotopro/core'
import { formatCents } from '@/app/(marketing)/lib/format'
import { useResponsiveColumns } from '@/app/(marketing)/lib/use-responsive-columns'
import type { CheckerContestDTO } from './types'

const SOFT_LIMIT = 3
const SESSION_KEY = 'lotopro-public-check-count'

export interface PublicCheckerProps {
  lotterySlug: LotterySlug
  contests: CheckerContestDTO[]
}

/**
 * Reconstrói `ContestPrizeData[]` a partir do DTO, incluindo o reagrupamento
 * de `tier`/`drawIndex` para modalidades com mais de um sorteio por concurso
 * (Dupla Sena) — mesma lógica de `apps/worker/src/jobs/check-bets.ts`
 * `reconstructPrizes` (duplicada aqui: (marketing) não importa de apps/worker,
 * ver relatório da tarefa).
 */
function reconstructPrizes(prizes: CheckerContestDTO['prizes'], drawsPerContest: number): ContestPrizeData[] {
  const sorted = [...prizes].sort((a, b) => a.tier - b.tier)
  if (drawsPerContest <= 1) {
    return sorted.map((row) => ({
      tier: row.tier,
      label: row.label,
      winnersCount: row.winnersCount,
      prizeCents: BigInt(row.prizeCentsStr),
      drawIndex: null,
    }))
  }
  const groupSize = Math.max(1, Math.ceil(sorted.length / drawsPerContest))
  return sorted.map((row, index) => ({
    tier: (index % groupSize) + 1,
    label: row.label,
    winnersCount: row.winnersCount,
    prizeCents: BigInt(row.prizeCentsStr),
    drawIndex: Math.floor(index / groupSize) + 1,
  }))
}

/**
 * `extraResult: null` sempre — o conferidor público não coleta trevos/mês/time
 * do visitante, então nenhuma faixa que dependa do campo extra é avaliada
 * (ver disclaimer na UI). `collectedCents`/`accumulatedNextCents`/
 * `estimatedNextCents`/`isAccumulated`/`nextContestNumber`/`raw` não são lidos
 * por `check()` (packages/core/src/checking/check.ts) — valores neutros.
 */
function toContestResult(dto: CheckerContestDTO, lottery: LotterySlug, drawsPerContest: number): ContestResult {
  return {
    lottery,
    contestNumber: dto.number,
    drawDate: dto.drawDateIso,
    numbers: dto.numbers,
    numbersDrawOrder: dto.numbersDrawOrder,
    secondaryNumbers: dto.secondaryNumbers,
    extraResult: null,
    isAccumulated: false,
    prizes: reconstructPrizes(dto.prizes, drawsPerContest),
    collectedCents: null,
    accumulatedNextCents: null,
    estimatedNextCents: null,
    nextContestNumber: null,
    raw: null,
  }
}

export function PublicChecker({ lotterySlug, contests }: PublicCheckerProps) {
  const config = getLotteryConfig(lotterySlug)
  const columns = useResponsiveColumns()

  const [selectedContestId, setSelectedContestId] = useState(contests[0]?.id ?? '')
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [checkCount, setCheckCount] = useState(0)
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null)
  const [checkedContest, setCheckedContest] = useState<CheckerContestDTO | null>(null)

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    setCheckCount(stored ? Number.parseInt(stored, 10) || 0 : 0)
  }, [])

  const selectedContest = contests.find((c) => c.id === selectedContestId) ?? null
  const withinLimits = selectedNumbers.length >= config.picksMin && selectedNumbers.length <= config.picksMax
  const reachedSoftLimit = checkCount >= SOFT_LIMIT
  const canCheck = withinLimits && selectedContest !== null && !reachedSoftLimit

  function handleCheck() {
    if (!selectedContest || !withinLimits) return
    const betInput: BetInput = { lottery: lotterySlug, numbers: selectedNumbers }
    const contestResult = toContestResult(selectedContest, lotterySlug, config.drawsPerContest)
    setOutcome(check(config, betInput, contestResult))
    setCheckedContest(selectedContest)

    const next = checkCount + 1
    setCheckCount(next)
    window.sessionStorage.setItem(SESSION_KEY, String(next))
  }

  function handleClear() {
    setSelectedNumbers([])
    setOutcome(null)
    setCheckedContest(null)
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink-900">Concurso</span>
          <select
            value={selectedContestId}
            onChange={(e) => {
              setSelectedContestId(e.target.value)
              setOutcome(null)
              setCheckedContest(null)
            }}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                Concurso {c.number} — {c.drawDateBR}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-ink-900">Suas dezenas</p>
        <div className="mt-2">
          <NumberGrid
            universeMin={config.universeMin}
            universeMax={config.universeMax}
            picksMin={config.picksMin}
            picksMax={config.picksMax}
            selected={selectedNumbers}
            onChange={setSelectedNumbers}
            lotterySlug={lotterySlug}
            columns={columns}
          />
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="mt-3 text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          Limpar seleção
        </button>
      </div>

      {config.extraField !== null && (
        <p className="mt-4 text-xs text-ink-400">
          Este conferidor confere apenas as dezenas escolhidas. Faixas que dependem do campo extra
          (trevos, Mês da Sorte ou Time do Coração) não são avaliadas aqui — crie uma conta grátis
          para a conferência completa e automática.
        </p>
      )}

      <div className="mt-6">
        {reachedSoftLimit ? (
          <div className="rounded-lg border border-brand-500/30 bg-brand-100 p-4 text-sm text-brand-900">
            Você já conferiu {checkCount} vezes gratuitamente nesta sessão. Crie uma conta grátis
            para conferência ilimitada e automática em todo concurso.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCheck}
            disabled={!canCheck}
            className="rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Conferir
          </button>
        )}
        {!withinLimits && selectedNumbers.length > 0 && (
          <p className="mt-2 text-sm text-ink-600">
            {config.name} exige de {config.picksMin} a {config.picksMax} dezenas — você selecionou{' '}
            {selectedNumbers.length}.
          </p>
        )}
      </div>

      {outcome && checkedContest && (
        <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6">
          <p className="font-display text-lg font-semibold text-ink-900">
            Resultado no concurso {checkedContest.number}
          </p>

          {outcome.draws.map((draw) => {
            const drawnNumbers = draw.drawIndex === 2 ? checkedContest.secondaryNumbers : checkedContest.numbers
            const drawnSet = new Set(drawnNumbers)
            const bestTier =
              draw.prizeTier !== null
                ? config.prizeTiers.find(
                    (t) => t.tier === draw.prizeTier && (t.drawIndex === null || t.drawIndex === draw.drawIndex),
                  )
                : null

            return (
              <div key={draw.drawIndex} className="mt-4 border-t border-ink-200 pt-4 first:mt-2 first:border-t-0 first:pt-0">
                {config.drawsPerContest > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    {draw.drawIndex}º sorteio
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedNumbers.map((n) => (
                    <NumberBall
                      key={n}
                      number={n}
                      state={drawnSet.has(n) ? 'hit' : 'missed'}
                      size="md"
                      lotterySlug={lotterySlug}
                    />
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-900">
                  <strong>{draw.hits}</strong> acerto{draw.hits === 1 ? '' : 's'}
                  {draw.prizeCents > 0n && bestTier ? ` — premiado na faixa "${bestTier.label}"` : ''}
                </p>
                <p className="font-display text-xl font-bold text-ink-900">
                  {draw.prizeCents > 0n ? formatCents(draw.prizeCents) : 'Sem premiação neste concurso'}
                </p>
              </div>
            )
          })}

          {config.drawsPerContest > 1 && (
            <p className="mt-4 border-t border-ink-200 pt-4 text-sm font-semibold text-ink-900">
              Total: {formatCents(outcome.totalPrizeCents)}
            </p>
          )}

          <div className="mt-6 rounded-lg bg-brand-100 p-4 text-center">
            <p className="text-sm font-medium text-brand-900">
              Quer que a gente confira automaticamente todo concurso?
            </p>
            <Link
              href="/cadastro"
              className="mt-3 inline-block rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

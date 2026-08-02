'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NumberGrid, Badge } from '@lotopro/ui'
import {
  ALL_LOTTERIES,
  getLotteryConfig,
  validateBet,
  columnLayout,
  type BetInput,
  type ExtraPicks,
  type LotterySlug,
  type ValidationError,
} from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents } from '../../components/format-cents'
import { estimateBetCostCents, MAX_CONTESTS_PER_BET } from '../../components/bet-cost-estimate'
import { useResponsiveColumns } from '../../components/use-responsive-columns'
import { setToast } from '../../components/toast'
import { ColumnsPicker } from '../../components/ColumnsPicker'
import { MONTH_NAMES } from '../../components/labels'

/** Apenas modalidades apostáveis pelo motor (Federal não tem tabela de preço). */
const BETTABLE_LOTTERIES = ALL_LOTTERIES.filter((lottery) => lottery.priceTiers.length > 0)

/** Sorteio embaralhado sem viés perceptível de índice (Fisher-Yates via chave aleatória). */
function randomPick(min: number, max: number, count: number): number[] {
  const pool: number[] = []
  for (let n = min; n <= max; n++) pool.push(n)
  const shuffled = pool
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
  return shuffled.slice(0, Math.min(count, shuffled.length)).sort((a, b) => a - b)
}

/** CL-12/CL-13/CL-14 — Cadastro manual de jogo, multi-concurso, custo em tempo real. */
export default function NovoJogoPage() {
  const router = useRouter()
  const gridColumns = useResponsiveColumns()

  const [lotterySlug, setLotterySlug] = useState<LotterySlug | null>(null)
  const [numbers, setNumbers] = useState<number[]>([])
  const [clovers, setClovers] = useState<number[]>([])
  const [month, setMonth] = useState<number | ''>('')
  const [teamId, setTeamId] = useState('')
  const [columns, setColumns] = useState<number[][]>([])
  const [contestFrom, setContestFrom] = useState<number | ''>('')
  const [contestFromTouched, setContestFromTouched] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const config = lotterySlug ? getLotteryConfig(lotterySlug) : null

  const nextContestQuery = trpc.contests.latest.useQuery(
    { lotterySlug: lotterySlug ?? BETTABLE_LOTTERIES[0]!.slug, limit: 1 },
    { enabled: lotterySlug !== null },
  )

  useEffect(() => {
    if (!lotterySlug || contestFromTouched) return
    const latestNumber = nextContestQuery.data?.[0]?.contests[0]?.number
    setContestFrom((latestNumber ?? 0) + 1)
  }, [lotterySlug, nextContestQuery.data, contestFromTouched])

  const extra: ExtraPicks | undefined = useMemo(() => {
    if (!config?.extraField) return undefined
    const field = config.extraField
    if (field.kind === 'CLOVER') return { kind: 'CLOVER', clovers }
    if (field.kind === 'MONTH') return { kind: 'MONTH', month: month === '' ? 0 : month }
    return { kind: 'TEAM', teamId }
  }, [config, clovers, month, teamId])

  const betInput: BetInput | null = useMemo(() => {
    if (!config) return null
    if (config.format === 'PICK_N') {
      return { lottery: config.slug, numbers, ...(extra !== undefined ? { extra } : {}) }
    }
    return { lottery: config.slug, numbers: [], columns }
  }, [config, numbers, extra, columns])

  const validation = useMemo(() => (config && betInput ? validateBet(config, betInput) : null), [config, betInput])

  const contestFromNumber = typeof contestFrom === 'number' ? contestFrom : null
  const contestTo = contestFromNumber !== null ? contestFromNumber + quantity - 1 : null

  const cost = useMemo(() => {
    if (!config || !betInput || contestFromNumber === null || contestTo === null) return null
    return estimateBetCostCents(config, betInput, contestFromNumber, contestTo)
  }, [config, betInput, contestFromNumber, contestTo])

  const createMutation = trpc.bets.create.useMutation({
    onSuccess: () => {
      setToast('Jogo cadastrado com sucesso!')
      router.push('/app/jogos')
    },
  })

  function selectLottery(slug: LotterySlug) {
    setLotterySlug(slug)
    setNumbers([])
    setClovers([])
    setMonth('')
    setTeamId('')
    setColumns([])
    setContestFrom('')
    setContestFromTouched(false)
    setQuantity(1)
    setNotes('')
  }

  function handleSurpresinha() {
    if (!config) return
    if (config.format === 'PICK_N') {
      setNumbers(randomPick(config.universeMin, config.universeMax, config.picksMin))
      if (config.extraField?.kind === 'CLOVER') {
        setClovers(randomPick(config.extraField.min, config.extraField.max, config.extraField.picksMin))
      } else if (config.extraField?.kind === 'MONTH') {
        setMonth(1 + Math.floor(Math.random() * 12))
      }
    } else {
      const { columnCount } = columnLayout(config)
      const cols: number[][] = []
      for (let i = 0; i < columnCount; i++) cols.push(randomPick(config.universeMin, config.universeMax, 1))
      setColumns(cols)
    }
  }

  function handleClear() {
    setNumbers([])
    setClovers([])
    setMonth('')
    setTeamId('')
    setColumns([])
  }

  function handleSubmit() {
    if (!config || !betInput || contestFromNumber === null || contestTo === null) return
    createMutation.mutate({
      lotterySlug: config.slug,
      numbers: betInput.numbers,
      contestFrom: contestFromNumber,
      contestTo,
      ...(betInput.extra !== undefined ? { extra: betInput.extra } : {}),
      ...(config.format !== 'PICK_N' ? { columns: betInput.columns ?? [] } : {}),
      ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
    })
  }

  const serverErrors: ValidationError[] | null | undefined = createMutation.error?.data?.betValidationErrors
  const inlineErrors = (validation && !validation.ok ? validation.errors : []).filter(
    (error) => error.code !== 'TOO_FEW_PICKS',
  )

  const canSubmit = validation?.ok === true && contestFromNumber !== null && cost !== null && !createMutation.isPending

  if (!config) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Novo jogo</h1>
        <p className="mt-2 text-sm text-ink-600">Escolha a modalidade para começar.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BETTABLE_LOTTERIES.map((lottery) => (
            <button
              key={lottery.slug}
              type="button"
              onClick={() => selectLottery(lottery.slug)}
              className="flex flex-col items-start gap-2 rounded-lg border border-ink-200 bg-white p-4 text-left hover:border-brand-500"
            >
              <Badge lotterySlug={lottery.slug} />
              <span className="font-display text-base font-semibold text-ink-900">{lottery.name}</span>
              <span className="text-xs text-ink-400">
                {lottery.format === 'PICK_N'
                  ? `${lottery.picksMin} a ${lottery.picksMax} dezenas (${lottery.universeMin}–${lottery.universeMax})`
                  : `${columnLayout(lottery).columnCount} colunas`}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const counterLabel =
    config.format === 'PICK_N'
      ? `${numbers.length}/${config.picksMax} dezenas`
      : `${columns.filter((c) => c.length > 0).length}/${columnLayout(config).columnCount} colunas`

  return (
    <div className="max-w-2xl pb-28 md:pb-6">
      <button
        type="button"
        onClick={() => setLotterySlug(null)}
        className="text-sm font-medium text-brand-500 hover:text-brand-700"
      >
        ← Trocar modalidade
      </button>

      <div className="mt-2 flex items-center gap-2">
        <Badge lotterySlug={config.slug} />
        <h1 className="font-display text-2xl font-bold text-ink-900">{config.name}</h1>
      </div>

      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-4">
        {config.format === 'PICK_N' ? (
          <NumberGrid
            universeMin={config.universeMin}
            universeMax={config.universeMax}
            picksMin={config.picksMin}
            picksMax={config.picksMax}
            selected={numbers}
            onChange={setNumbers}
            lotterySlug={config.slug}
            columns={gridColumns}
          />
        ) : (
          <ColumnsPicker
            columnCount={columnLayout(config).columnCount}
            maxPerColumn={columnLayout(config).maxPerColumn}
            universeMin={config.universeMin}
            universeMax={config.universeMax}
            value={columns}
            onChange={setColumns}
            lotterySlug={config.slug}
          />
        )}

        {config.extraField?.kind === 'CLOVER' ? (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <p className="mb-2 text-sm font-medium text-ink-900">
              Trevos ({config.extraField.picksMin}–{config.extraField.picksMax})
            </p>
            <NumberGrid
              universeMin={config.extraField.min}
              universeMax={config.extraField.max}
              picksMin={config.extraField.picksMin}
              picksMax={config.extraField.picksMax}
              selected={clovers}
              onChange={setClovers}
              lotterySlug={config.slug}
              columns={Math.min(gridColumns, config.extraField.max - config.extraField.min + 1)}
            />
          </div>
        ) : null}

        {config.extraField?.kind === 'MONTH' ? (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <label className="block text-sm font-medium text-ink-900">
              Mês da Sorte
              <select
                value={month}
                onChange={(event) => setMonth(event.target.value === '' ? '' : Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
              >
                <option value="">Selecione…</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {config.extraField?.kind === 'TEAM' ? (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <label className="block text-sm font-medium text-ink-900">
              Time do Coração
              <input
                type="text"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                placeholder="Ex.: Flamengo"
                className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSurpresinha}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            🎲 Surpresinha
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            Limpar
          </button>
        </div>

        {inlineErrors.length > 0 ? (
          <ul className="mt-3 list-inside list-disc rounded-md bg-danger/10 p-3 text-sm text-danger">
            {inlineErrors.map((error) => (
              <li key={error.code}>{error.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
        <h2 className="font-display text-base font-semibold text-ink-900">Vale para quantos concursos?</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="text-sm font-medium text-ink-900">
            A partir do concurso
            <input
              type="number"
              min={1}
              value={contestFrom}
              onChange={(event) => {
                setContestFromTouched(true)
                const raw = event.target.value
                setContestFrom(raw === '' ? '' : Number(raw))
              }}
              className="mt-1 block w-32 rounded-md border border-ink-200 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm font-medium text-ink-900">
            Quantidade de concursos
            <select
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-1 block w-32 rounded-md border border-ink-200 px-3 py-2 text-base"
            >
              {Array.from({ length: MAX_CONTESTS_PER_BET }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-sm text-ink-600">
          {nextContestQuery.isLoading ? 'Carregando próximo concurso…' : `Valerá até o concurso ${contestTo ?? '—'}.`}
        </p>

        <label className="mt-4 block text-sm font-medium text-ink-900">
          Observações (opcional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>
      </div>

      {serverErrors && serverErrors.length > 0 ? (
        <ul className="mt-4 list-inside list-disc rounded-md bg-danger/10 p-3 text-sm text-danger">
          {serverErrors.map((error) => (
            <li key={error.code}>{error.message}</li>
          ))}
        </ul>
      ) : createMutation.isError ? (
        <p className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">
          Não foi possível salvar o jogo. Tente novamente.
        </p>
      ) : null}

      <div className="mt-6 hidden items-center justify-between rounded-lg border border-ink-200 bg-white p-4 md:flex">
        <div>
          <p className="text-sm text-ink-600">{counterLabel}</p>
          <p className="font-display text-2xl font-bold text-ink-900">{cost !== null ? formatCents(cost) : '—'}</p>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-brand-500 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Salvando…' : 'Salvar jogo'}
        </button>
      </div>

      {/* docs/09 §9.3 C2 — barra fixa inferior mobile com contador + custo + salvar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-ink-200 bg-white p-3 shadow-md md:hidden">
        <div>
          <p className="text-xs text-ink-600">{counterLabel}</p>
          <p className="font-display text-lg font-bold text-ink-900">{cost !== null ? formatCents(cost) : '—'}</p>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

'use client'

/**
 * BO-20/21 (docs/08 §D.4) — apostas globais + ferramenta de correção.
 *
 * Dois blocos: (1) listagem com filtros operacionais e (2) "Reprocessar conferência", a
 * ferramenta de correção BO-21 — apaga e refaz `BetCheck` de um concurso inteiro (todas as
 * apostas ativas que o cobrem) ou de uma aposta específica (todos os concursos dela). Ação
 * destrutiva (some com a conferência atual antes de recalcular): exige confirmação em duas
 * etapas antes de disparar `admin.bets.reprocessChecks`.
 */
import { useMemo, useState } from 'react'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents, formatDateTime } from '../../components/format'

const BETTABLE_LOTTERIES = ALL_LOTTERIES

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  GENERATED: 'Gerado',
  OCR: 'OCR',
  IMPORT: 'Importado',
  CLOSURE: 'Fechamento',
}

type PrizedFilter = 'all' | 'prized' | 'not-prized'

function lotteryName(slug: string): string {
  return BETTABLE_LOTTERIES.find((lottery) => lottery.slug === slug)?.name ?? slug
}

/**
 * Formas mínimas da resposta de `admin.bets.list` (server/routers/admin/bets.ts). Anotadas
 * aqui em vez de confiar na inferência do `trpc.admin.*` — até `_app.ts` registrar o router
 * `admin` (fora do território desta tarefa, ver relatório), `trpc.admin` resolve como `any` e
 * os callbacks abaixo perderiam a checagem de tipos sem essas anotações explícitas.
 */
interface AdminBetListItem {
  id: string
  user: { name: string; email: string }
  lottery: { name: string }
  contestFrom: number
  contestTo: number
  costCents: bigint
  isPrized: boolean
  totalPrizeCents: bigint
  checks: unknown[]
  source: string
  createdAt: string | Date
}
interface AdminBetListPage {
  items: AdminBetListItem[]
  nextCursor: string | undefined
}

export default function AdminApostasPage() {
  const [lotterySlug, setLotterySlug] = useState<LotterySlug | ''>('')
  const [userId, setUserId] = useState('')
  const [contestNumber, setContestNumber] = useState('')
  const [prized, setPrized] = useState<PrizedFilter>('all')
  const [source, setSource] = useState('')

  const listQuery = trpc.admin.bets.list.useInfiniteQuery(
    {
      ...(lotterySlug ? { lotterySlug } : {}),
      ...(userId.trim() ? { userId: userId.trim() } : {}),
      ...(contestNumber ? { contestNumber: Number(contestNumber) } : {}),
      ...(prized !== 'all' ? { prized: prized === 'prized' } : {}),
      ...(source ? { source: source as never } : {}),
      limit: 20,
    },
    { getNextPageParam: (lastPage: AdminBetListPage) => lastPage.nextCursor },
  )

  const items = useMemo<AdminBetListItem[]>(
    () => (listQuery.data?.pages ?? []).flatMap((page: AdminBetListPage) => page.items),
    [listQuery.data],
  )

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Apostas</h1>
      <p className="mt-1 text-sm text-ink-600">
        Listagem global de apostas (BO-20) e ferramenta de reprocessamento de conferência (BO-21).
      </p>

      <ReprocessPanel />

      <div className="mt-8 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Listagem</h2>

        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <select
            value={lotterySlug}
            onChange={(event) => setLotterySlug(event.target.value as LotterySlug | '')}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          >
            <option value="">Todas as modalidades</option>
            {BETTABLE_LOTTERIES.map((lottery) => (
              <option key={lottery.slug} value={lottery.slug}>
                {lottery.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="ID do usuário"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="w-40 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          />

          <input
            type="number"
            placeholder="Nº do concurso"
            value={contestNumber}
            onChange={(event) => setContestNumber(event.target.value)}
            className="w-36 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          />

          <select
            value={prized}
            onChange={(event) => setPrized(event.target.value as PrizedFilter)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          >
            <option value="all">Premiados e não premiados</option>
            <option value="prized">Só premiados</option>
            <option value="not-prized">Só não premiados</option>
          </select>

          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          >
            <option value="">Todas as origens</option>
            {Object.entries(SOURCE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="py-2 pr-3 font-medium">Usuário</th>
                <th className="py-2 pr-3 font-medium">Modalidade</th>
                <th className="py-2 pr-3 font-medium">Concursos</th>
                <th className="py-2 pr-3 font-medium">Custo</th>
                <th className="py-2 pr-3 font-medium">Prêmio</th>
                <th className="py-2 pr-3 font-medium">Origem</th>
                <th className="py-2 pr-3 font-medium">Criado em</th>
                <th className="py-2 pr-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-ink-600">
                    Carregando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-ink-600">
                    Nenhuma aposta encontrada com esses filtros.
                  </td>
                </tr>
              ) : (
                items.map((bet) => (
                  <tr key={bet.id} className="border-b border-ink-100 align-top text-ink-900">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{bet.user.name}</p>
                      <p className="text-xs text-ink-600">{bet.user.email}</p>
                    </td>
                    <td className="py-2 pr-3">{bet.lottery.name}</td>
                    <td className="py-2 pr-3">
                      {bet.contestFrom === bet.contestTo ? bet.contestFrom : `${bet.contestFrom}–${bet.contestTo}`}
                    </td>
                    <td className="py-2 pr-3">{formatCents(bet.costCents)}</td>
                    <td className="py-2 pr-3">
                      {bet.isPrized ? (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          {formatCents(bet.totalPrizeCents)}
                        </span>
                      ) : bet.checks.length > 0 ? (
                        <span className="text-xs text-ink-400">Sem prêmio</span>
                      ) : (
                        <span className="text-xs text-ink-400">Não conferido</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{SOURCE_LABEL[bet.source] ?? bet.source}</td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(bet.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <ReprocessBetButton betId={bet.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {listQuery.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => listQuery.fetchNextPage()}
              disabled={listQuery.isFetchingNextPage}
              className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
            >
              {listQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Reprocessar UMA aposta (todos os concursos dela) — confirmação em duas etapas. */
function ReprocessBetButton({ betId }: { betId: string }) {
  const [armed, setArmed] = useState(false)
  const utils = trpc.useUtils()
  const reprocess = trpc.admin.bets.reprocessChecks.useMutation({
    onSuccess: () => {
      setArmed(false)
      utils.admin.bets.list.invalidate()
    },
  })

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50"
      >
        Reprocessar
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-2">
      <p className="text-xs text-ink-900">Apaga e refaz a conferência desta aposta. Confirma?</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={reprocess.isPending}
          onClick={() => reprocess.mutate({ betId })}
          className="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {reprocess.isPending ? 'Reprocessando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
        >
          Cancelar
        </button>
      </div>
      {reprocess.error ? <p className="text-xs text-danger">{reprocess.error.message}</p> : null}
    </div>
  )
}

/** Reprocessar um CONCURSO inteiro (todas as apostas ativas que o cobrem) — mesma confirmação em duas etapas. */
function ReprocessPanel() {
  const [lotterySlug, setLotterySlug] = useState<LotterySlug>(BETTABLE_LOTTERIES[0]!.slug)
  const [contestNumber, setContestNumber] = useState('')
  const [armed, setArmed] = useState(false)

  const utils = trpc.useUtils()
  const reprocess = trpc.admin.bets.reprocessChecks.useMutation({
    onSuccess: () => {
      setArmed(false)
      utils.admin.bets.list.invalidate()
    },
  })

  const canSubmit = contestNumber.trim().length > 0 && Number(contestNumber) > 0

  return (
    <div className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Reprocessar conferência de um concurso</h2>
      <p className="mt-1 text-sm text-ink-600">
        Apaga TODAS as conferências (`BetCheck`) do concurso escolhido e refaz para as apostas
        atualmente ativas que o cobrem. Use depois de corrigir um bug de conferência ou as
        dezenas de um concurso — nunca duplica, mas é destrutivo (o estado anterior é
        substituído).
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Modalidade</span>
          <select
            value={lotterySlug}
            onChange={(event) => setLotterySlug(event.target.value as LotterySlug)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          >
            {BETTABLE_LOTTERIES.map((lottery) => (
              <option key={lottery.slug} value={lottery.slug}>
                {lottery.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Nº do concurso</span>
          <input
            type="number"
            value={contestNumber}
            onChange={(event) => setContestNumber(event.target.value)}
            className="w-36 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          />
        </label>

        {!armed ? (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setArmed(true)}
            className="rounded-md bg-warning px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Reprocessar concurso
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-900">
              Confirma reprocessar {lotteryName(lotterySlug)} #{contestNumber}?
            </span>
            <button
              type="button"
              disabled={reprocess.isPending}
              onClick={() => reprocess.mutate({ lotterySlug, contestNumber: Number(contestNumber) })}
              className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {reprocess.isPending ? 'Reprocessando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {reprocess.error ? <p className="mt-2 text-sm text-danger">{reprocess.error.message}</p> : null}
      {reprocess.isSuccess && reprocess.data.scope === 'contest' ? (
        <p className="mt-2 text-sm text-success">
          Reprocessado: {reprocess.data.processedBets} aposta(s), {reprocess.data.prizedBets} premiada(s),{' '}
          {reprocess.data.recreatedChecks} conferência(s) recriada(s).
        </p>
      ) : null}
    </div>
  )
}

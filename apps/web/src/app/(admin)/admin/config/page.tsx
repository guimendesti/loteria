'use client'

/**
 * BO-40/41/42 (docs/08 §D.6) — modalidades (campos seguros), re-sync e correção de concurso.
 *
 * `useAdminRole()` (ver `(admin)/components/AdminRoleContext.tsx`) esconde as ações de
 * ADMIN (editar modalidade, re-sync, corrigir concurso) para VIEWER/SUPPORT/FINANCE — só UX,
 * o servidor (`adminProcedure(UserRole.ADMIN)`) recusa de qualquer forma se alguém contornar
 * isso.
 */
import { useState } from 'react'
import { ALL_LOTTERIES } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { useAdminRole } from '../../components/AdminRoleContext'

export default function AdminConfigPage() {
  const role = useAdminRole()
  const isAdmin = role === 'ADMIN'

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Configurações</h1>
      <p className="mt-1 text-sm text-ink-600">
        Modalidades (BO-40), re-sync de concursos (BO-41) e correção manual de concurso (BO-42).
      </p>

      <LotteriesPanel canEdit={isAdmin} />
      {isAdmin ? <FixContestPanel /> : null}
    </div>
  )
}

function LotteriesPanel({ canEdit }: { canEdit: boolean }) {
  const query = trpc.admin.config.lotteries.list.useQuery()

  return (
    <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Modalidades</h2>
      <p className="mt-1 text-sm text-ink-600">
        Universo, dezenas por jogo e faixas de premiação são READ-ONLY aqui — a fonte é o
        catálogo estático de <code className="text-xs">packages/core</code>, não esta tabela.
        Só `ativo`, `ordem de exibição` e `cor` são editáveis pelo backoffice.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th className="py-2 pr-3 font-medium">Modalidade</th>
              <th className="py-2 pr-3 font-medium">Universo</th>
              <th className="py-2 pr-3 font-medium">Dezenas/jogo</th>
              <th className="py-2 pr-3 font-medium">Ativa</th>
              <th className="py-2 pr-3 font-medium">Ordem</th>
              <th className="py-2 pr-3 font-medium">Cor</th>
              <th className="py-2 pr-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-600">
                  Carregando…
                </td>
              </tr>
            ) : (
              (query.data ?? []).map((lottery: LotteryListRow) => (
                <LotteryRow key={lottery.id} lottery={lottery} canEdit={canEdit} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface LotteryListRow {
  id: string
  slug: string
  name: string
  isActive: boolean
  displayOrder: number
  colorToken: string
  coreConfig: { universeMin: number; universeMax: number; picksMin: number; picksMax: number } | null
}

function LotteryRow({ lottery, canEdit }: { lottery: LotteryListRow; canEdit: boolean }) {
  const utils = trpc.useUtils()
  const [isActive, setIsActive] = useState(lottery.isActive)
  const [displayOrder, setDisplayOrder] = useState(lottery.displayOrder)
  const [colorToken, setColorToken] = useState(lottery.colorToken)
  const [resyncArmed, setResyncArmed] = useState(false)

  const update = trpc.admin.config.lotteries.update.useMutation({
    onSuccess: () => utils.admin.config.lotteries.list.invalidate(),
  })
  const resync = trpc.admin.config.resync.useMutation({
    onSuccess: () => setResyncArmed(false),
  })

  const dirty = isActive !== lottery.isActive || displayOrder !== lottery.displayOrder || colorToken !== lottery.colorToken

  return (
    <tr className="border-b border-ink-100 align-top text-ink-900">
      <td className="py-2 pr-3 font-medium">{lottery.name}</td>
      <td className="py-2 pr-3 text-xs text-ink-600">
        {lottery.coreConfig ? `${lottery.coreConfig.universeMin}–${lottery.coreConfig.universeMax}` : '—'}
      </td>
      <td className="py-2 pr-3 text-xs text-ink-600">
        {lottery.coreConfig ? `${lottery.coreConfig.picksMin}–${lottery.coreConfig.picksMax}` : '—'}
      </td>
      <td className="py-2 pr-3">
        <input
          type="checkbox"
          checked={isActive}
          disabled={!canEdit}
          onChange={(event) => setIsActive(event.target.checked)}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="number"
          value={displayOrder}
          disabled={!canEdit}
          onChange={(event) => setDisplayOrder(Number(event.target.value))}
          className="w-16 rounded-md border border-ink-200 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="text"
          value={colorToken}
          disabled={!canEdit}
          onChange={(event) => setColorToken(event.target.value)}
          className="w-36 rounded-md border border-ink-200 px-2 py-1 text-xs"
        />
      </td>
      <td className="py-2 pr-3">
        {canEdit ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!dirty || update.isPending}
              onClick={() => update.mutate({ id: lottery.id, isActive, displayOrder, colorToken })}
              className="rounded-md bg-brand-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              {update.isPending ? 'Salvando…' : 'Salvar'}
            </button>

            {!resyncArmed ? (
              <button
                type="button"
                onClick={() => setResyncArmed(true)}
                className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50"
              >
                Re-sync
              </button>
            ) : (
              <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-2">
                <p className="text-xs text-ink-900">Enfileirar re-sync desta modalidade?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={resync.isPending}
                    onClick={() => resync.mutate({ lotterySlug: lottery.slug as never })}
                    className="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResyncArmed(false)}
                    className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {update.error ? <p className="text-xs text-danger">{update.error.message}</p> : null}
            {resync.error ? <p className="text-xs text-danger">{resync.error.message}</p> : null}
            {resync.isSuccess ? <p className="text-xs text-success">Enfileirado.</p> : null}
          </div>
        ) : (
          <span className="text-xs text-ink-400">Somente ADMIN</span>
        )}
      </td>
    </tr>
  )
}

/** BO-42 — correção manual de dezenas de um concurso. Dispara reprocessamento ao confirmar. */
function FixContestPanel() {
  const [lotterySlug, setLotterySlug] = useState(ALL_LOTTERIES[0]!.slug)
  const [contestNumber, setContestNumber] = useState('')
  const [searchedNumber, setSearchedNumber] = useState<number | null>(null)
  const [numbersText, setNumbersText] = useState('')
  const [armed, setArmed] = useState(false)

  const contestQuery = trpc.contests.byNumber.useQuery(
    { lotterySlug, number: searchedNumber ?? 0 },
    { enabled: searchedNumber !== null },
  )

  const utils = trpc.useUtils()
  const fixContest = trpc.admin.config.fixContest.useMutation({
    onSuccess: () => {
      setArmed(false)
      utils.admin.bets.list.invalidate()
    },
  })

  function handleSearch() {
    const parsed = Number(contestNumber)
    if (Number.isFinite(parsed) && parsed > 0) {
      setSearchedNumber(parsed)
      fixContest.reset()
    }
  }

  // `numbersText` só é preenchido quando o admin edita — antes disso, o campo mostra as
  // dezenas atuais do concurso via `value={numbersText || contest.numbers.join(', ')}` abaixo.
  const contest = contestQuery.data?.contest

  const parsedNumbers = numbersText
    .split(/[,\s]+/)
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  return (
    <div className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Corrigir dezenas de um concurso</h2>
      <p className="mt-1 text-sm text-ink-600">
        Corrige as dezenas oficiais de um concurso já persistido (erro de importação/parsing).
        Ao confirmar, o sistema APAGA e REFAZ a conferência (`BetCheck`) de TODAS as apostas
        ativas que cobrem esse concurso — pode mudar quem está premiado.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Modalidade</span>
          <select
            value={lotterySlug}
            onChange={(event) => {
              setLotterySlug(event.target.value as typeof lotterySlug)
              setSearchedNumber(null)
              setNumbersText('')
            }}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          >
            {ALL_LOTTERIES.map((lottery) => (
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
            className="w-32 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
          />
        </label>
        <button
          type="button"
          onClick={handleSearch}
          className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-ink-50"
        >
          Buscar
        </button>
      </div>

      {contestQuery.isLoading ? <p className="mt-3 text-sm text-ink-600">Buscando…</p> : null}
      {contestQuery.isError ? <p className="mt-3 text-sm text-danger">{contestQuery.error.message}</p> : null}

      {contest ? (
        <div className="mt-4">
          <p className="text-sm text-ink-900">
            Dezenas oficiais atuais: <strong>{contest.numbers.join(', ')}</strong>
          </p>
          <label className="mt-2 block text-sm">
            <span className="text-xs font-medium text-ink-600">Novas dezenas (separadas por vírgula ou espaço)</span>
            <input
              type="text"
              value={numbersText || contest.numbers.join(', ')}
              onChange={(event) => setNumbersText(event.target.value)}
              className="mt-1 w-full max-w-md rounded-md border border-ink-200 px-3 py-2 text-ink-900"
            />
          </label>

          {!armed ? (
            <button
              type="button"
              disabled={parsedNumbers.length === 0}
              onClick={() => setArmed(true)}
              className="mt-3 rounded-md bg-warning px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Corrigir e reprocessar
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-medium text-ink-900">
                Confirma gravar [{parsedNumbers.join(', ')}] e reprocessar todas as apostas deste concurso?
              </span>
              <button
                type="button"
                disabled={fixContest.isPending}
                onClick={() =>
                  fixContest.mutate({ contestId: contest.id, numbers: parsedNumbers })
                }
                className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {fixContest.isPending ? 'Corrigindo…' : 'Confirmar'}
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

          {fixContest.error ? <p className="mt-2 text-sm text-danger">{fixContest.error.message}</p> : null}
          {fixContest.isSuccess ? (
            <p className="mt-2 text-sm text-success">
              Corrigido. Reprocessado: {fixContest.data.reprocessed.processedBets} aposta(s),{' '}
              {fixContest.data.reprocessed.prizedBets} premiada(s).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NumberBall, Badge } from '@lotopro/ui'
import { getLotteryConfig, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { parseColumns, parseExtraPicks } from '@/server/lib/bet-json'
import { formatCents } from '../../components/format-cents'
import { ExtraPicksDisplay } from '../../components/ExtraPicksDisplay'
import { DuplicateBetDialog } from '../../components/DuplicateBetDialog'
import { BetPoolBadge } from '../../components/BetPoolBadge'
import { EDITABLE_POOL_STATUSES, PoolLinkSelect } from '../../components/PoolLinkSelect'
import { SOURCE_LABEL } from '../../components/labels'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** CL-21/CL-22 — Detalhe do jogo: histórico de conferências, acertos por dezena, ações. */
export default function BetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()

  const betQuery = trpc.bets.byId.useQuery({ id })
  const bet = betQuery.data

  const [showDuplicate, setShowDuplicate] = useState(false)
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  // Onda 8b — `undefined` = sem edição pendente do vínculo de bolão (mostra o
  // valor atual do servidor); `string | null` = rascunho local ainda não salvo.
  const [poolDraft, setPoolDraft] = useState<string | null | undefined>(undefined)

  const archiveMutation = trpc.bets.archive.useMutation({
    onSuccess: () => {
      utils.bets.byId.invalidate({ id })
      utils.bets.list.invalidate()
      utils.bets.summary.invalidate()
    },
  })
  const updateNotesMutation = trpc.bets.update.useMutation({
    onSuccess: () => {
      utils.bets.byId.invalidate({ id })
      setNotesDraft(null)
    },
  })
  const assignPoolMutation = trpc.bets.assignPool.useMutation({
    onSuccess: () => {
      utils.bets.byId.invalidate({ id })
      utils.bets.list.invalidate()
      setPoolDraft(undefined)
    },
  })

  // Hooks precisam rodar sempre, mesmo enquanto `bet` ainda é undefined —
  // por isso o array vazio de fallback, e o early-return só acontece depois.
  const checkContestQueries = trpc.useQueries((t) =>
    (bet?.checks ?? []).map((check) =>
      t.contests.byNumber(
        { lotterySlug: (bet?.lottery.slug ?? 'megasena') as LotterySlug, number: check.contestNumber },
        { retry: false },
      ),
    ),
  )

  if (betQuery.isLoading) {
    return <p className="text-sm text-ink-600">Carregando…</p>
  }

  if (betQuery.isError || !bet) {
    return (
      <div>
        <p className="text-sm text-danger">Jogo não encontrado.</p>
        <Link href="/app/jogos" className="mt-2 inline-block text-sm font-medium text-brand-500 hover:text-brand-700">
          ← Voltar para Meus Jogos
        </Link>
      </div>
    )
  }

  const lotterySlug = bet.lottery.slug as LotterySlug
  const config = getLotteryConfig(lotterySlug)
  const extra = parseExtraPicks(bet.extraPicks)
  const columns = parseColumns(bet.columns)
  const contestCount = bet.contestTo - bet.contestFrom + 1
  // Onda 8b — sem bolão vinculado, ou vinculado a um que ainda aceita mudança
  // de jogos (DRAFT/OPEN/CLOSED). A partir de BET_PLACED o servidor recusa
  // qualquer troca — aqui só escondemos o controle para não oferecer uma ação
  // que vai bater erro.
  const poolIsEditable = bet.pool === null || EDITABLE_POOL_STATUSES.includes(bet.pool.status)

  return (
    <div className="max-w-3xl">
      <Link href="/app/jogos" className="text-sm font-medium text-brand-500 hover:text-brand-700">
        ← Meus Jogos
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge lotterySlug={lotterySlug} />
          <h1 className="font-display text-2xl font-bold text-ink-900">
            {contestCount > 1 ? `Concursos ${bet.contestFrom}–${bet.contestTo}` : `Concurso ${bet.contestFrom}`}
          </h1>
          {!bet.isActive ? (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-400">Arquivado</span>
          ) : null}
          <BetPoolBadge pool={bet.pool} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowDuplicate(true)}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            Duplicar
          </button>
          {bet.isActive ? (
            <button
              type="button"
              onClick={() => archiveMutation.mutate({ id: bet.id })}
              disabled={archiveMutation.isPending}
              className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              {archiveMutation.isPending ? 'Arquivando…' : 'Arquivar'}
            </button>
          ) : null}
        </div>
      </div>

      {/* dezenas grandes */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        {config.format === 'PICK_N' ? (
          <div className="flex flex-wrap gap-2">
            {bet.numbers.map((n) => (
              <NumberBall key={n} number={n} state="selected" size="lg" lotterySlug={lotterySlug} />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {(columns ?? []).map((col, i) => (
              <div key={i} className="rounded-md border border-ink-200 p-2 text-center">
                <p className="text-xs text-ink-600">Col. {i + 1}</p>
                <div className="mt-1 flex gap-1">
                  {col.map((n) => (
                    <NumberBall key={n} number={n} state="selected" size="sm" lotterySlug={lotterySlug} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <ExtraPicksDisplay extra={extra} lotterySlug={lotterySlug} />
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-600">
            {SOURCE_LABEL[bet.source]} · {contestCount} concurso{contestCount > 1 ? 's' : ''}
          </span>
          <span className="font-display text-lg font-semibold text-ink-900">{formatCents(bet.costCents)}</span>
        </div>
      </div>

      {/* vínculo com bolão (Onda 8b, docs/contracts/onda8-bolao.md) */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-base font-semibold text-ink-900">Bolão</h2>

        {poolIsEditable ? (
          <div className="mt-3">
            <PoolLinkSelect
              value={poolDraft !== undefined ? poolDraft : (bet.pool?.id ?? null)}
              onChange={setPoolDraft}
              lotterySlug={lotterySlug}
            />
            {poolDraft !== undefined && poolDraft !== (bet.pool?.id ?? null) ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => assignPoolMutation.mutate({ betId: bet.id, poolId: poolDraft })}
                  disabled={assignPoolMutation.isPending}
                  className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {assignPoolMutation.isPending ? 'Salvando…' : 'Salvar vínculo'}
                </button>
                <button
                  type="button"
                  onClick={() => setPoolDraft(undefined)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {assignPoolMutation.isError ? (
              <p className="mt-2 text-sm text-danger">{assignPoolMutation.error.message}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-600">
            Os jogos do bolão &ldquo;{bet.pool?.name}&rdquo; já foram registrados na lotérica — o vínculo está
            congelado e não pode mais ser alterado por aqui.
          </p>
        )}
      </div>

      {/* observações */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-base font-semibold text-ink-900">Observações</h2>
        <textarea
          value={notesDraft ?? bet.notes ?? ''}
          onChange={(event) => setNotesDraft(event.target.value)}
          rows={3}
          placeholder="Nenhuma observação"
          className="mt-2 w-full rounded-md border border-ink-200 p-2 text-sm"
        />
        {notesDraft !== null && notesDraft !== (bet.notes ?? '') ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => updateNotesMutation.mutate({ id: bet.id, notes: notesDraft })}
              disabled={updateNotesMutation.isPending}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {updateNotesMutation.isPending ? 'Salvando…' : 'Salvar nota'}
            </button>
            <button
              type="button"
              onClick={() => setNotesDraft(null)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
            >
              Cancelar
            </button>
          </div>
        ) : null}
      </div>

      {bet.isPrized ? (
        <div className="mt-6 rounded-lg border border-success/30 bg-success/10 p-4">
          <p className="text-sm font-medium text-success">Prêmio total acumulado neste jogo</p>
          <p className="font-display text-2xl font-bold text-success">{formatCents(bet.totalPrizeCents)}</p>
        </div>
      ) : null}

      {/* histórico de conferências */}
      <div className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Conferências por concurso</h2>

        {bet.checks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-600">
            Ainda não conferido — aguardando o sorteio do concurso {bet.contestFrom}.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {bet.checks.map((check, index) => {
              const contestResult = checkContestQueries[index]?.data
              const drawnNumbers = contestResult
                ? check.drawIndex === 2
                  ? contestResult.contest.secondaryNumbers
                  : contestResult.contest.numbers
                : []
              const drawnSet = new Set(drawnNumbers)
              const tier = check.prizeTier !== null ? config.prizeTiers.find((t) => t.tier === check.prizeTier) : null

              return (
                <div key={check.id} className="rounded-lg border border-ink-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink-900">
                      Concurso {check.contestNumber}
                      {check.drawIndex ? ` (${check.drawIndex}º sorteio)` : ''} ·{' '}
                      {dateFormatter.format(new Date(check.drawDate))}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        check.prizeCents > 0n ? 'bg-success/10 text-success' : 'bg-ink-50 text-ink-600'
                      }`}
                    >
                      {check.prizeCents > 0n ? `Premiado — ${tier?.label ?? `faixa ${check.prizeTier}`}` : `${check.hits} acertos`}
                    </span>
                  </div>

                  {config.format === 'PICK_N' ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {bet.numbers.map((n) => (
                        <NumberBall
                          key={n}
                          number={n}
                          state={contestResult ? (drawnSet.has(n) ? 'hit' : 'missed') : 'selected'}
                          size="md"
                          lotterySlug={lotterySlug}
                        />
                      ))}
                    </div>
                  ) : null}

                  {check.extraHits !== null ? (
                    <p className="mt-2 text-sm text-ink-600">Acertos no campo extra: {check.extraHits}</p>
                  ) : null}

                  {check.tierCounts.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-ink-400">
                            <th className="pb-1 font-normal">Faixa</th>
                            <th className="pb-1 font-normal">Qtd.</th>
                            <th className="pb-1 text-right font-normal">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {check.tierCounts.map((tc) => (
                            <tr key={tc.tier} className="border-t border-ink-200">
                              <td className="py-1 text-ink-900">
                                {config.prizeTiers.find((t) => t.tier === tc.tier)?.label ?? `Faixa ${tc.tier}`}
                              </td>
                              <td className="py-1 text-ink-900">{tc.count}×</td>
                              <td className="py-1 text-right font-medium text-ink-900">{formatCents(tc.prizeCents)}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-ink-200 font-semibold">
                            <td className="py-1 text-ink-900" colSpan={2}>
                              Total do concurso
                            </td>
                            <td className="py-1 text-right text-ink-900">{formatCents(check.prizeCents)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showDuplicate ? (
        <DuplicateBetDialog
          betId={bet.id}
          currentContestFrom={bet.contestFrom}
          currentContestTo={bet.contestTo}
          onClose={() => setShowDuplicate(false)}
          onDuplicated={(newBetId) => router.push(`/app/jogos/${newBetId}`)}
        />
      ) : null}
    </div>
  )
}

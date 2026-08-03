'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@lotopro/ui'
import { ALL_LOTTERIES, computeShareMath, type LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { setToast } from '@/app/(app)/app/components/toast'
import { LegalBanner } from '@/components/pool/LegalBanner'

/** Só modalidades com tabela de preço — mesmo filtro de app/jogos/novo. */
const BETTABLE_LOTTERIES = ALL_LOTTERIES.filter((lottery) => lottery.priceTiers.length > 0)

const RULES_TEXT =
  'Como organizador, serei eu quem vai realizar a aposta oficial e quem recebe e repassa os valores de cada participante. O LotoPro não recebe, não guarda nem repassa dinheiro — apenas organiza as informações do bolão. Estou de acordo com as regras de responsabilidade do organizador.'

/** CL-40/CL-42 — criação de bolão com cálculo de cota em tempo real. */
export default function NovoBolaoPage() {
  const router = useRouter()

  const [lotterySlug, setLotterySlug] = useState<LotterySlug | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contestFrom, setContestFrom] = useState<number | ''>('')
  const [contestTo, setContestTo] = useState<number | ''>('')
  const [totalShares, setTotalShares] = useState<number | ''>('')
  // Dígitos em centavos — cada tecla digitada é 1 centavo, sem parsing decimal
  // (CLAUDE.md §5: nunca float em dinheiro). Ex.: "15000" = R$ 150,00.
  const [costDigits, setCostDigits] = useState('')
  const [rulesAccepted, setRulesAccepted] = useState(false)

  const totalCostCents = costDigits === '' ? 0n : BigInt(costDigits)
  const totalSharesNumber = typeof totalShares === 'number' ? totalShares : 0

  const shareMath =
    totalCostCents > 0n && totalSharesNumber > 0 ? computeShareMath(totalCostCents, totalSharesNumber) : null

  const createMutation = trpc.pool.create.useMutation({
    onSuccess: (result) => {
      setToast('Bolão criado! Agora é só convidar a galera.')
      router.push(`/app/boloes/${result.poolId}`)
    },
  })

  function handleCostChange(raw: string) {
    const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    setCostDigits(digits.slice(0, 12))
  }

  const canSubmit =
    lotterySlug !== null &&
    name.trim().length > 0 &&
    typeof contestFrom === 'number' &&
    typeof contestTo === 'number' &&
    contestTo >= contestFrom &&
    totalSharesNumber >= 1 &&
    totalCostCents > 0n &&
    rulesAccepted &&
    !createMutation.isPending

  function handleSubmit() {
    if (!canSubmit || lotterySlug === null || typeof contestFrom !== 'number' || typeof contestTo !== 'number') return
    createMutation.mutate({
      lotterySlug,
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      contestFrom,
      contestTo,
      totalShares: totalSharesNumber,
      totalCostCents,
      rulesAccepted: true,
    })
  }

  return (
    <div className="max-w-2xl pb-10">
      <h1 className="font-display text-2xl font-bold text-ink-900">Novo bolão</h1>
      <LegalBanner />

      <div className="rounded-lg border border-ink-200 bg-white p-4">
        <p className="text-sm font-medium text-ink-900">Modalidade</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BETTABLE_LOTTERIES.map((lottery) => (
            <button
              key={lottery.slug}
              type="button"
              onClick={() => setLotterySlug(lottery.slug)}
              className={`flex items-center justify-center rounded-md border p-2 ${
                lotterySlug === lottery.slug ? 'border-brand-500' : 'border-ink-200'
              }`}
            >
              <Badge lotterySlug={lottery.slug} />
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-ink-900" htmlFor="pool-name">
          Nome do bolão
          <input
            id="pool-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Bolão do Escritório"
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="pool-description">
          Descrição (opcional)
          <textarea
            id="pool-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="text-sm font-medium text-ink-900" htmlFor="contest-from">
            Do concurso
            <input
              id="contest-from"
              type="number"
              min={1}
              value={contestFrom}
              onChange={(event) => setContestFrom(event.target.value === '' ? '' : Number(event.target.value))}
              className="mt-1 block w-32 rounded-md border border-ink-200 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm font-medium text-ink-900" htmlFor="contest-to">
            Até o concurso
            <input
              id="contest-to"
              type="number"
              min={1}
              value={contestTo}
              onChange={(event) => setContestTo(event.target.value === '' ? '' : Number(event.target.value))}
              className="mt-1 block w-32 rounded-md border border-ink-200 px-3 py-2 text-base"
            />
          </label>
        </div>
        {typeof contestFrom === 'number' && typeof contestTo === 'number' && contestTo < contestFrom ? (
          <p className="mt-2 text-sm text-danger">O concurso final precisa ser igual ou depois do inicial.</p>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
        <h2 className="font-display text-base font-semibold text-ink-900">Cotas</h2>

        <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="total-cost">
          Custo total das apostas
          <input
            id="total-cost"
            type="text"
            inputMode="numeric"
            value={formatCents(totalCostCents)}
            onChange={(event) => handleCostChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>
        <p className="mt-1 text-xs text-ink-400">Digite só os números — os 2 últimos dígitos são os centavos.</p>

        <label className="mt-3 block text-sm font-medium text-ink-900" htmlFor="total-shares">
          Número de cotas
          <input
            id="total-shares"
            type="number"
            min={1}
            step={1}
            value={totalShares}
            onChange={(event) =>
              setTotalShares(event.target.value === '' ? '' : Math.max(1, Math.trunc(Number(event.target.value))))
            }
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base"
          />
        </label>

        {shareMath ? (
          <div className="mt-3 rounded-md bg-ink-50 p-3 text-sm text-ink-900">
            <p>
              Valor da cota:{' '}
              <span className="font-display text-lg font-bold">{formatCents(shareMath.shareValueCents)}</span>
            </p>
            {shareMath.surplusCents > 0n ? (
              <p className="mt-1 text-ink-600">
                Arredondando para cima, sobram {formatCents(shareMath.surplusCents)} — essa sobra fica com você, o
                organizador.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-400">
            Preencha o custo total e o número de cotas para ver o valor da cota.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
        <label className="flex items-start gap-3 text-sm text-ink-900" htmlFor="rules-accepted">
          <input
            id="rules-accepted"
            type="checkbox"
            checked={rulesAccepted}
            onChange={(event) => setRulesAccepted(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-ink-200"
          />
          <span>{RULES_TEXT}</span>
        </label>
      </div>

      {createMutation.error ? (
        <p className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">{createMutation.error.message}</p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-brand-500 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Criando…' : 'Criar bolão'}
        </button>
      </div>
    </div>
  )
}

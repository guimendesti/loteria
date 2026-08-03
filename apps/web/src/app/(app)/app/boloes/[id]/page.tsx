'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import { formatCents } from '@/app/(app)/app/components/format-cents'
import { AddGuestDialog } from '@/components/pool/AddGuestDialog'
import { InviteLinkBox } from '@/components/pool/InviteLinkBox'
import { LegalBanner } from '@/components/pool/LegalBanner'
import { MemberPaymentPanel } from '@/components/pool/MemberPaymentPanel'
import { MembersTable } from '@/components/pool/MembersTable'
import { PayoutPanel } from '@/components/pool/PayoutPanel'
import { PoolStatusControls } from '@/components/pool/PoolStatusControls'
import { ReceiptBox } from '@/components/pool/ReceiptBox'
import { ShareProgressBar } from '@/components/pool/ShareProgressBar'
import { PoolStatusBadge } from '@/components/pool/StatusBadges'

/**
 * CL-44…CL-62 — detalhe do bolão: duas visões no mesmo arquivo conforme
 * `role` (dono/membro), como pedido pelo território desta onda.
 */
export default function BolaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const utils = trpc.useUtils()

  const poolQuery = trpc.pool.detail.useQuery({ poolId: id })
  const pool = poolQuery.data

  const [showAddGuest, setShowAddGuest] = useState(false)
  const [confirmPaymentPendingId, setConfirmPaymentPendingId] = useState<string | null>(null)
  const [removePendingId, setRemovePendingId] = useState<string | null>(null)

  function invalidateAll() {
    utils.pool.detail.invalidate({ poolId: id })
    utils.pool.list.invalidate()
  }

  const confirmPayment = trpc.pool.members.confirmPayment.useMutation({
    onSuccess: () => {
      invalidateAll()
      setConfirmPaymentPendingId(null)
    },
    onError: () => setConfirmPaymentPendingId(null),
  })

  const removeMember = trpc.pool.members.remove.useMutation({
    onSuccess: () => {
      invalidateAll()
      setRemovePendingId(null)
    },
    onError: () => setRemovePendingId(null),
  })

  if (poolQuery.isLoading) {
    return <p className="text-sm text-ink-600">Carregando bolão…</p>
  }

  if (poolQuery.isError || !pool) {
    return (
      <div>
        <p className="text-sm text-danger">Não foi possível carregar este bolão.</p>
        <Link href="/app/boloes" className="mt-2 inline-block text-sm font-medium text-brand-500 hover:text-brand-700">
          ← Voltar para Bolões
        </Link>
      </div>
    )
  }

  const lotterySlug = pool.lottery.slug as LotterySlug
  const contestLabel =
    pool.contestFrom === pool.contestTo ? `Concurso ${pool.contestFrom}` : `Concursos ${pool.contestFrom}–${pool.contestTo}`
  // `PoolDetail` não expõe um "sou eu" pronto — casamos pelo `userId` da
  // própria sessão contra `members[].userId` (docs/contracts/onda8-bolao.md).
  const myMember = pool.members.find((member) => member.userId === session?.user.id) ?? null
  const showPayoutPanel = pool.status === 'BET_PLACED' || pool.status === 'SETTLED'

  return (
    <div className="max-w-4xl pb-10">
      <Link href="/app/boloes" className="text-sm font-medium text-brand-500 hover:text-brand-700">
        ← Bolões
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge lotterySlug={lotterySlug} />
        <h1 className="font-display text-2xl font-bold text-ink-900">{pool.name}</h1>
        <PoolStatusBadge status={pool.status} />
      </div>

      <p className="mt-1 text-sm text-ink-600">{contestLabel}</p>
      {pool.description ? <p className="mt-2 text-sm text-ink-600">{pool.description}</p> : null}

      <LegalBanner />

      <div className="rounded-lg border border-ink-200 bg-white p-4">
        <ShareProgressBar sharesTaken={pool.sharesTaken} totalShares={pool.totalShares} />
        <p className="mt-2 text-sm text-ink-900">
          Cota: <span className="font-semibold">{formatCents(pool.shareValueCents)}</span>
        </p>
      </div>

      {pool.bets.length > 0 ? (
        <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink-900">Jogos do bolão</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-900">
            {pool.bets.map((bet) => (
              <li key={bet.id}>
                Concurso {bet.contestNumber}: {bet.numbers.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pool.role === 'OWNER' ? (
        <div className="mt-4 flex flex-col gap-4">
          {pool.inviteCode ? (
            <InviteLinkBox
              inviteCode={pool.inviteCode}
              inviteExpiresAt={pool.inviteExpiresAt}
              poolStatus={pool.status}
              lotteryName={pool.lottery.name}
              totalShares={pool.totalShares}
              shareValueLabel={formatCents(pool.shareValueCents)}
            />
          ) : null}

          <PoolStatusControls poolId={pool.id} status={pool.status} receiptUrl={pool.receiptUrl} onChanged={invalidateAll} />

          <ReceiptBox receiptUrl={pool.receiptUrl} />

          <div className="rounded-lg border border-ink-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-ink-900">Participantes</h2>
              <button
                type="button"
                onClick={() => setShowAddGuest(true)}
                className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
              >
                + Adicionar sem conta
              </button>
            </div>

            {confirmPayment.error || removeMember.error ? (
              <p className="mt-2 text-sm text-danger">
                {(confirmPayment.error ?? removeMember.error)?.message ?? 'Não foi possível concluir a ação.'}
              </p>
            ) : null}

            <div className="mt-3">
              <MembersTable
                members={pool.members}
                confirmPaymentPendingId={confirmPaymentPendingId}
                onConfirmPayment={(memberId) => {
                  setConfirmPaymentPendingId(memberId)
                  confirmPayment.mutate({ memberId })
                }}
                removePendingId={removePendingId}
                onRemove={(memberId) => {
                  setRemovePendingId(memberId)
                  removeMember.mutate({ memberId })
                }}
              />
            </div>
          </div>

          {showPayoutPanel ? <PayoutPanel poolId={pool.id} lotterySlug={lotterySlug} bets={pool.bets} /> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {myMember ? (
            <MemberPaymentPanel member={myMember} ownerPixKeyMasked={pool.ownerPixKeyMasked} onDeclared={invalidateAll} />
          ) : null}

          <ReceiptBox receiptUrl={pool.receiptUrl} />

          {showPayoutPanel ? <PayoutPanel poolId={pool.id} readOnly /> : null}
        </div>
      )}

      {showAddGuest ? (
        <AddGuestDialog
          poolId={pool.id}
          sharesAvailable={Math.max(pool.totalShares - pool.sharesTaken, 0)}
          onClose={() => setShowAddGuest(false)}
          onAdded={() => {
            invalidateAll()
            setShowAddGuest(false)
          }}
        />
      ) : null}
    </div>
  )
}

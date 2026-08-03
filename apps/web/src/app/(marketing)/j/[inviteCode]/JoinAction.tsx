'use client'

/**
 * Onda 8 — seletor de cotas + botão "participar" para quem já está logado no convite público
 * (`/j/[inviteCode]`). Chama `trpc.pool.join` (autenticado) e redireciona para o bolão no
 * sucesso.
 *
 * Precisa do próprio `TRPCReactProvider` (o grupo `(marketing)` não monta um — só `(app)`
 * monta, ver `app/(app)/trpc-provider.tsx`) — o `page.tsx` deste convite envolve este
 * componente com ele só quando `session` existe, para não pagar o custo do provider em
 * quem está deslogado (a maioria dos acessos, é link de WhatsApp).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { formatCents } from '@/app/(marketing)/lib/format'

export interface JoinActionProps {
  inviteCode: string
  sharesAvailable: number
  shareValueCents: bigint
}

export function JoinAction({ inviteCode, sharesAvailable, shareValueCents }: JoinActionProps) {
  const router = useRouter()
  const maxShares = Math.max(1, sharesAvailable)
  const [shares, setShares] = useState(1)

  const joinMutation = trpc.pool.join.useMutation({
    onSuccess: (data) => {
      // Convenção de rotas do repo: o painel autenticado mora em `(app)/app/**`, então a URL
      // real é `/app/boloes/[id]` (grupos de rota não entram na URL) — não `/boloes/[id]` cru.
      router.push(`/app/boloes/${data.poolId}`)
    },
  })

  const totalCents = shareValueCents * BigInt(shares)

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-6">
      <label htmlFor="join-shares" className="block text-sm font-medium text-ink-900">
        Quantas cotas você quer?
      </label>
      <select
        id="join-shares"
        value={shares}
        onChange={(event) => setShares(Number(event.target.value))}
        disabled={joinMutation.isPending}
        className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {Array.from({ length: maxShares }, (_, index) => index + 1).map((n) => (
          <option key={n} value={n}>
            {n} cota{n === 1 ? '' : 's'}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-ink-600">
        Total a pagar por Pix ao organizador: <span className="font-medium text-ink-900">{formatCents(totalCents)}</span>
      </p>

      {joinMutation.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {joinMutation.error.message || 'Não foi possível entrar no bolão. Tente novamente.'}
        </p>
      )}

      <button
        type="button"
        disabled={joinMutation.isPending}
        onClick={() => joinMutation.mutate({ inviteCode, shares })}
        className="mt-4 w-full rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {joinMutation.isPending ? 'Entrando…' : 'Participar do bolão'}
      </button>
    </div>
  )
}

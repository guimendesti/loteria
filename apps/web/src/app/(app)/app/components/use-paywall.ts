'use client'

import { useEffect, useState } from 'react'
import type { PaywallGate } from '@lotopro/core'

/** Espelha `shape.data.paywall` de `server/trpc.ts` (`toPaywallData`). */
export interface PaywallErrorData {
  gate?: PaywallGate
  limit?: number
  current?: number
}

/**
 * Lê `error.data.paywall` de um erro tRPC sem depender do tipo gerado
 * (`TRPCClientErrorLike<AppRouter>`) — mais simples de testar/reusar e
 * tolerante a erros que não vieram do tRPC (ex.: erro de rede).
 */
export function readPaywallError(error: unknown): PaywallErrorData | null {
  if (!error || typeof error !== 'object') return null
  const data = (error as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const paywall = (data as { paywall?: unknown }).paywall
  if (!paywall || typeof paywall !== 'object') return null
  return paywall as PaywallErrorData
}

/**
 * Intercepta um erro de mutation/query tRPC: quando carrega `data.paywall`
 * (FORBIDDEN lançado por `guardOrThrow`, docs/06 §6.9), abre o `PaywallDialog`
 * (docs/09 C6) com o gate correto — sem tocar no estado do formulário que
 * originou a chamada (docs/05 §5.4: "nunca perder trabalho do usuário").
 *
 * Uso: `const paywall = usePaywall(createMutation.error)`.
 */
export function usePaywall(error: unknown) {
  const [open, setOpen] = useState(false)
  const [paywall, setPaywall] = useState<PaywallErrorData | null>(null)

  useEffect(() => {
    const next = readPaywallError(error)
    if (next) {
      setPaywall(next)
      setOpen(true)
    }
  }, [error])

  return { open, paywall, close: () => setOpen(false) }
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

/** Estado de suporte/permissão do navegador para Web Push (P5). */
export type PushOptInState = NotificationPermission | 'unsupported'

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Converte a chave pública VAPID (base64url — formato de `web-push.generateVAPIDKeys()`,
 * mesma string servida por `server/routers/push.ts#publicKey`) para o `Uint8Array` que
 * `PushManager.subscribe({ applicationServerKey })` exige: a Push API quer os bytes brutos
 * da chave EC P-256 não comprimida (RFC 8292), não uma string.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export interface UsePushSubscriptionResult {
  /** `null` só até o efeito inicial rodar (evita decidir suporte/permissão durante SSR). */
  state: PushOptInState | null
  loading: boolean
  error: string | null
  /** Pede permissão, registra o SW e assina. Só chamar quando `state === 'default'`. */
  subscribe: () => Promise<void>
}

/**
 * P5 — lado cliente do opt-in de push (docs/08 SY-04). Consumido por `PushOptIn.tsx`, que
 * é só a UI; toda a lógica de suporte/permissão/registro do SW/assinatura mora aqui, para
 * ficar testável isolada da árvore de componentes (mesmo padrão de `use-paywall.ts`).
 */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [state, setState] = useState<PushOptInState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const publicKeyQuery = trpc.push.publicKey.useQuery(undefined, { enabled: isPushSupported() })
  const subscribeMutation = trpc.push.subscribe.useMutation()

  useEffect(() => {
    setState(isPushSupported() ? Notification.permission : 'unsupported')
  }, [])

  const subscribe = useCallback(async () => {
    setError(null)

    if (!isPushSupported()) {
      setState('unsupported')
      return
    }

    setLoading(true)
    try {
      // `requestPermission()` é o único jeito de abrir o prompt nativo — se o usuário já
      // negou antes, o navegador nem mostra o prompt de novo (resolve direto com "denied"),
      // então não há "insistência" possível aqui além de checar o resultado uma vez.
      const permission = await Notification.requestPermission()
      setState(permission)
      if (permission !== 'granted') return

      const publicKey = publicKeyQuery.data?.publicKey
      if (!publicKey) {
        setError('Notificações push não estão configuradas no momento. Tente novamente mais tarde.')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const json = subscription.toJSON()
      const endpoint = json.endpoint
      const p256dh = json.keys?.['p256dh']
      const auth = json.keys?.['auth']
      if (!endpoint || !p256dh || !auth) {
        throw new Error('Assinatura de push incompleta (endpoint ou chaves ausentes).')
      }

      await subscribeMutation.mutateAsync({ endpoint, p256dh, auth, userAgent: navigator.userAgent })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar as notificações agora.')
    } finally {
      setLoading(false)
    }
  }, [publicKeyQuery.data, subscribeMutation])

  return { state, loading, error, subscribe }
}

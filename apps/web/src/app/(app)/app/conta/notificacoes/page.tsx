'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { PaywallDialog } from '../../components/PaywallDialog'
import { usePaywall } from '../../components/use-paywall'

const CHECKBOX_CLASS = 'h-4 w-4 rounded border-ink-200 text-brand-500 focus:ring-brand-500'
const TIME_INPUT_CLASS =
  'mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/**
 * CL-103 (docs/08 §C.8) — canais, "só quando premiado", lembrete de fechamento, limiar de
 * acumulado, horário de silêncio e opt-in de marketing (LGPD: opt-in separado e
 * revogável — docs/03 §3.5).
 *
 * Push/WhatsApp são reforçados no SERVIDOR contra o plano (`account.ts`,
 * `notificationPreferences.update`) — se o back recusar com FORBIDDEN + paywall (G10 para
 * WhatsApp), abre `PaywallDialog` SEM reverter os checkboxes: mesmo padrão de
 * `jogos/novo/page.tsx` ("nunca perder trabalho do usuário" ao bater num limite de plano).
 */
export default function NotificacoesPage() {
  const utils = trpc.useUtils()
  const prefQuery = trpc.account.notificationPreferences.get.useQuery()
  const updateMutation = trpc.account.notificationPreferences.update.useMutation({
    onSuccess: () => {
      setStatus('Preferências salvas.')
      utils.account.notificationPreferences.get.invalidate()
    },
  })
  const paywall = usePaywall(updateMutation.error)

  const [emailEnabled, setEmailEnabled] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(true)
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [onlyWhenPrized, setOnlyWhenPrized] = useState(false)
  const [cutoffReminder, setCutoffReminder] = useState(true)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [thresholdReais, setThresholdReais] = useState('')
  const [quietStart, setQuietStart] = useState('')
  const [quietEnd, setQuietEnd] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!prefQuery.data || touched) return
    const data = prefQuery.data
    setEmailEnabled(data.emailEnabled)
    setPushEnabled(data.pushEnabled)
    setWhatsappEnabled(data.whatsappEnabled)
    setOnlyWhenPrized(data.onlyWhenPrized)
    setCutoffReminder(data.cutoffReminder)
    setMarketingOptIn(data.marketingOptIn)
    setThresholdReais(
      data.accumulatedThresholdCents === null
        ? ''
        : (Number(data.accumulatedThresholdCents) / 100).toString(),
    )
    setQuietStart(data.quietHoursStart ?? '')
    setQuietEnd(data.quietHoursEnd ?? '')
  }, [prefQuery.data, touched])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)

    const trimmedThreshold = thresholdReais.trim()
    const thresholdCents =
      trimmedThreshold === ''
        ? null
        : BigInt(Math.round(Number(trimmedThreshold.replace(',', '.')) * 100))

    updateMutation.mutate({
      emailEnabled,
      pushEnabled,
      whatsappEnabled,
      onlyWhenPrized,
      accumulatedThresholdCents: thresholdCents,
      cutoffReminder,
      marketingOptIn,
      quietHoursStart: quietStart === '' ? null : quietStart,
      quietHoursEnd: quietEnd === '' ? null : quietEnd,
    })
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Notificações</h2>
      <p className="mt-1 text-sm text-ink-600">
        Canais, avisos e horário de silêncio (CL-103). Push é Premium/Pro; WhatsApp é exclusivo do Pro.
      </p>

      {prefQuery.isLoading ? (
        <p className="mt-4 text-sm text-ink-600">Carregando…</p>
      ) : (
        <form onSubmit={handleSubmit} onChange={() => setTouched(true)} className="mt-4 space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-900">Canais</legend>
            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className={CHECKBOX_CLASS}
              />
              E-mail
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className={CHECKBOX_CLASS}
              />
              Push
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className={CHECKBOX_CLASS}
              />
              WhatsApp <span className="text-xs text-ink-400">(plano Pro)</span>
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={onlyWhenPrized}
              onChange={(e) => setOnlyWhenPrized(e.target.checked)}
              className={CHECKBOX_CLASS}
            />
            Notificar só quando eu ganhar algum prêmio
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={cutoffReminder}
              onChange={(e) => setCutoffReminder(e.target.checked)}
              className={CHECKBOX_CLASS}
            />
            Avisar antes do fechamento das apostas
          </label>

          <div>
            <label htmlFor="threshold" className="block text-sm font-medium text-ink-900">
              Avisar quando o prêmio acumulado passar de
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-ink-600">R$</span>
              <input
                id="threshold"
                type="number"
                min={0}
                step="0.01"
                value={thresholdReais}
                onChange={(e) => setThresholdReais(e.target.value)}
                placeholder="Sem limiar"
                className="w-40 rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:max-w-sm sm:grid-cols-2">
            <div>
              <label htmlFor="quietStart" className="block text-sm font-medium text-ink-900">
                Silêncio a partir de
              </label>
              <input
                id="quietStart"
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className={TIME_INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="quietEnd" className="block text-sm font-medium text-ink-900">
                Até
              </label>
              <input
                id="quietEnd"
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className={TIME_INPUT_CLASS}
              />
            </div>
          </div>

          <div className="border-t border-ink-200 pt-4">
            <label className="flex items-start gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className={`mt-0.5 ${CHECKBOX_CLASS}`}
              />
              <span>
                Quero receber novidades e ofertas do LotoPro por e-mail (opcional — revogável a qualquer
                momento aqui).
              </span>
            </label>
          </div>

          {updateMutation.error && !paywall.paywall ? (
            <p role="alert" className="text-sm text-danger">
              {updateMutation.error.message}
            </p>
          ) : null}
          {status ? <p className="text-sm text-ink-600">{status}</p> : null}

          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Salvando…' : 'Salvar preferências'}
          </button>
        </form>
      )}

      <PaywallDialog open={paywall.open} paywall={paywall.paywall} onClose={paywall.close} />
    </section>
  )
}

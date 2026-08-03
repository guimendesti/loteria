'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatCents } from '../../components/format-cents'
import type { RouterOutputs } from '../../components/types'

type SubscriptionCurrent = RouterOutputs['billing']['subscription']['current']
type NonNullSubscription = NonNullable<SubscriptionCurrent>
type InvoiceItem = RouterOutputs['billing']['invoices']['list']['invoices'][number]
type UsageData = RouterOutputs['account']['usage']['get']

const STATUS_LABEL: Record<NonNullSubscription['status'], string> = {
  PENDING: 'Pendente',
  TRIALING: 'Em teste grátis',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento atrasado',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
}

const PAYMENT_METHOD_LABEL: Record<NonNullSubscription['paymentMethod'], string> = {
  PIX_AUTOMATIC: 'Pix Automático',
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto',
}

const CYCLE_LABEL: Record<NonNullSubscription['billingCycle'], string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}

const INVOICE_STATUS_LABEL: Record<InvoiceItem['status'], string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  FAILED: 'Falhou',
  REFUNDED: 'Estornada',
  CANCELED: 'Cancelada',
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value))
}

/**
 * CL-104/105/106/107 (docs/08 §C.8) — plano atual, uso vs. limites, trocar/assinar/
 * cancelar/reativar (via `billing.*`, já pronto — nenhuma regra de cobrança é
 * reimplementada aqui) e histórico de faturas.
 *
 * CTA do `PaywallDialog` (`(app)/app/components/PaywallDialog.tsx`) aponta para
 * `/app/conta/assinatura` — esta página existe exatamente nesse caminho.
 *
 * ⚠️ Pendências conhecidas (nenhuma resolvida aqui — fora do território desta tarefa,
 * `server/routers/billing.ts`):
 * - CL-107 "trocar meio de pagamento": `billing.ts` não expõe uma mutation para isso
 *   (só `subscribe`, que é para uma assinatura NOVA — chamá-la de novo bate no `@unique`
 *   de `Subscription.userId` e falha). A tela mostra o meio de pagamento atual como
 *   informação, sem ação.
 * - CL-106 "link de download por fatura": `billing.invoices.list` não seleciona
 *   `Invoice.invoiceUrl` (só `id/amountCents/status/method/dueAt/paidAt/attempts/
 *   failureReason/createdAt`) — sem esse campo não há link para renderizar. Recomendação:
 *   adicionar `invoiceUrl: true` ao `select` de `invoices.list` em `billing.ts`.
 */
export default function AssinaturaPage() {
  const [cycle, setCycle] = useState<NonNullSubscription['billingCycle']>('MONTHLY')
  const [actionError, setActionError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const subscriptionQuery = trpc.billing.subscription.current.useQuery()
  const plansQuery = trpc.billing.plans.list.useQuery()
  const usageQuery = trpc.account.usage.get.useQuery()
  const invoicesQuery = trpc.billing.invoices.list.useQuery({ limit: 12, offset: 0 })

  function invalidateBilling() {
    utils.billing.subscription.current.invalidate()
    utils.billing.invoices.list.invalidate()
    utils.account.usage.get.invalidate()
  }

  const startTrialMutation = trpc.billing.startTrial.useMutation({
    onSuccess: invalidateBilling,
    onError: (error) => setActionError(error.message),
  })
  const subscribeMutation = trpc.billing.subscribe.useMutation({
    onSuccess: invalidateBilling,
    onError: (error) => setActionError(error.message),
  })
  const changePlanMutation = trpc.billing.changePlan.useMutation({
    onSuccess: invalidateBilling,
    onError: (error) => setActionError(error.message),
  })
  const cancelMutation = trpc.billing.cancel.useMutation({
    onSuccess: invalidateBilling,
    onError: (error) => setActionError(error.message),
  })
  const reactivateMutation = trpc.billing.reactivate.useMutation({
    onSuccess: invalidateBilling,
    onError: (error) => setActionError(error.message),
  })

  const subscription = subscriptionQuery.data ?? null
  const currentSlug = subscription?.plan.slug ?? 'free'
  const isBusy =
    startTrialMutation.isPending ||
    subscribeMutation.isPending ||
    changePlanMutation.isPending ||
    cancelMutation.isPending ||
    reactivateMutation.isPending

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Seu plano</h2>

        {subscriptionQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : subscription ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-ink-900">
              <span className="font-semibold">{subscription.plan.name}</span> —{' '}
              {STATUS_LABEL[subscription.status]}
            </p>
            <p className="text-ink-600">
              Ciclo: {CYCLE_LABEL[subscription.billingCycle]} · Meio de pagamento:{' '}
              {PAYMENT_METHOD_LABEL[subscription.paymentMethod]} · Valor: {formatCents(subscription.amountCents)}
            </p>
            <p className="text-ink-600">
              Período atual: {formatDate(subscription.currentPeriodStart)} até{' '}
              {formatDate(subscription.currentPeriodEnd)}
            </p>
            {subscription.trialEndsAt ? (
              <p className="text-ink-600">Teste grátis até {formatDate(subscription.trialEndsAt)}.</p>
            ) : null}
            {subscription.cancelAtPeriodEnd ? (
              <p className="font-medium text-danger">
                Cancelamento agendado — acesso mantido até {formatDate(subscription.currentPeriodEnd)}.
              </p>
            ) : subscription.scheduledPlanSlug ? (
              <p className="font-medium text-brand-700">
                Troca para o plano &quot;{subscription.scheduledPlanSlug}&quot; agendada para{' '}
                {formatDate(subscription.currentPeriodEnd)}.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-2">
              {subscription.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => reactivateMutation.mutate()}
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Reativar assinatura
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => cancelMutation.mutate({})}
                  className="rounded-md border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:text-ink-900 disabled:opacity-60"
                >
                  Cancelar assinatura
                </button>
              )}
            </div>

            <p className="pt-2 text-xs text-ink-400">
              Troca de meio de pagamento ainda não está disponível nesta tela (pendência — ver comentário no
              topo do arquivo).
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-600">Você está no plano gratuito.</p>
        )}

        {actionError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {actionError}
          </p>
        ) : null}
      </section>

      <UsageSection usage={usageQuery.data} isLoading={usageQuery.isLoading} />

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">Planos disponíveis</h2>
          <div className="flex gap-2">
            {(['MONTHLY', 'YEARLY'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  cycle === c ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-600'
                }`}
              >
                {CYCLE_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(plansQuery.data ?? [])
            .filter((plan) => plan.slug !== 'whitelabel')
            .map((plan) => {
              const isCurrent = plan.slug === currentSlug
              const priceCents = cycle === 'MONTHLY' ? plan.priceMonthlyCents : plan.priceYearlyCents
              const pixCents = cycle === 'MONTHLY' ? plan.pixMonthlyCents : plan.pixYearlyCents

              return (
                <div key={plan.id} className="rounded-lg border border-ink-200 p-4">
                  <p className="font-display text-base font-semibold text-ink-900">{plan.name}</p>
                  <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatCents(priceCents)}</p>
                  {pixCents < priceCents ? (
                    <p className="text-xs text-success">{formatCents(pixCents)} no Pix Automático</p>
                  ) : null}

                  {isCurrent ? (
                    <p className="mt-3 rounded-md bg-ink-50 px-3 py-2 text-center text-xs font-semibold text-ink-600">
                      Seu plano atual
                    </p>
                  ) : subscription === null ? (
                    <div className="mt-3 space-y-2">
                      {plan.slug === 'pro' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => startTrialMutation.mutate()}
                          className="w-full rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                        >
                          Testar 14 dias grátis
                        </button>
                      ) : null}
                      {plan.slug !== 'free' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => subscribeMutation.mutate({ planSlug: plan.slug, cycle })}
                          className="w-full rounded-md border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:text-ink-900 disabled:opacity-60"
                        >
                          Assinar agora
                        </button>
                      ) : null}
                    </div>
                  ) : plan.slug !== 'free' ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => changePlanMutation.mutate({ planSlug: plan.slug, cycle })}
                      className="mt-3 w-full rounded-md border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:text-ink-900 disabled:opacity-60"
                    >
                      Trocar para este plano
                    </button>
                  ) : null}
                </div>
              )
            })}
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Faturas</h2>
        {invoicesQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : (invoicesQuery.data?.invoices.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-ink-600">Nenhuma fatura ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-ink-600">
                  <th className="py-2 font-medium">Vencimento</th>
                  <th className="py-2 font-medium">Valor</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQuery.data?.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-ink-100">
                    <td className="py-2 text-ink-900">{formatDate(invoice.dueAt)}</td>
                    <td className="py-2 text-ink-900">{formatCents(invoice.amountCents)}</td>
                    <td className="py-2 text-ink-600">{INVOICE_STATUS_LABEL[invoice.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-400">
              Link de download por fatura ainda não é exposto por `billing.invoices.list` (pendência).
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function limitLabel(limit: number | null): string {
  return limit === null ? 'Ilimitado' : String(limit)
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null
  const pct = isUnlimited ? 100 : Math.min(100, limit <= 0 ? 100 : Math.round((used / limit) * 100))
  const atLimit = !isUnlimited && used >= limit
  const barColor = isUnlimited ? 'bg-ink-200' : atLimit ? 'bg-danger' : 'bg-brand-500'

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-900">{label}</span>
        <span className="text-ink-600">
          {used} / {limitLabel(limit)}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function UsageSection({ usage, isLoading }: { usage: UsageData | undefined; isLoading: boolean }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Uso do seu plano</h2>
      <p className="mt-1 text-sm text-ink-600">
        Jogos ativos, bolões, scans de comprovante e mensagens de IA (CL-104).
      </p>

      {isLoading || !usage ? (
        <p className="mt-4 text-sm text-ink-600">Carregando…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <UsageBar label="Jogos ativos" used={usage.activeBets.used} limit={usage.activeBets.limit} />
          <UsageBar label="Bolões ativos" used={usage.pools.used} limit={usage.pools.limit} />
          <UsageBar
            label="Scans de comprovante (mês)"
            used={usage.ocrScans.used}
            limit={usage.ocrScans.limit}
          />
          <UsageBar
            label="Mensagens do assistente de IA (mês)"
            used={usage.aiMessages.used}
            limit={usage.aiMessages.limit}
          />
        </div>
      )}
    </section>
  )
}

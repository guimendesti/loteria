'use client'

/**
 * BO-30/31/32/34/36 (docs/08 §D.5) — assinaturas, faturas, MRR e webhooks.
 *
 * Uma aba por listagem (`assinaturas`/`faturas`/`webhooks`) + o painel de MRR no topo,
 * sempre visível (é o número que a diretoria olha primeiro). `retryInvoice` e
 * `replayWebhook` são mutations com efeito real (mudam status local / reprocessam um
 * webhook) — confirmação em duas etapas antes de disparar, mesmo padrão de `admin/apostas`.
 */
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatCents, formatDateTime } from '../../components/format'

type Tab = 'subscriptions' | 'invoices' | 'webhooks'

const SUB_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Em atraso',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  FAILED: 'Falhou',
  REFUNDED: 'Estornada',
  CANCELED: 'Cancelada',
}

/**
 * Formas mínimas da resposta de `admin.finance.*` (server/routers/admin/finance.ts).
 * Anotadas explicitamente pelo mesmo motivo de `admin/apostas/page.tsx`: até `_app.ts`
 * registrar o router `admin`, `trpc.admin` resolve como `any`.
 */
interface AdminSubscriptionRow {
  id: string
  user: { name: string; email: string }
  plan: { name: string }
  status: string
  billingCycle: string
  currentPeriodStart: string | Date
  currentPeriodEnd: string | Date
}
interface AdminSubscriptionsPage {
  items: AdminSubscriptionRow[]
  nextCursor: string | undefined
}

interface AdminInvoiceRow {
  id: string
  subscription: { user: { name: string; email: string } }
  amountCents: bigint
  status: string
  dueAt: string | Date
  paidAt: string | Date | null
  attempts: number
}
interface AdminInvoicesPage {
  items: AdminInvoiceRow[]
  nextCursor: string | undefined
}

interface AdminWebhookEventRow {
  id: string
  provider: string
  eventType: string
  createdAt: string | Date
  processedAt: string | Date | null
  error: string | null
}
interface AdminWebhookEventsPage {
  items: AdminWebhookEventRow[]
  nextCursor: string | undefined
}

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function AdminFinanceiroPage() {
  const [tab, setTab] = useState<Tab>('subscriptions')

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Financeiro</h1>
      <p className="mt-1 text-sm text-ink-600">
        Assinaturas (BO-30), faturas (BO-31/32), MRR (BO-34) e log de webhooks (BO-36).
      </p>

      <MrrPanel />

      <div className="mt-8 flex gap-2 border-b border-ink-200">
        {(
          [
            ['subscriptions', 'Assinaturas'],
            ['invoices', 'Faturas'],
            ['webhooks', 'Webhooks'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === value ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'subscriptions' ? <SubscriptionsTab /> : null}
        {tab === 'invoices' ? <InvoicesTab /> : null}
        {tab === 'webhooks' ? <WebhooksTab /> : null}
      </div>
    </div>
  )
}

/** BO-34 — MRR novo/expansão/contração/churn do mês. */
function MrrPanel() {
  const [month, setMonth] = useState(currentMonthValue())
  const query = trpc.admin.finance.mrrReport.useQuery({ month })
  const report = query.data

  const cards = [
    { label: 'MRR novo', value: report?.newCents, tone: 'text-success' },
    { label: 'Expansão', value: report?.expansionCents, tone: 'text-success' },
    { label: 'Contração', value: report?.contractionCents, tone: 'text-warning' },
    { label: 'Churn', value: report?.churnCents, tone: 'text-danger' },
    { label: 'Líquido do mês', value: report?.netNewCents, tone: 'text-ink-900' },
  ]

  return (
    <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">Relatório de MRR</h2>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-sm text-ink-900"
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-ink-200 px-4 py-3">
            <p className="text-xs text-ink-600">{card.label}</p>
            <p className={`mt-1 font-display text-lg font-semibold ${card.tone}`}>
              {query.isLoading ? '…' : card.value !== undefined ? formatCents(card.value) : '—'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-400">
        Aproximação: expansão/contração comparam o valor da fatura paga anterior e atual de cada
        assinatura (não há histórico de troca de plano dedicado); cobrança anual conta como 1/12
        por mês.
      </p>
    </div>
  )
}

function SubscriptionsTab() {
  const [status, setStatus] = useState('')
  const [billingCycle, setBillingCycle] = useState('')

  const query = trpc.admin.finance.subscriptions.useInfiniteQuery(
    {
      ...(status ? { status: status as never } : {}),
      ...(billingCycle ? { billingCycle: billingCycle as never } : {}),
      limit: 20,
    },
    { getNextPageParam: (lastPage: AdminSubscriptionsPage) => lastPage.nextCursor },
  )
  const items: AdminSubscriptionRow[] = (query.data?.pages ?? []).flatMap(
    (page: AdminSubscriptionsPage) => page.items,
  )

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="">Todos os status</option>
          {Object.entries(SUB_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={billingCycle}
          onChange={(event) => setBillingCycle(event.target.value)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="">Mensal e anual</option>
          <option value="MONTHLY">Mensal</option>
          <option value="YEARLY">Anual</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th className="py-2 pr-3 font-medium">Usuário</th>
              <th className="py-2 pr-3 font-medium">Plano</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Ciclo</th>
              <th className="py-2 pr-3 font-medium">Período atual</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-600">
                  Carregando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-600">
                  Nenhuma assinatura encontrada.
                </td>
              </tr>
            ) : (
              items.map((sub) => (
                <tr key={sub.id} className="border-b border-ink-100 text-ink-900">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{sub.user.name}</p>
                    <p className="text-xs text-ink-600">{sub.user.email}</p>
                  </td>
                  <td className="py-2 pr-3">{sub.plan.name}</td>
                  <td className="py-2 pr-3">{SUB_STATUS_LABEL[sub.status] ?? sub.status}</td>
                  <td className="py-2 pr-3">{sub.billingCycle === 'YEARLY' ? 'Anual' : 'Mensal'}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600">
                    {formatDateTime(sub.currentPeriodStart)} — {formatDateTime(sub.currentPeriodEnd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function InvoicesTab() {
  const [status, setStatus] = useState('')
  const utils = trpc.useUtils()

  const query = trpc.admin.finance.invoices.useInfiniteQuery(
    { ...(status ? { status: status as never } : {}), limit: 20 },
    { getNextPageParam: (lastPage: AdminInvoicesPage) => lastPage.nextCursor },
  )
  const items: AdminInvoiceRow[] = (query.data?.pages ?? []).flatMap((page: AdminInvoicesPage) => page.items)

  const retry = trpc.admin.finance.retryInvoice.useMutation({
    onSuccess: () => utils.admin.finance.invoices.invalidate(),
  })
  const [armedId, setArmedId] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="">Todos os status</option>
          {Object.entries(INVOICE_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th className="py-2 pr-3 font-medium">Usuário</th>
              <th className="py-2 pr-3 font-medium">Valor</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Vencimento</th>
              <th className="py-2 pr-3 font-medium">Pago em</th>
              <th className="py-2 pr-3 font-medium">Tentativas</th>
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
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-600">
                  Nenhuma fatura encontrada.
                </td>
              </tr>
            ) : (
              items.map((invoice) => (
                <tr key={invoice.id} className="border-b border-ink-100 align-top text-ink-900">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{invoice.subscription.user.name}</p>
                    <p className="text-xs text-ink-600">{invoice.subscription.user.email}</p>
                  </td>
                  <td className="py-2 pr-3">{formatCents(invoice.amountCents)}</td>
                  <td className="py-2 pr-3">{INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(invoice.dueAt)}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(invoice.paidAt)}</td>
                  <td className="py-2 pr-3">{invoice.attempts}</td>
                  <td className="py-2 pr-3">
                    {invoice.status !== 'FAILED' ? (
                      <span className="text-xs text-ink-400">—</span>
                    ) : armedId === invoice.id ? (
                      <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-2">
                        <p className="text-xs text-ink-900">Marcar para nova tentativa?</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={retry.isPending}
                            onClick={() => {
                              retry.mutate({ invoiceId: invoice.id })
                              setArmedId(null)
                            }}
                            className="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setArmedId(null)}
                            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setArmedId(invoice.id)}
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50"
                      >
                        Nova tentativa
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {retry.error ? <p className="mt-2 text-sm text-danger">{retry.error.message}</p> : null}

      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function WebhooksTab() {
  const [processed, setProcessed] = useState<'all' | 'yes' | 'no'>('all')
  const [hasError, setHasError] = useState<'all' | 'yes' | 'no'>('all')
  const utils = trpc.useUtils()

  const query = trpc.admin.finance.webhookEvents.useInfiniteQuery(
    {
      ...(processed !== 'all' ? { processed: processed === 'yes' } : {}),
      ...(hasError !== 'all' ? { hasError: hasError === 'yes' } : {}),
      limit: 20,
    },
    { getNextPageParam: (lastPage: AdminWebhookEventsPage) => lastPage.nextCursor },
  )
  const items: AdminWebhookEventRow[] = (query.data?.pages ?? []).flatMap(
    (page: AdminWebhookEventsPage) => page.items,
  )

  const replay = trpc.admin.finance.replayWebhook.useMutation({
    onSuccess: () => utils.admin.finance.webhookEvents.invalidate(),
  })
  const [armedId, setArmedId] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={processed}
          onChange={(event) => setProcessed(event.target.value as 'all' | 'yes' | 'no')}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="all">Processados e pendentes</option>
          <option value="yes">Só processados</option>
          <option value="no">Só pendentes</option>
        </select>
        <select
          value={hasError}
          onChange={(event) => setHasError(event.target.value as 'all' | 'yes' | 'no')}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        >
          <option value="all">Com e sem erro</option>
          <option value="yes">Só com erro</option>
          <option value="no">Só sem erro</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-600">
              <th className="py-2 pr-3 font-medium">Provedor</th>
              <th className="py-2 pr-3 font-medium">Evento</th>
              <th className="py-2 pr-3 font-medium">Recebido em</th>
              <th className="py-2 pr-3 font-medium">Processado em</th>
              <th className="py-2 pr-3 font-medium">Erro</th>
              <th className="py-2 pr-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-600">
                  Carregando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-600">
                  Nenhum evento encontrado.
                </td>
              </tr>
            ) : (
              items.map((event) => (
                <tr key={event.id} className="border-b border-ink-100 align-top text-ink-900">
                  <td className="py-2 pr-3">{event.provider}</td>
                  <td className="py-2 pr-3">{event.eventType}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(event.createdAt)}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(event.processedAt)}</td>
                  <td className="py-2 pr-3 max-w-[240px] truncate text-xs text-danger" title={event.error ?? undefined}>
                    {event.error ?? '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {armedId === event.id ? (
                      <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-2">
                        <p className="text-xs text-ink-900">Reprocessar este webhook?</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={replay.isPending}
                            onClick={() => {
                              replay.mutate({ id: event.id })
                              setArmedId(null)
                            }}
                            className="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setArmedId(null)}
                            className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setArmedId(event.id)}
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-ink-50"
                      >
                        Replay
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {replay.error ? <p className="mt-2 text-sm text-danger">{replay.error.message}</p> : null}
      {replay.isSuccess ? (
        <p className="mt-2 text-sm text-success">
          Resultado: {replay.data.outcome} — {replay.data.message}
        </p>
      ) : null}

      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50"
          >
            {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

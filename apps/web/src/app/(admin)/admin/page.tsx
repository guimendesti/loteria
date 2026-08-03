'use client'

import { trpc } from '@/lib/trpc'
import { formatCents, formatPct } from '../components/format'
import { GrowthChart } from './components/GrowthChart'
import { FunnelChart } from './components/FunnelChart'
import { SystemHealthPanel } from './components/SystemHealthPanel'

/** BO-01..05 — Dashboard do backoffice (docs/08 §D.2). */
export default function AdminDashboardPage() {
  const kpisQuery = trpc.admin.dashboard.kpis.useQuery()
  const growthQuery = trpc.admin.dashboard.growth.useQuery({ months: 12 })
  const funnelQuery = trpc.admin.dashboard.funnel.useQuery({})
  const healthQuery = trpc.admin.dashboard.systemHealth.useQuery(undefined, {
    // BO-04 é operacional — atualiza sozinho a cada minuto para não depender de F5.
    refetchInterval: 60_000,
  })

  const kpis = kpisQuery.data

  const cards = [
    { label: 'Usuários totais', value: kpis ? kpis.totalUsers.toLocaleString('pt-BR') : '—' },
    { label: 'Ativos (30d)', value: kpis ? kpis.activeUsers30d.toLocaleString('pt-BR') : '—' },
    { label: 'MRR estimado', value: kpis ? formatCents(kpis.mrrCents) : '—' },
    { label: 'ARR estimado', value: kpis ? formatCents(kpis.arrCents) : '—' },
    { label: 'Ticket médio', value: kpis ? formatCents(kpis.averageTicketCents) : '—' },
    { label: 'Churn do mês', value: kpis ? formatPct(kpis.churnRatePct) : '—' },
    { label: 'Conversão free→pago', value: kpis ? formatPct(kpis.freeToPaidConversionPct) : '—' },
    { label: 'Assinantes pagantes', value: kpis ? kpis.payingUsersCount.toLocaleString('pt-BR') : '—' },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Backoffice</h1>

      {/* BO-01 — KPIs. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="text-sm text-ink-600">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">
              {kpisQuery.isLoading ? '…' : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* BO-01 — distribuição por plano. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Assinantes por plano</h2>
        {kpisQuery.isLoading ? (
          <p className="mt-3 text-sm text-ink-600">Carregando…</p>
        ) : !kpis || kpis.subscribersByPlan.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">Nenhum assinante ativo no momento.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {kpis.subscribersByPlan.map((entry) => (
              <div key={entry.planId} className="rounded-md border border-ink-200 px-4 py-2">
                <p className="text-xs text-ink-600">{entry.planName}</p>
                <p className="font-display text-lg font-semibold text-ink-900">
                  {entry.subscriberCount.toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BO-02 — crescimento. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Crescimento</h2>
        <p className="mt-1 text-sm text-ink-600">Novos cadastros e novos assinantes, mês a mês (12 meses).</p>
        {growthQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : (
          <div className="mt-4">
            <GrowthChart data={growthQuery.data ?? []} />
          </div>
        )}
      </div>

      {/* BO-03 — funil. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Funil de conversão</h2>
        <p className="mt-1 text-sm text-ink-600">Cadastro → 1º jogo → 1ª conferência → assinante.</p>
        {funnelQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : (
          <div className="mt-4">
            <FunnelChart steps={funnelQuery.data?.steps ?? []} />
          </div>
        )}
      </div>

      {/* BO-04 (crítico) — saúde do sistema. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Saúde do sistema</h2>
        <p className="mt-1 text-sm text-ink-600">
          Sincronização por modalidade, conferências, notificações e faturas — atualiza a cada minuto.
        </p>
        {healthQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-600">Carregando…</p>
        ) : healthQuery.data ? (
          <div className="mt-4">
            <SystemHealthPanel data={healthQuery.data} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-danger">Não foi possível carregar a saúde do sistema.</p>
        )}
      </div>
    </div>
  )
}

'use client'

import { use } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { formatCents, formatDate, formatDateTime } from '../../../components/format'
import { ActionsPanel } from './components/ActionsPanel'

/** BO-11 — detalhe do usuário: perfil, assinatura, contadores, faturas, auditoria + ações. */
export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = trpc.admin.users.detail.useQuery({ userId: id })

  if (query.isLoading) {
    return <p className="text-sm text-ink-600">Carregando…</p>
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <p className="text-sm text-danger">Usuário não encontrado.</p>
        <Link href="/admin/usuarios" className="mt-2 inline-block text-sm font-medium text-brand-500 hover:text-brand-700">
          ← Voltar para Usuários
        </Link>
      </div>
    )
  }

  const { user, counters, invoices, auditEvents } = query.data
  const subscription = user.subscription

  return (
    <div>
      <Link href="/admin/usuarios" className="text-sm font-medium text-brand-500 hover:text-brand-700">
        ← Usuários
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">{user.name}</h1>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{user.role}</span>
      </div>
      <p className="text-sm text-ink-600">{user.email}</p>
      {user.deletedAt ? (
        <p className="mt-2 rounded-md bg-ink-100 px-3 py-2 text-sm text-ink-600">
          Conta anonimizada em {formatDateTime(user.deletedAt)}.
        </p>
      ) : null}

      {/* Perfil. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InfoField label="Telefone" value={user.phone ?? '—'} />
        <InfoField label="E-mail verificado" value={user.emailVerified ? 'Sim' : 'Não'} />
        <InfoField label="Maior de idade declarado" value={user.isAdult ? 'Sim' : 'Não'} />
        <InfoField label="Fuso horário" value={user.timezone} />
        <InfoField label="Chave Pix cadastrada" value={user.pixKeyType ?? 'Nenhuma'} />
        <InfoField label="Cadastro" value={formatDateTime(user.createdAt)} />
        <InfoField label="Último acesso" value={formatDateTime(user.lastSeenAt)} />
        <InfoField label="Termos aceitos em" value={formatDateTime(user.termsAcceptedAt)} />
      </div>

      {/* Assinatura. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Assinatura</h2>
        {subscription ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoField label="Plano" value={subscription.plan.name} />
            <InfoField label="Status" value={subscription.status} />
            <InfoField label="Ciclo" value={subscription.billingCycle} />
            <InfoField label="Meio de pagamento" value={subscription.paymentMethod} />
            <InfoField label="Período atual" value={`${formatDate(subscription.currentPeriodStart)} — ${formatDate(subscription.currentPeriodEnd)}`} />
            <InfoField label="Trial até" value={formatDate(subscription.trialEndsAt)} />
            <InfoField label="Cancelamento agendado" value={subscription.cancelAtPeriodEnd ? 'Sim' : 'Não'} />
            <InfoField label="Assinante desde" value={formatDate(subscription.createdAt)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-600">Sem assinatura — plano gratuito.</p>
        )}
      </div>

      {/* Contadores. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jogos" value={counters.betsCount} />
        <StatCard label="Jogos ativos" value={counters.activeBetsCount} />
        <StatCard label="Bolões organizados" value={counters.ownedPoolsCount} />
        <StatCard label="Participações em bolão" value={counters.poolMembershipsCount} />
      </div>

      {/* Faturas. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Últimas faturas</h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">Nenhuma fatura.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-ink-400">
                  <th className="pb-2 font-normal">Vencimento</th>
                  <th className="pb-2 font-normal">Valor</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 font-normal">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-ink-200">
                    <td className="py-2 text-ink-900">{formatDate(invoice.dueAt)}</td>
                    <td className="py-2 text-ink-900">{formatCents(invoice.amountCents)}</td>
                    <td className="py-2 text-ink-600">{invoice.status}</td>
                    <td className="py-2 text-ink-600">{formatDate(invoice.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ações — BO-12..15. */}
      <div className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Ações</h2>
        <ActionsPanel userId={id} />
      </div>

      {/* Timeline de auditoria. */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Últimos eventos de auditoria</h2>
        {auditEvents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {auditEvents.map((event) => (
              <li key={event.id} className="border-t border-ink-200 pt-2 text-sm">
                <p className="text-ink-900">{event.action}</p>
                <p className="text-xs text-ink-400">
                  {formatDateTime(event.createdAt)} · ator: {event.actorId ?? 'sistema'} ({event.actorRole ?? '—'})
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="text-sm text-ink-900">{value}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-xs text-ink-600">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-ink-900">{value.toLocaleString('pt-BR')}</p>
    </div>
  )
}

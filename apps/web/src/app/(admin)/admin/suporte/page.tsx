'use client'

/**
 * BO-50/51 (docs/08 §D.7) — "caixa de suporte" e histórico de notificações de um usuário.
 *
 * ⚠️ Não existe tabela de tickets/mensagens de contato (`/contato` usa `mailto:`, ver
 * `server/routers/admin/support.ts`). Esta tela é o substituto documentado: notificações
 * que falharam + eventos recentes de auditoria, para o time de suporte ter algo para
 * triagem. `userNotifications` é a ferramenta real de BO-51 — "por que este usuário diz que
 * não recebeu uma notificação".
 */
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDateTime } from '../../components/format'

const NOTIFICATION_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Na fila',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  READ: 'Lida',
}

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'E-mail',
  PUSH: 'Push',
  WHATSAPP: 'WhatsApp',
  IN_APP: 'No app',
}

/**
 * Formas mínimas da resposta de `admin.support.*` (server/routers/admin/support.ts).
 * Anotadas explicitamente pelo mesmo motivo de `admin/apostas/page.tsx`: até `_app.ts`
 * registrar o router `admin`, `trpc.admin` resolve como `any`.
 */
interface FailedNotificationRow {
  id: string
  userId: string
  channel: string
  type: string
  error: string | null
  createdAt: string | Date
}
interface AuditEventRow {
  id: string
  action: string
  entityType: string
  entityId: string
  actorRole: string | null
  createdAt: string | Date
}
interface UserNotificationRow {
  id: string
  channel: string
  type: string
  title: string
  status: string
  sentAt: string | Date | null
  readAt: string | Date | null
  error: string | null
}
interface UserNotificationsPage {
  items: UserNotificationRow[]
  nextCursor: string | undefined
}

export default function AdminSuportePage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Suporte</h1>
      <p className="mt-1 text-sm text-ink-600">
        Caixa de suporte aproximada (BO-50) e histórico de notificações por usuário (BO-51).
      </p>

      <MessagesInbox />
      <UserNotificationsLookup />
    </div>
  )
}

function MessagesInbox() {
  const query = trpc.admin.support.messages.list.useQuery({})

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Notificações com falha</h2>
        <p className="mt-1 text-xs text-ink-600">
          Não é uma caixa de tickets — é o que o sistema tentou entregar e não conseguiu.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="py-2 pr-3 font-medium">Usuário</th>
                <th className="py-2 pr-3 font-medium">Canal</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Erro</th>
                <th className="py-2 pr-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-ink-600">
                    Carregando…
                  </td>
                </tr>
              ) : (query.data?.failedNotifications.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-ink-600">
                    Nenhuma notificação com falha.
                  </td>
                </tr>
              ) : (
                query.data?.failedNotifications.map((notification: FailedNotificationRow) => (
                  <tr key={notification.id} className="border-b border-ink-100 align-top text-ink-900">
                    <td className="py-2 pr-3 text-xs">{notification.userId}</td>
                    <td className="py-2 pr-3 text-xs">{CHANNEL_LABEL[notification.channel] ?? notification.channel}</td>
                    <td className="py-2 pr-3 text-xs">{notification.type}</td>
                    <td className="max-w-[160px] truncate py-2 pr-3 text-xs text-danger" title={notification.error ?? undefined}>
                      {notification.error ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(notification.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Eventos recentes de auditoria</h2>
        <p className="mt-1 text-xs text-ink-600">Ações administrativas mais recentes, para dar contexto.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="py-2 pr-3 font-medium">Ação</th>
                <th className="py-2 pr-3 font-medium">Entidade</th>
                <th className="py-2 pr-3 font-medium">Ator</th>
                <th className="py-2 pr-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-ink-600">
                    Carregando…
                  </td>
                </tr>
              ) : (query.data?.recentAuditEvents.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-ink-600">
                    Nenhum evento recente.
                  </td>
                </tr>
              ) : (
                query.data?.recentAuditEvents.map((event: AuditEventRow) => (
                  <tr key={event.id} className="border-b border-ink-100 align-top text-ink-900">
                    <td className="py-2 pr-3 text-xs">{event.action}</td>
                    <td className="py-2 pr-3 text-xs">
                      {event.entityType}:{event.entityId.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{event.actorRole ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(event.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** BO-51 — histórico de notificações de UM usuário ("não recebi"). */
function UserNotificationsLookup() {
  const [userIdInput, setUserIdInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const query = trpc.admin.support.userNotifications.useInfiniteQuery(
    { userId: userId ?? '', limit: 25 },
    { enabled: userId !== null, getNextPageParam: (lastPage: UserNotificationsPage) => lastPage.nextCursor },
  )
  const items: UserNotificationRow[] = (query.data?.pages ?? []).flatMap(
    (page: UserNotificationsPage) => page.items,
  )

  return (
    <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Histórico de notificações de um usuário</h2>
      <p className="mt-1 text-sm text-ink-600">
        Para depurar "não recebi" — mostra todas as notificações registradas para o usuário,
        com canal, status e erro (se houve).
      </p>

      <div className="mt-3 flex gap-2 text-sm">
        <input
          type="text"
          placeholder="ID do usuário"
          value={userIdInput}
          onChange={(event) => setUserIdInput(event.target.value)}
          className="w-64 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900"
        />
        <button
          type="button"
          onClick={() => setUserId(userIdInput.trim() || null)}
          disabled={userIdInput.trim().length === 0}
          className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Buscar
        </button>
      </div>

      {userId ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="py-2 pr-3 font-medium">Canal</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Título</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Enviada em</th>
                <th className="py-2 pr-3 font-medium">Lida em</th>
                <th className="py-2 pr-3 font-medium">Erro</th>
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
                    Nenhuma notificação encontrada para este usuário.
                  </td>
                </tr>
              ) : (
                items.map((notification) => (
                  <tr key={notification.id} className="border-b border-ink-100 align-top text-ink-900">
                    <td className="py-2 pr-3 text-xs">{CHANNEL_LABEL[notification.channel] ?? notification.channel}</td>
                    <td className="py-2 pr-3 text-xs">{notification.type}</td>
                    <td className="py-2 pr-3 text-xs">{notification.title}</td>
                    <td className="py-2 pr-3 text-xs">
                      {NOTIFICATION_STATUS_LABEL[notification.status] ?? notification.status}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(notification.sentAt)}</td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{formatDateTime(notification.readAt)}</td>
                    <td className="max-w-[160px] truncate py-2 pr-3 text-xs text-danger" title={notification.error ?? undefined}>
                      {notification.error ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

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
      ) : null}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDate } from '../../components/format'

// Listas locais (não importadas de `@lotopro/db`/`server/routers/admin/users.ts` de
// propósito): qualquer import de VALOR desses módulos arrastaria `@prisma/client` para o
// bundle do cliente (o Prisma client é Node-only — instancia conexão/engine nativa no
// module-load, quebra em runtime de browser). Mesma convenção de
// `(app)/app/jogos/page.tsx` (`type StatusFilter = 'all' | 'active' | 'finished'` local).
const ROLE_OPTIONS = ['CUSTOMER', 'VIEWER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const
const STATUS_OPTIONS = ['free', 'trialing', 'active', 'past_due', 'canceled', 'expired'] as const
/** BO-13 — filtro de bloqueio. `''` = todos, sem filtrar por `blockedAt` no servidor. */
const BLOCKED_OPTIONS = ['blocked', 'not_blocked'] as const
type RoleOption = (typeof ROLE_OPTIONS)[number]
type StatusOption = (typeof STATUS_OPTIONS)[number]
type BlockedOption = (typeof BLOCKED_OPTIONS)[number]

const STATUS_LABEL: Record<StatusOption, string> = {
  free: 'Sem assinatura',
  trialing: 'Em trial',
  active: 'Ativa',
  past_due: 'Em atraso',
  canceled: 'Cancelada',
  expired: 'Expirada',
}

const BLOCKED_LABEL: Record<BlockedOption, string> = {
  blocked: 'Bloqueados',
  not_blocked: 'Não bloqueados',
}

/** BO-10 — listagem de usuários: busca + filtros + paginação por cursor. */
export default function AdminUsersPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<RoleOption | ''>('')
  const [status, setStatus] = useState<StatusOption | ''>('')
  const [planSlug, setPlanSlug] = useState('')
  const [blocked, setBlocked] = useState<BlockedOption | ''>('')

  // Debounce simples: evita 1 query por tecla digitada.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const query = trpc.admin.users.list.useInfiniteQuery(
    {
      ...(search ? { search } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(planSlug.trim() ? { planSlug: planSlug.trim() } : {}),
      ...(blocked ? { blocked: blocked === 'blocked' } : {}),
      limit: 20,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  )

  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const isEmpty = !query.isLoading && items.length === 0
  const hasFilters = search !== '' || role !== '' || status !== '' || planSlug.trim() !== '' || blocked !== ''

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Usuários</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome, e-mail ou ID"
          className="min-w-[240px] flex-1 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
          aria-label="Buscar usuários"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as RoleOption | '')}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
          aria-label="Filtrar por papel"
        >
          <option value="">Todos os papéis</option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusOption | '')}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
          aria-label="Filtrar por status de assinatura"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABEL[option]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={planSlug}
          onChange={(event) => setPlanSlug(event.target.value)}
          placeholder="Plano (slug)"
          className="w-40 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
          aria-label="Filtrar por plano"
        />
        <select
          value={blocked}
          onChange={(event) => setBlocked(event.target.value as BlockedOption | '')}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900"
          aria-label="Filtrar por bloqueio"
        >
          <option value="">Bloqueados e não bloqueados</option>
          {BLOCKED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {BLOCKED_LABEL[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-ink-400">
              <th className="px-4 py-3 font-normal">Nome / e-mail</th>
              <th className="px-4 py-3 font-normal">Papel</th>
              <th className="px-4 py-3 font-normal">Plano</th>
              <th className="px-4 py-3 font-normal">Cadastro</th>
              <th className="px-4 py-3 font-normal">Último acesso</th>
              <th className="px-4 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-600">
                  Carregando…
                </td>
              </tr>
            ) : isEmpty ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-600">
                  {hasFilters ? 'Nenhum usuário encontrado com esses filtros.' : 'Nenhum usuário cadastrado ainda.'}
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-900">
                      {user.name}
                      {user.blockedAt ? (
                        <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          bloqueado
                        </span>
                      ) : null}
                      {user.deletedAt ? (
                        <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                          anonimizado
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-600">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-900">{user.role}</td>
                  <td className="px-4 py-3 text-ink-900">
                    {user.subscription ? (
                      <>
                        {user.subscription.plan.name}
                        <span className="ml-1 text-xs text-ink-400">({user.subscription.status})</span>
                      </>
                    ) : (
                      <span className="text-ink-400">Free</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-600">{formatDate(user.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/usuarios/${user.id}`}
                      className="text-sm font-medium text-brand-500 hover:text-brand-700"
                    >
                      Ver detalhe →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {query.hasNextPage ? (
        <div className="mt-6 flex justify-center">
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

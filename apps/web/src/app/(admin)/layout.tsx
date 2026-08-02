import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Layout protegido do backoffice (docs/08 Parte D). RBAC: `VIEWER`,
 * `SUPPORT`, `FINANCE`, `ADMIN` (docs/08 §D.1) têm acesso; `CUSTOMER` não.
 *
 * ⚠️ Pendência conhecida (fora do escopo desta tarefa, `packages/db` está
 * fora de apps/web/): o enum `UserRole` do Prisma
 * (packages/db/prisma/schema.prisma) hoje só tem `CUSTOMER | SUPPORT |
 * FINANCE | ADMIN` — falta `VIEWER`. A checagem abaixo usa a lista completa
 * de docs/08 §D.1 mesmo assim (comparação por string, não pelo enum do
 * Prisma) para já estar correta quando o schema for atualizado.
 */
const BACKOFFICE_ROLES = ['VIEWER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect('/login')
  }

  const role = session.user.role
  const isBackofficeUser = (BACKOFFICE_ROLES as readonly string[]).includes(role)

  if (!isBackofficeUser) {
    redirect('/app')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-ink-200 bg-brand-900 px-6 py-5 text-white">
        <p className="font-display text-xl font-bold">LotoPro Admin</p>
        <p className="mt-1 text-xs text-brand-300">{role}</p>
      </aside>
      <main className="flex-1 bg-ink-50 px-8 py-8">{children}</main>
    </div>
  )
}

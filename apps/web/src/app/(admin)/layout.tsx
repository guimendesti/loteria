import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ADMIN_NAV_SECTIONS, ADMIN_ROLES, canAccessNavSection, type AdminRole } from '@/server/lib/admin/rbac'
import { TRPCReactProvider } from '@/app/(app)/trpc-provider'
import { AdminNav } from './components/AdminNav'
import { AdminRoleProvider } from './components/AdminRoleContext'

/**
 * Layout protegido do backoffice (docs/08 Parte D). RBAC: `VIEWER`, `SUPPORT`, `FINANCE`,
 * `ADMIN` (docs/08 §D.1, `ADMIN_ROLES` de `server/lib/admin/rbac.ts` — fonte única da
 * verdade dos papéis de backoffice, reaproveitada aqui em vez de uma lista duplicada)
 * têm acesso; `CUSTOMER` não. Este check server-side é só a PRIMEIRA linha de defesa (UX
 * de redirecionar cedo) — cada procedure de `server/routers/admin/*.ts` valida de novo
 * com `adminProcedure`/`requirePermission`, nunca confiando só nisto (CLAUDE.md
 * "Convenções": autorização sempre no servidor).
 */
function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

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
  if (!isAdminRole(role)) {
    redirect('/app')
  }

  // Filtra o menu pelo MESMO mapa de permissões que os routers `admin/*.ts` usam
  // (`server/lib/admin/rbac.ts` — achado de auditoria, severidade média: mostrar uma seção
  // que o papel não pode abrir vaza a topologia do backoffice). Calculado aqui (server
  // component, já tem `role` validado) e passado como dado simples para `AdminNav`
  // ('use client'), que nunca importa `rbac.ts` em tempo de execução.
  const navItems = ADMIN_NAV_SECTIONS.filter((section) => canAccessNavSection(role, section))

  return (
    <TRPCReactProvider>
      <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-ink-200 bg-brand-900 px-6 py-5 text-white">
        <p className="font-display text-xl font-bold">LotoPro Admin</p>
        <p className="mt-1 text-xs text-brand-300">{role}</p>
        <AdminNav items={navItems} />
      </aside>
      <main className="flex-1 bg-ink-50 px-8 py-8">
        <AdminRoleProvider role={role}>{children}</AdminRoleProvider>
      </main>
      </div>
    </TRPCReactProvider>
  )
}

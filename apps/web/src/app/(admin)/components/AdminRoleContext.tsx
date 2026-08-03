'use client'

/**
 * Expõe o papel de backoffice do ator (já resolvido no servidor, `(admin)/layout.tsx`)
 * para os componentes cliente das telas — usado para mostrar/esconder ações que só fazem
 * sentido para um papel específico (ex.: "Trocar papel" só para `ADMIN`, docs/08 §D.1).
 *
 * Isto é SÓ UX (evita mostrar um botão que o servidor vai recusar de qualquer forma) —
 * nunca a fonte da verdade: toda procedure em `server/routers/admin/*.ts` valida de novo
 * com `adminProcedure`/`requirePermission` (`server/lib/admin/rbac.ts`). Esconder um botão
 * no cliente não substitui o gate no servidor (CLAUDE.md "Convenções").
 */
import { createContext, useContext } from 'react'
import type { AdminRole } from '@/server/lib/admin/rbac'

const AdminRoleContext = createContext<AdminRole | null>(null)

export function AdminRoleProvider({ role, children }: { role: AdminRole; children: React.ReactNode }) {
  return <AdminRoleContext.Provider value={role}>{children}</AdminRoleContext.Provider>
}

/** Lança se usado fora de `AdminRoleProvider` — todo o `(admin)/**` fica dentro dele via `layout.tsx`. */
export function useAdminRole(): AdminRole {
  const role = useContext(AdminRoleContext)
  if (!role) {
    throw new Error('useAdminRole() chamado fora de <AdminRoleProvider> — verifique (admin)/layout.tsx.')
  }
  return role
}

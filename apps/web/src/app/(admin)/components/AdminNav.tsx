'use client'

/**
 * Navegação do backoffice (docs/08 Parte D). Achado de auditoria (severidade média): a
 * versão anterior mostrava TODAS as 6 seções para qualquer admin, mesmo as que o papel dele
 * levaria 403 ao abrir (ex.: "Financeiro" para um agente de SUPORTE) — vaza a topologia do
 * backoffice para quem não pode usá-la. A REGRA de quem vê o quê mora só em
 * `server/lib/admin/rbac.ts` (`ADMIN_NAV_SECTIONS`/`canAccessNavSection`, o MESMO
 * rank/permissão que cada router de `admin/*` já exige) — este componente nunca a
 * reimplementa nem a importa em tempo de execução (aquele módulo carrega `@trpc/server`/
 * Prisma, inseguros no bundle do cliente). `(admin)/layout.tsx` (server component) já
 * filtra e passa só os itens permitidos aqui; `AdminNavItem` é `import type` (apagado na
 * compilação, mesmo padrão de `AdminRoleContext.tsx`).
 *
 * As ROTAS continuam protegidas no servidor independentemente disto — esconder um item do
 * menu é só UX (evita o clique morto), nunca a fonte da verdade (CLAUDE.md "Convenções").
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AdminNavSection } from '@/server/lib/admin/rbac'

export type AdminNavItem = Pick<AdminNavSection, 'href' | 'label'>

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname()

  // Papel sem NENHUMA seção acessível (hoje nunca acontece — os 4 papéis de backoffice têm
  // ao menos "Dashboard" — mas um papel futuro com zero permissões não deveria renderizar
  // um <nav> vazio, ver docblock acima).
  if (items.length === 0) return null

  return (
    <nav aria-label="Navegação do backoffice" className="mt-8 flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-700/60 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

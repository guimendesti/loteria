'use client'

/**
 * Navegação do backoffice (docs/08 Parte D). Os 4 últimos itens (Apostas, Financeiro,
 * Configurações, Suporte) são território de outro agente nesta onda (ORQUESTRACAO.md,
 * Onda 7 · admin-ops) — os links já existem aqui porque a navegação é UM componente só,
 * mas as páginas podem devolver 404 até esse agente entregar as dele. Isso é esperado
 * (instrução explícita da tarefa), não um bug desta tela.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/apostas', label: 'Apostas' },
  { href: '/admin/financeiro', label: 'Financeiro' },
  { href: '/admin/config', label: 'Configurações' },
  { href: '/admin/suporte', label: 'Suporte' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegação do backoffice" className="mt-8 flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
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

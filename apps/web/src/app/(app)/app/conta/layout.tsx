'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/app/conta', label: 'Perfil e segurança' },
  { href: '/app/conta/assinatura', label: 'Assinatura' },
  { href: '/app/conta/notificacoes', label: 'Notificações' },
  { href: '/app/conta/privacidade', label: 'Privacidade' },
] as const

/**
 * Layout compartilhado das 4 telas de Conta (docs/08 §C.8, CL-100..CL-109). A nav
 * principal (`(app)/components/Sidebar.tsx`, fora do território desta tarefa) já tem um
 * único link "Conta" apontando para `/app/conta` — esta sub-navegação em abas é o que
 * leva às outras 3 telas.
 *
 * `PaywallDialog` (`(app)/app/components/PaywallDialog.tsx`) aponta seus CTAs para
 * `/app/conta/assinatura` — essa rota existe exatamente nesse caminho (ver
 * `assinatura/page.tsx`).
 */
export default function ContaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Conta</h1>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-ink-200 pb-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                active
                  ? 'bg-brand-500 text-white'
                  : 'border border-ink-200 bg-white text-ink-600 hover:text-ink-900'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  )
}

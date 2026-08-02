import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/jogos', label: 'Meus Jogos' },
  { href: '/app/boloes', label: 'Bolões' },
  { href: '/app/resultados', label: 'Resultados' },
  { href: '/app/estatisticas', label: 'Estatísticas' },
  { href: '/app/carteira', label: 'Carteira' },
  { href: '/app/conta', label: 'Conta' },
] as const

/**
 * Nav lateral do painel do cliente. Só `/app` e `/app/jogos` têm página
 * implementada nesta tarefa (shell) — os demais links já apontam para a
 * rota final prevista em docs/08 Parte C, ainda sem `page.tsx`.
 */
export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-ink-200 bg-white">
      <div className="px-6 py-5">
        <Link href="/" className="font-display text-xl font-bold text-brand-700">
          LotoPro
        </Link>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

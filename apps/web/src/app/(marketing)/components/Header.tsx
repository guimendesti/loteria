import Link from 'next/link'

/** Nav de topo do site público — não é uma das 9 seções da home (docs/08 §A.3), é chrome do layout. */
export function Header() {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold text-brand-700">
          LotoPro
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-semibold text-ink-600 hover:text-ink-900">
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Começar grátis
          </Link>
        </nav>
      </div>
    </header>
  )
}

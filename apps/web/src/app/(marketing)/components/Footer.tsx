import Link from 'next/link'

/**
 * Seção 9 — Rodapé (docs/08 §A.3.9). Disclaimer legal COMPLETO e literal de
 * docs/03-marco-legal-e-compliance.md §3.4 D4 ("Rodapé de todas as
 * páginas") — texto não editorializável, não resumir nem parafrasear.
 */
export function Footer() {
  return (
    <footer className="bg-brand-900 px-6 py-10 text-brand-100">
      <div className="mx-auto max-w-6xl">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/planos" className="hover:text-white">
            Planos
          </Link>
          <Link href="/recursos" className="hover:text-white">
            Recursos
          </Link>
          <Link href="/faq" className="hover:text-white">
            FAQ
          </Link>
          <Link href="/jogo-responsavel" className="hover:text-white">
            Jogo responsável
          </Link>
          <Link href="/termos" className="hover:text-white">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="hover:text-white">
            Política de privacidade
          </Link>
          <Link href="/contato" className="hover:text-white">
            Contato
          </Link>
        </nav>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-brand-300">
          O LotoPro é um software independente de organização e análise de
          apostas. Não temos vínculo, parceria ou autorização da Caixa
          Econômica Federal. Não realizamos apostas, não vendemos cotas e não
          intermediamos pagamentos de jogos. Todas as apostas devem ser feitas
          nos canais oficiais da CAIXA.
        </p>

        <p className="mt-6 text-xs text-brand-300">
          © {new Date().getFullYear()} LotoPro. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}

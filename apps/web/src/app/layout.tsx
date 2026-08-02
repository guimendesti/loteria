import type { Metadata } from 'next'
import { Inter, Sora } from 'next/font/google'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'LotoPro — Organize seus jogos e bolões de loteria',
    template: '%s · LotoPro',
  },
  description:
    'Cadastre uma vez. O LotoPro confere todos os concursos e te avisa se você ganhou.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable}`}>
      <body className="bg-ink-50 font-body text-ink-900 antialiased">
        {children}
      </body>
    </html>
  )
}

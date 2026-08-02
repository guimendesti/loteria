import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Sidebar } from '@/app/(app)/components/Sidebar'
import { TRPCReactProvider } from '@/app/(app)/trpc-provider'

/**
 * Layout protegido do painel do cliente (docs/08 Parte C). Sessão checada
 * server-side via Better Auth — sem sessão, redireciona para /login antes de
 * renderizar qualquer coisa (nunca confiar em checagem só client-side).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect('/login')
  }

  return (
    <TRPCReactProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-ink-50 px-8 py-8">{children}</main>
      </div>
    </TRPCReactProvider>
  )
}

/**
 * Onda 8 — convite público de bolão (`/j/[inviteCode]`). Porta de entrada viral do produto:
 * alguém recebe o link no WhatsApp e cai aqui, provavelmente deslogado, no celular. Não exige
 * login para VER o convite — só para entrar (pedido no escopo).
 *
 * Rota escolhida: `(marketing)/j/[inviteCode]`, não `apps/web/src/app/j/[inviteCode]` (o
 * caminho-padrão sugerido no escopo). Toda página pública deste repo mora no grupo de rota
 * `(marketing)` (`resultados/[modalidade]`, `conferir/[modalidade]` etc. — ver
 * `app/(marketing)/layout.tsx`, que dá Header/Footer/legais de graça); um `app/j/**` solto na
 * raiz quebraria essa convenção sem ganhar nada. A URL final é a mesma (`/j/<code>`) —
 * grupos de rota não entram na URL.
 *
 * CLAUDE.md regra 4 ("bolão é privado e por convite, nunca criar diretório público") não se
 * aplica aqui: esta é a busca de UM convite por CÓDIGO opaco (o próprio mecanismo de convite
 * do contrato, `pool.joinPreview`), não uma listagem/busca de bolões alheios.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import type { LotterySlug } from '@lotopro/core'
import { Badge } from '@lotopro/ui'
import { auth } from '@/lib/auth'
import { SITE_URL } from '@/app/(marketing)/lib/site'
import { formatCents } from '@/app/(marketing)/lib/format'
import { TRPCReactProvider } from '@/app/(app)/trpc-provider'
import { getJoinPreview, resolveJoinState, type JoinState } from './data'
import { JoinAction } from './JoinAction'

// Cotas restantes e sessão precisam estar sempre em dia — não é conteúdo cacheável por ISR
// como resultados/conferidor (LP-07/LP-08). `headers()` abaixo já força renderização dinâmica;
// a diretiva só deixa a intenção explícita.
export const dynamic = 'force-dynamic'

type PageParams = { params: Promise<{ inviteCode: string }> }

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { inviteCode } = await params
  const outcome = await getJoinPreview(inviteCode)

  // Convite privado por natureza (código único por bolão) — nunca deve aparecer em busca,
  // mesmo que `robots.txt` (global, `(marketing)`) permita o crawl da rota.
  const robots = { index: false, follow: false } as const

  if (outcome.kind !== 'found') {
    return { title: 'Convite de bolão — LotoPro', robots }
  }

  const { preview } = outcome
  const title = `Bolão "${preview.poolName}" — ${preview.lottery.name} | LotoPro`
  const description =
    `${preview.ownerName} está organizando um bolão da ${preview.lottery.name}. ` +
    `Cota de ${formatCents(preview.shareValueCents)}. Entre no LotoPro para participar.`
  const url = `${SITE_URL}/j/${inviteCode}`

  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    // Open Graph — o link vai ser colado no WhatsApp e precisa de preview decente.
    openGraph: { title, description, url, type: 'website', siteName: 'LotoPro' },
    twitter: { card: 'summary', title, description },
  }
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-md rounded-lg border border-ink-200 bg-white p-8 text-center">
        <h1 className="font-display text-xl font-bold text-ink-900">{title}</h1>
        <p className="mt-3 text-sm text-ink-600">{body}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Ir para a home
        </Link>
      </div>
    </div>
  )
}

const TERMINAL_STATE_COPY: Record<Exclude<JoinState, 'joinable'>, { title: string; body: (poolName: string) => string }> = {
  expired: {
    title: 'Este convite expirou',
    body: (poolName) =>
      `O link de convite do bolão "${poolName}" não é mais válido. Peça um novo convite para o organizador.`,
  },
  full: {
    title: 'Este bolão já está completo',
    body: (poolName) =>
      `Todas as cotas do bolão "${poolName}" já foram reservadas. Fale com o organizador se sobrar alguma vaga.`,
  },
  draft: {
    title: 'Este bolão ainda não foi publicado',
    body: (poolName) =>
      `O organizador do bolão "${poolName}" ainda está preparando tudo. Peça para ele reenviar o convite quando abrir.`,
  },
  closed: {
    title: 'Este bolão não aceita mais participantes',
    body: (poolName) => `O bolão "${poolName}" já fechou para novas entradas.`,
  },
  canceled: {
    title: 'Este bolão foi cancelado',
    body: (poolName) => `O organizador cancelou o bolão "${poolName}".`,
  },
}

export default async function InviteCodePage({ params }: PageParams) {
  const { inviteCode } = await params

  const [outcome, session] = await Promise.all([
    getJoinPreview(inviteCode),
    auth.api.getSession({ headers: await headers() }),
  ])

  if (outcome.kind === 'error') {
    return (
      <StateCard
        title="Não deu para carregar este convite"
        body="Algo deu errado do nosso lado. Atualize a página em alguns instantes."
      />
    )
  }
  if (outcome.kind === 'not_found') {
    return <StateCard title="Convite não encontrado" body="Esse link de convite não existe ou foi removido." />
  }

  const { preview } = outcome
  const state = resolveJoinState(preview)

  if (state !== 'joinable') {
    const copy = TERMINAL_STATE_COPY[state]
    return <StateCard title={copy.title} body={copy.body(preview.poolName)} />
  }

  const inviteHref = `/j/${inviteCode}`
  const contestLabel =
    preview.contestFrom === preview.contestTo
      ? `Concurso ${preview.contestFrom}`
      : `Concursos ${preview.contestFrom} a ${preview.contestTo}`

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-lg">
        <Badge lotterySlug={preview.lottery.slug as LotterySlug}>{preview.lottery.name}</Badge>

        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Você foi convidado para o bolão &ldquo;{preview.poolName}&rdquo;
        </h1>
        <p className="mt-2 text-ink-600">Organizado por {preview.ownerName}</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-ink-200 bg-white p-6 text-sm">
          <div>
            <dt className="text-ink-400">Modalidade</dt>
            <dd className="font-medium text-ink-900">{preview.lottery.name}</dd>
          </div>
          <div>
            <dt className="text-ink-400">Concursos</dt>
            <dd className="font-medium text-ink-900">{contestLabel}</dd>
          </div>
          <div>
            <dt className="text-ink-400">Valor da cota</dt>
            <dd className="font-medium text-ink-900">{formatCents(preview.shareValueCents)}</dd>
          </div>
          <div>
            <dt className="text-ink-400">Cotas restantes</dt>
            <dd className="font-medium text-ink-900">{preview.sharesAvailable}</dd>
          </div>
        </dl>

        {/* Aviso jurídico — docs/03: zero custódia, Pix é sempre P2P participante → organizador. */}
        <p className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs leading-relaxed text-ink-600">
          O pagamento da cota é feito por Pix DIRETO ao organizador. O LotoPro é só o
          gerenciador do bolão — não recebe, não guarda e não repassa nenhum valor.
        </p>

        <div className="mt-8">
          {session ? (
            <TRPCReactProvider>
              <JoinAction
                inviteCode={inviteCode}
                sharesAvailable={preview.sharesAvailable}
                shareValueCents={preview.shareValueCents}
              />
            </TRPCReactProvider>
          ) : (
            <div className="rounded-lg border border-ink-200 bg-white p-6 text-center">
              <p className="text-sm text-ink-600">Entre ou crie uma conta grátis para participar deste bolão.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href={`/login?callbackURL=${encodeURIComponent(inviteHref)}`}
                  className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Entrar para participar
                </Link>
                <Link
                  href={`/cadastro?callbackURL=${encodeURIComponent(inviteHref)}`}
                  className="rounded-md border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
                >
                  Criar conta grátis
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

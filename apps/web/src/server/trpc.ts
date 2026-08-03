/**
 * tRPC v11 — inicialização, contexto e procedures base.
 *
 * Contexto carrega a sessão do Better Auth (a partir dos headers da request
 * fetch), o client Prisma de @lotopro/db, `getEntitlements()` — leitor lazy
 * dos entitlements de plano do usuário (docs/06 §6.9) — e `ip`/`userAgent`,
 * extraídos uma vez por requisição para os routers de `admin/*` passarem a
 * `writeAudit` (server/lib/admin/audit.ts) sem cada procedure ter que ler
 * headers na mão. `protectedProcedure` é o único lugar que decide "tem sessão
 * ou não"; os guards de plano (G1..G10, docs/05 §5.4) são responsabilidade de
 * cada router (ver `guardOrThrow` abaixo e `server/routers/bets.ts`).
 */
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { prisma } from '@lotopro/db'
import { getEntitlements as getStaticEntitlements, type Entitlements, type GuardResult } from '@lotopro/core'
import { auth } from '@/lib/auth'
import { BetValidationError, PaywallError } from '@/server/errors'
import { resolveEntitlements } from '@/server/lib/entitlements'

/**
 * IP do cliente por trás do Traefik (deploy — skill `deploy-monorepo-vps`): o app roda
 * atrás de um reverse proxy, então o socket da requisição aqui dentro é sempre o do
 * container Node, nunca o do navegador. `x-forwarded-for` é a lista "cliente, proxy1,
 * proxy2, ..." que o Traefik injeta — o PRIMEIRO elemento é o cliente original, os demais
 * são hops intermediários. Fallback para `x-real-ip` (também comum em config de proxy)
 * quando o primeiro header não vem. `null` quando nenhum dos dois está presente (ex.:
 * chamada direta em dev, sem proxy na frente) — nunca inventa um IP.
 */
function clientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = headers.get('x-real-ip')
  return realIp && realIp.trim().length > 0 ? realIp.trim() : null
}

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers })
  // `AuditLog.ip`/`.userAgent` (achado de auditoria, severidade média): sem isto no
  // contexto, `writeAudit` (server/lib/admin/audit.ts) nunca tinha de onde tirar os dois
  // campos — o log de auditoria registrava O QUE foi feito, nunca DE ONDE. Truncagem de
  // user-agent para um tamanho são é responsabilidade de `writeAudit`, não daqui (único
  // ponto de escrita na coluna).
  const ip = clientIpFromHeaders(req.headers)
  const userAgent = req.headers.get('user-agent')

  // Memoizado por FECHAMENTO — vive só durante esta requisição (uma
  // `createTRPCContext` por chamada HTTP). Nunca cacheado entre requisições:
  // isso vazaria o plano de um usuário para outro numa instância compartilhada
  // do processo Node. Chamadas repetidas a `getEntitlements()` dentro do mesmo
  // request (ex.: `bets.create` conferindo o guard e depois lendo o limite de
  // novo) reaproveitam a mesma Promise em vez de bater no banco de novo.
  let entitlementsPromise: Promise<Entitlements> | null = null
  function getEntitlements(): Promise<Entitlements> {
    // Sem sessão: procedures públicas que eventualmente chamem isso (não há
    // nenhuma hoje) recebem os limites do Free em vez de estourar — quem
    // exige sessão de verdade é `protectedProcedure`, abaixo.
    if (!session) return Promise.resolve(getStaticEntitlements('free'))
    entitlementsPromise ??= resolveEntitlements(prisma, session.user.id)
    return entitlementsPromise
  }

  return {
    prisma,
    session,
    getEntitlements,
    ip,
    userAgent,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  /**
   * Expõe dois canais de erro estruturado em `shape.data`, cada um lido do
   * `cause` do `TRPCError` (mesmo padrão para os dois — nunca inferir pelo
   * `code` HTTP sozinho, que é compartilhado por outros erros BAD_REQUEST/FORBIDDEN):
   * - `betValidationErrors`: `ValidationError[]` do core (`validateBet`) — o
   *   cliente destaca campos do seletor de dezenas (docs/08 CL-12).
   * - `paywall`: `{ gate, limit, current }` de um `GuardResult` negativo
   *   (`guardOrThrow` abaixo) — o cliente abre o `PaywallDialog` (docs/09 C6)
   *   com o gate certo (G1..G10, docs/05 §5.4).
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        betValidationErrors:
          error.cause instanceof BetValidationError ? error.cause.errors : null,
        paywall: error.cause instanceof PaywallError ? toPaywallData(error.cause.result) : null,
      },
    }
  },
})

export const router = t.router
export const middleware = t.middleware
export const publicProcedure = t.procedure

/** Exige sessão válida (Better Auth). Nunca confiar só em checagem client-side. */
export const protectedProcedure = t.procedure.use(function isAuthed(opts) {
  const { ctx } = opts
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  // BO-13 — conta bloqueada pelo backoffice (`admin.users.toggleBlock`,
  // routers/admin/users.ts) não passa por NENHUMA procedure protegida — inclusive
  // `adminProcedure` (server/lib/admin/rbac.ts), que é `protectedProcedure.use(...)`, então
  // este `.use()` roda ANTES do gate de RBAC do backoffice. `toggleBlock` já revoga as
  // sessões ativas no exato momento do bloqueio (efeito imediato); este check cobre o que
  // aquilo não cobre — uma sessão criada por outro caminho/timing (ex.: race entre o
  // `deleteMany` de sessões e uma requisição já em voo) — e é a MESMA razão de existir do
  // guard irmão em `databaseHooks.session.create.before` (lib/auth.ts), que impede a
  // criação de uma sessão NOVA por login.
  //
  // Custo: ZERO query extra por requisição. `blockedAt` é um `additionalField` do Better
  // Auth (lib/auth.ts) — chega de graça em `ctx.session.user`, populado pela MESMA consulta
  // que `auth.api.getSession()` já faz uma vez por request em `createTRPCContext` acima.
  if (ctx.session.user.blockedAt) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Sua conta está bloqueada. Entre em contato com o suporte para mais informações.',
    })
  }
  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  })
})

// ─── Guards de entitlements (docs/05 §5.4) ──────────────────────────────────

/**
 * `result.limit`/`result.current` só existem no `GuardResult` quando são
 * números concretos (`packages/core/src/entitlements/types.ts`) —
 * `exactOptionalPropertyTypes` proíbe atribuir `undefined` explicitamente às
 * chaves opcionais, daí o spread condicional em vez de `{ gate: result.gate, ... }`.
 */
export function toPaywallData(result: GuardResult): Pick<GuardResult, 'gate' | 'limit' | 'current'> {
  return {
    ...(result.gate !== undefined ? { gate: result.gate } : {}),
    ...(result.limit !== undefined ? { limit: result.limit } : {}),
    ...(result.current !== undefined ? { current: result.current } : {}),
  }
}

/**
 * Lança `TRPCError({ code: 'FORBIDDEN' })` quando `result.allowed` é falso —
 * chamar com o retorno de um `can*`/`has*` do core (`canCreateBet`,
 * `canQueryHistory` etc.) depois de resolver `ctx.getEntitlements()`. O
 * `cause` (`PaywallError`) carrega o `GuardResult` completo; o
 * `errorFormatter` acima expõe `gate`/`limit`/`current` em `shape.data.paywall`
 * para o `PaywallDialog` (docs/09 C6) no cliente.
 */
export function guardOrThrow(result: GuardResult): void {
  if (result.allowed) return
  const cause = new PaywallError(result)
  throw new TRPCError({ code: 'FORBIDDEN', message: cause.message, cause })
}

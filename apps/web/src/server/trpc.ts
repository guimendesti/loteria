/**
 * tRPC v11 — inicialização, contexto e procedures base.
 *
 * Contexto carrega a sessão do Better Auth (a partir dos headers da request
 * fetch) e o client Prisma de @lotopro/db. `protectedProcedure` é o único
 * lugar que decide "tem sessão ou não" — entitlements de plano (docs/06 §6.9)
 * entram depois, em cima disso, quando os routers de domínio existirem.
 */
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { prisma } from '@lotopro/db'
import { auth } from '@/lib/auth'
import { BetValidationError } from '@/server/errors'

export async function createTRPCContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers })

  return {
    prisma,
    session,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  /**
   * Expõe `ValidationError[]` do core (@lotopro/core `validateBet`) em
   * `shape.data.betValidationErrors` quando o erro carrega um `BetValidationError`
   * como `cause` — o cliente usa os `code`s para destacar campos do seletor de
   * dezenas (docs/08 CL-12), além da mensagem humana já em `shape.message`.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        betValidationErrors:
          error.cause instanceof BetValidationError ? error.cause.errors : null,
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
  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  })
})

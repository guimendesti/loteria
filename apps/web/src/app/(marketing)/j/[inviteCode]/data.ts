/**
 * Onda 8 — carregamento de dados do convite público de bolão (`/j/[inviteCode]`).
 *
 * Ao contrário de `(marketing)/resultados/[modalidade]/data.ts` e `.../conferir/.../data.ts`
 * (que leem `@lotopro/db` DIRETO — decisão documentada lá: "mais direto que ir e voltar por
 * HTTP"), aqui o pedido explícito do contrato desta tarefa é CONSUMIR `trpc.pool.joinPreview`
 * — o roteador `pool.ts` (território de outro agente, em paralelo) é quem decide o que é
 * seguro expor (cotas restantes, status, chave Pix mascarada — nunca a inteira, `inviteCode`
 * nunca no corpo) e essa regra não deve ser duplicada aqui.
 *
 * Sem um adaptador HTTP próprio: chamamos o procedure DIRETO via `appRouter.createCaller`
 * (padrão oficial do tRPC para Server Components — evita um round-trip de rede dentro do
 * próprio processo Next). `joinPreview` é `publicProcedure`, então o `Request` do contexto
 * não precisa de cookies/sessão real.
 *
 * ⚠️ `apps/web/src/server/routers/pool.ts` ainda não existe nesta onda (território do agente
 * "pool-api", em paralelo — ver `docs/contracts/onda8-bolao.md`). Até ele registrar `pool` em
 * `_app.ts`, `caller.pool` não existe e o typecheck deste arquivo falha — esperado, mesma
 * situação documentada em `apps/web/src/server/routers/_push-register.md` para outras ondas.
 */
import { cache } from 'react'
import { TRPCError } from '@trpc/server'
import type { inferRouterOutputs } from '@trpc/server'
import { appRouter, type AppRouter } from '@/server/routers/_app'
import { createTRPCContext } from '@/server/trpc'

export { resolveJoinState, type JoinState, type JoinPreviewStateInput } from './join-state'

type RouterOutputs = inferRouterOutputs<AppRouter>
/** Espelha `JoinPreview` de `docs/contracts/onda8-bolao.md` — inferido do router, não duplicado. */
export type JoinPreview = RouterOutputs['pool']['joinPreview']

async function getPublicCaller() {
  const ctx = await createTRPCContext({ req: new Request('http://localhost/trpc') })
  return appRouter.createCaller(ctx)
}

export type JoinPreviewOutcome =
  | { kind: 'found'; preview: JoinPreview }
  | { kind: 'not_found' }
  /** Banco fora do ar, erro inesperado etc. — nunca renderiza stack trace numa página pública. */
  | { kind: 'error' }

/** `cache()` deduplica entre `generateMetadata` e o corpo da página (mesmo padrão de LP-07/LP-08). */
export const getJoinPreview = cache(async function getJoinPreview(inviteCode: string): Promise<JoinPreviewOutcome> {
  try {
    const caller = await getPublicCaller()
    const preview = await caller.pool.joinPreview({ inviteCode })
    return { kind: 'found', preview }
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      return { kind: 'not_found' }
    }
    return { kind: 'error' }
  }
})

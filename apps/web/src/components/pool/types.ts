/**
 * Tipos derivados do contrato `pool.*` (docs/contracts/onda8-bolao.md), mesmo
 * padrão de apps/web/src/app/(app)/app/components/types.ts (bets): inferidos
 * do router tRPC para nunca redigitar os shapes de resposta.
 *
 * ⚠️ Onda 8 roda em paralelo (ver contrato): o router `pool` ainda não está
 * registrado em `@/server/routers/_app.ts` (dono: agente pool-api). Até o
 * orquestrador ligar o seam, os tipos abaixo falham no typecheck com
 * "Property 'pool' does not exist" — esperado, não é bug desta UI.
 */
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

export type RouterOutputs = inferRouterOutputs<AppRouter>

export type PoolCard = RouterOutputs['pool']['list'][number]
export type PoolDetail = RouterOutputs['pool']['detail']
export type PoolMemberRow = PoolDetail['members'][number]
export type JoinPreview = RouterOutputs['pool']['joinPreview']
export type PayoutRow = RouterOutputs['pool']['payout']['list'][number]

export type PoolListScope = 'organizing' | 'participating' | 'all'

/**
 * Enums do Prisma (packages/db/prisma/schema.prisma) espelhados à mão como
 * union de strings — de propósito NÃO importamos de `@lotopro/db` aqui: esse
 * pacote carrega o runtime do Prisma Client, que não deve entrar no bundle do
 * navegador (todo arquivo deste diretório é `use client`). Manter em sincronia
 * com o schema se os enums mudarem.
 */
export type PoolStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'BET_PLACED' | 'SETTLED' | 'CANCELED'
export type MemberStatus = 'INVITED' | 'JOINED' | 'PAID' | 'CONFIRMED' | 'REMOVED'
export type PaymentConfirmation = 'OWNER_MANUAL' | 'MEMBER_DECLARED'
export type PayoutStatus = 'PENDING' | 'DECLARED_PAID' | 'CONFIRMED'

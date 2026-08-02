/**
 * Tipos derivados do router tRPC — evita redigitar as formas de resposta de
 * `bets.list`/`bets.byId` nas telas de jogos (docs/08 §C.2).
 */
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'

export type RouterOutputs = inferRouterOutputs<AppRouter>

export type BetListItem = RouterOutputs['bets']['list']['items'][number]
export type BetDetail = RouterOutputs['bets']['byId']
export type BetCheckItem = BetListItem['checks'][number]

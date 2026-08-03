/**
 * Onda 8 — classificador PURO do estado de negócio de um convite de bolão. Vive num arquivo
 * à parte de `data.ts` DE PROPÓSITO: `data.ts` importa `appRouter`/`_app.ts` (a árvore
 * INTEIRA de routers, inclusive `admin/*`, que puxa o singleton real do Prisma de
 * `@lotopro/db`) — importar isso só para testar esta função exigiria mockar/derrubar todo
 * esse grafo. Mesma preocupação já documentada em
 * `apps/web/src/server/routers/__tests__/account.test.ts` (cabeçalho do arquivo: evitar o
 * caller real por causa do Prisma real por trás dele).
 *
 * Tipo de entrada é um subconjunto estrutural de `JoinPreview` (contrato em
 * `docs/contracts/onda8-bolao.md`) — não importa `data.ts` para não formar um ciclo, e não
 * precisa: só os 3 campos usados aqui.
 */

export type PoolStatusLike = 'DRAFT' | 'OPEN' | 'CLOSED' | 'BET_PLACED' | 'SETTLED' | 'CANCELED'

export interface JoinPreviewStateInput {
  status: PoolStatusLike
  expired: boolean
  sharesAvailable: number
}

/**
 * Cada valor (exceto `joinable`) tem tela própria em `page.tsx` — pedido no escopo: "casos de
 * borda precisam de tela própria, não de erro cru" (convite expirado, bolão lotado,
 * fechado/cancelado, rascunho ainda não publicado).
 */
export type JoinState = 'joinable' | 'expired' | 'full' | 'draft' | 'closed' | 'canceled'

/**
 * Ordem de checagem importa: `CANCELED`/`DRAFT` são mais específicos que o catch-all
 * `closed` (que cobre `CLOSED`/`BET_PLACED`/`SETTLED` — todos "não aceita mais entradas",
 * mas nenhum deles é cancelamento nem rascunho).
 */
export function resolveJoinState(preview: JoinPreviewStateInput): JoinState {
  if (preview.status === 'CANCELED') return 'canceled'
  if (preview.status === 'DRAFT') return 'draft'
  if (preview.expired) return 'expired'
  if (preview.status !== 'OPEN') return 'closed'
  if (preview.sharesAvailable <= 0) return 'full'
  return 'joinable'
}

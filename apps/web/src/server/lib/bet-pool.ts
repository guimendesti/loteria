/**
 * Validação do vínculo `Bet.poolId` <-> `Pool` (Onda 8b — território deste agente,
 * `docs/contracts/onda8-bolao.md`).
 *
 * O router `pool` (fora do território desta tarefa — outro agente é o dono de
 * `routers/pool.ts`/`server/lib/pool/**`) é quem administra o bolão em si; aqui só
 * LEMOS o suficiente de `Pool` para decidir se um vínculo pode ser criado/desfeito.
 * Este módulo nunca escreve em `Pool` — só devolve a decisão para quem chama
 * (`server/routers/bets.ts`), que é quem grava `Bet.poolId`.
 *
 * Regras (todas do enunciado da onda — nenhuma é negociável):
 * - Só o DONO do bolão vincula/desvincula jogos (participante não mexe).
 * - A aposta vinculada precisa ser do próprio dono do bolão — checado pelo
 *   chamador ANTES de chegar aqui (`bet.userId === ctx.session.user.id`), então
 *   quando este módulo confirma `pool.ownerId === userId` as duas pontas batem.
 * - Modalidade da aposta precisa ser a mesma do bolão.
 * - `bet.contestFrom..contestTo` precisa caber inteiramente dentro de
 *   `pool.contestFrom..contestTo`.
 * - Só é permitido mexer nos jogos em DRAFT/OPEN/CLOSED. A partir de BET_PLACED os
 *   jogos já foram registrados na lotérica e estão vinculados a dinheiro de
 *   participantes que já pagaram — CONGELADO. Erro claro em PT-BR.
 */
import { TRPCError } from '@trpc/server'
import { PoolStatus, type PrismaClient } from '@lotopro/db'

/** Estados em que o dono ainda pode mudar quais jogos pertencem ao bolão. */
export const EDITABLE_POOL_STATUSES: readonly PoolStatus[] = [PoolStatus.DRAFT, PoolStatus.OPEN, PoolStatus.CLOSED]

export interface PoolLinkTarget {
  id: string
  ownerId: string
  lotteryId: string
  contestFrom: number
  contestTo: number
  status: PoolStatus
  totalCostCents: bigint
}

const poolLinkSelect = {
  id: true,
  ownerId: true,
  lotteryId: true,
  contestFrom: true,
  contestTo: true,
  status: true,
  totalCostCents: true,
} as const

/** Carrega o bolão para fins de vínculo de jogo. `NOT_FOUND` se não existir. */
export async function loadPoolForLink(prisma: Pick<PrismaClient, 'pool'>, poolId: string): Promise<PoolLinkTarget> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId }, select: poolLinkSelect })
  if (!pool) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })
  }
  return pool
}

/** Só o organizador do bolão vincula/desvincula jogos — participante não mexe. */
export function assertPoolOwnedBy(pool: PoolLinkTarget, userId: string): void {
  if (pool.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Só o organizador do bolão pode vincular ou desvincular jogos.',
    })
  }
}

/**
 * A partir de `BET_PLACED` os jogos já foram registrados na lotérica e estão
 * vinculados ao dinheiro de participantes que já pagaram — congelado. Nunca pular
 * este aviso: é a garantia de que ninguém troca o jogo debaixo de quem já confirmou
 * o Pix da cota.
 */
export function assertPoolGamesEditable(pool: PoolLinkTarget): void {
  if (!EDITABLE_POOL_STATUSES.includes(pool.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Os jogos deste bolão já foram registrados na lotérica e estão vinculados ao dinheiro dos ' +
        'participantes — não é mais possível alterar quais jogos pertencem a ele.',
    })
  }
}

/** Modalidade e faixa de concursos da aposta precisam caber no bolão. */
export function assertBetMatchesPool(
  bet: { lotteryId: string; contestFrom: number; contestTo: number },
  pool: PoolLinkTarget,
): void {
  if (bet.lotteryId !== pool.lotteryId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A modalidade deste jogo não é a mesma do bolão selecionado.',
    })
  }
  if (bet.contestFrom < pool.contestFrom || bet.contestTo > pool.contestTo) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        `Este jogo vale para os concursos ${bet.contestFrom}–${bet.contestTo}, fora da faixa ` +
        `${pool.contestFrom}–${pool.contestTo} do bolão selecionado.`,
    })
  }
}

/** Composição: dono + ainda editável, num único carregamento — o caminho comum de `bets.ts`. */
export async function loadEditablePoolOwnedBy(
  prisma: Pick<PrismaClient, 'pool'>,
  poolId: string,
  userId: string,
): Promise<PoolLinkTarget> {
  const pool = await loadPoolForLink(prisma, poolId)
  assertPoolOwnedBy(pool, userId)
  assertPoolGamesEditable(pool)
  return pool
}

/**
 * Produtor de eventos para a fila `pool-notify` — consumida por
 * `apps/worker/src/jobs/pool-notify.ts` (9 testes já verdes em
 * `apps/worker/test/pool-notify.test.ts`). Este módulo só ENFILEIRA; quem decide
 * destinatário/texto/dedupe é o job do worker.
 *
 * Mesmo padrão de `server/routers/admin/config.ts` (seção "BO-41"): `apps/web` e
 * `apps/worker` são processos SEPARADOS (docs/06 §6.6) — não dá pra chamar o job
 * diretamente. Abrimos nossa PRÓPRIA `Queue` BullMQ apontando pro MESMO nome de fila que o
 * worker consome (`'pool-notify'`, `apps/worker/src/queues.ts` `QUEUE_NAMES.POOL_NOTIFY`
 * — não importável daqui, `apps/worker` não é um pacote; string literal copiada, mesma
 * restrição já documentada em `admin/config.ts`/`admin/bets.ts`). O formato do payload por
 * evento também é copiado de `apps/worker/src/jobs/pool-notify.ts`
 * (`poolNotifyJobSchema`/`PoolNotifyJobData`) — não precisa ser literalmente o mesmo tipo
 * importado, só bater na forma (contrato registrado em `_pool-notify-register.md`, já
 * apagado depois de aplicado).
 *
 * ⚠️ Diferença deliberada do padrão de `admin/config.ts`: lá, `getResyncQueue` LANÇA
 * `PRECONDITION_FAILED` quando `REDIS_URL` não está configurado — faz sentido lá porque
 * enfileirar o re-sync É o propósito inteiro daquela mutation (admin apertou um botão
 * "re-sincronizar"; se não dá pra enfileirar, a ação falhou de verdade). Aqui é o oposto:
 * notificar é um EFEITO COLATERAL de mutations cujo propósito real (gravar dinheiro/estado
 * do bolão) já foi cumprido com sucesso ANTES desta função ser chamada. `enqueuePoolNotify`
 * portanto NUNCA lança — falha de Redis (fora do ar, `REDIS_URL` ausente, erro de rede) é
 * logada e ignorada. A notificação é "nice to have"; a mutation não pode morrer por causa
 * dela (pedido explícito do escopo desta tarefa).
 */
import { Queue } from 'bullmq'
import Redis from 'ioredis'

const POOL_NOTIFY_QUEUE_NAME = 'pool-notify'

export type PoolNotifyJobPayload =
  | { event: 'member.joined'; poolId: string; poolMemberId: string }
  | { event: 'payment.declared'; poolId: string; poolMemberId: string; poolPaymentId: string }
  | { event: 'payment.confirmed'; poolId: string; poolMemberId: string; poolPaymentId: string }
  | { event: 'receipt.attached'; poolId: string; attachedAt: string }
  | { event: 'payout.computed'; poolId: string; contestId: string }

// Mesmo padrão de singleton por processo de `admin/config.ts#getResyncQueue` (campo em
// `globalThis`, tipado `T | undefined` — não `?:` — por causa de `exactOptionalPropertyTypes`).
const globalForPoolNotifyQueue = globalThis as unknown as {
  lotoproPoolNotifyQueue: Queue<PoolNotifyJobPayload> | undefined
}

async function getPoolNotifyQueue(): Promise<Queue<PoolNotifyJobPayload> | null> {
  if (globalForPoolNotifyQueue.lotoproPoolNotifyQueue) return globalForPoolNotifyQueue.lotoproPoolNotifyQueue

  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) {
    console.warn('[pool-notify] REDIS_URL não configurado — evento de notificação não enfileirado.')
    return null
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
  await connection.connect()
  const queue = new Queue<PoolNotifyJobPayload>(POOL_NOTIFY_QUEUE_NAME, { connection })
  globalForPoolNotifyQueue.lotoproPoolNotifyQueue = queue
  return queue
}

/**
 * Enfileira um evento de notificação de bolão. Chame SEMPRE depois do commit da mutation
 * correspondente (nunca de dentro de `prisma.$transaction` — é uma chamada de rede à
 * parte). Idempotência do lado do worker (BullMQ `jobId` natural + `Notification.dedupeKey`)
 * — nada a fazer aqui, não geramos `jobId` nenhum.
 *
 * Nunca lança: qualquer falha (Redis fora do ar, `REDIS_URL` ausente, timeout) é logada e
 * engolida. O chamador (`server/routers/pool.ts`) ainda assim envolve a chamada num
 * `try/catch` próprio — defesa em profundidade, não confiar só nesta função nunca lançar.
 */
export async function enqueuePoolNotify(payload: PoolNotifyJobPayload): Promise<void> {
  try {
    const queue = await getPoolNotifyQueue()
    if (!queue) return
    await queue.add(POOL_NOTIFY_QUEUE_NAME, payload)
  } catch (error) {
    console.error('[pool-notify] falha ao enfileirar evento — mutation já concluída, seguindo.', {
      event: payload.event,
      poolId: payload.poolId,
      error,
    })
  }
}

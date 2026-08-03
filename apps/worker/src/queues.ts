/**
 * Definição tipada das filas BullMQ do worker LotoPro (docs/06 §6.6/§6.7, docs/08 parte E).
 *
 * Quatro filas:
 *  - `sync-results`      (SY-01): varre a Caixa por modalidade e persiste concursos novos.
 *  - `check-bets`        (SY-03): confere apostas ativas contra um concurso recém-persistido.
 *  - `notify`            (SY-04): envia/grava notificação (IN_APP sempre; e-mail/push
 *    conforme preferência, plano e horário de silêncio — ver `jobs/notify.ts`).
 *  - `accumulated-alert` (SY-10): varre concursos acumulados 1x/hora e enfileira `notify`
 *    para quem configurou um limiar — ver `jobs/accumulated-alert.ts`.
 *  - `pool-notify`        (Onda 8): traduz eventos de domínio do bolão (membro entrou,
 *    pagamento declarado/confirmado, comprovante anexado, rateio calculado) em jobs `notify`
 *    para os destinatários certos — ver `jobs/pool-notify.ts`.
 *
 * Cada payload tem um schema Zod exportado — os jobs fazem `schema.parse(job.data)` antes
 * de processar, então um payload corrompido falha cedo e com mensagem clara em vez de
 * quebrar no meio do processamento.
 */
import { z } from 'zod'
import Redis from 'ioredis'
import { Queue } from 'bullmq'
import { ALL_LOTTERIES, type LotterySlug } from '@lotopro/core'
import type { WorkerConfig } from './config'
import type { PoolNotifyJobData } from './jobs/pool-notify'

// ─── Slug de modalidade como enum Zod ────────────────────────────────────────
// `LotterySlug` é um union type puro em @lotopro/core (sem schema Zod companion).
// Derivamos o enum do catálogo estático (`ALL_LOTTERIES`) para não duplicar a lista de
// modalidades aqui — se um slug for adicionado/removido em core, este enum acompanha.

function lotterySlugTuple(): [LotterySlug, ...LotterySlug[]] {
  const [first, ...rest] = ALL_LOTTERIES.map((config) => config.slug)
  if (first === undefined) {
    throw new Error('ALL_LOTTERIES está vazio — impossível derivar o enum de LotterySlug')
  }
  return [first, ...rest]
}

export const lotterySlugSchema = z.enum(lotterySlugTuple())

// ─── Nomes das filas ──────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  SYNC_RESULTS: 'sync-results',
  CHECK_BETS: 'check-bets',
  NOTIFY: 'notify',
  ACCUMULATED_ALERT: 'accumulated-alert',
  BILLING_DUNNING: 'billing-dunning',
  POOL_NOTIFY: 'pool-notify',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

// ─── Payloads ──────────────────────────────────────────────────────────────

/**
 * Job da fila `sync-results`. `lotterySlugs`, quando presente, restringe a corrida a essas
 * modalidades (usado pelo gate de janela quente/fria do scheduler — ver `src/scheduler.ts`);
 * ausente = sincroniza todas as modalidades ativas (uso administrativo/manual).
 */
export const syncResultsJobSchema = z.object({
  triggeredAt: z.string().datetime(),
  reason: z.enum(['schedule', 'manual']).default('schedule'),
  lotterySlugs: z.array(lotterySlugSchema).optional(),
})
export type SyncResultsJobData = z.infer<typeof syncResultsJobSchema>

/** Job da fila `check-bets`, emitido por `sync-results` quando um concurso novo é persistido. */
export const checkBetsJobSchema = z.object({
  lotterySlug: lotterySlugSchema,
  contestNumber: z.number().int().positive(),
})
export type CheckBetsJobData = z.infer<typeof checkBetsJobSchema>

/**
 * Job da fila `notify` (SY-04). `title`/`body` são o fallback usado pela notificação
 * IN_APP e por e-mail quando o `type` não tem template dedicado em
 * `@lotopro/integrations` (`notify/templates.ts`) ou o `payload` não traz os campos que o
 * template específico exige — ver `apps/worker/src/jobs/notify.ts` `buildEmailContent`.
 *
 * `payload` é livre (schema por `type` fica em `notify/types.ts`), mas os campos
 * `lotterySlug`/`contestNumber`, quando presentes, também alimentam a `dedupeKey` de
 * idempotência (ver `jobs/notify.ts`).
 */
export const notifyJobSchema = z.object({
  userId: z.string().min(1),
  /** ex.: "bet.prized" | "bet.checked" | "contest.accumulated" — livre, vira `Notification.type`. */
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
})
export type NotifyJobData = z.infer<typeof notifyJobSchema>

/** Job (repetível, 1x/hora) da fila `accumulated-alert` (SY-10) — ver `jobs/accumulated-alert.ts`. */
export const accumulatedAlertJobSchema = z.object({
  triggeredAt: z.string().datetime(),
})
export type AccumulatedAlertJobData = z.infer<typeof accumulatedAlertJobSchema>

// ─── Conexão Redis ────────────────────────────────────────────────────────────

/**
 * Conexão ioredis dedicada para BullMQ. `maxRetriesPerRequest: null` é exigido pelo BullMQ
 * para comandos bloqueantes (BRPOPLPUSH etc. usados internamente pelo Worker) — sem isso,
 * o cliente desiste de comandos bloqueantes após N tentativas e o worker trava
 * silenciosamente. `lazyConnect: true` para o `.connect()` ser explícito no bootstrap
 * (permite falhar alto e cedo em vez de conectar no import).
 */
export function createRedisConnection(config: Pick<WorkerConfig, 'REDIS_URL'>): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
}

// ─── Filas ────────────────────────────────────────────────────────────────────

/** SY-09 — payload do job diário de dunning (ver jobs/billing-dunning.ts). */
export interface BillingDunningJobData {
  triggeredAt: string
}

export interface Queues {
  syncResults: Queue<SyncResultsJobData>
  checkBets: Queue<CheckBetsJobData>
  notify: Queue<NotifyJobData>
  accumulatedAlert: Queue<AccumulatedAlertJobData>
  billingDunning: Queue<BillingDunningJobData>
  poolNotify: Queue<PoolNotifyJobData>
}

export function createQueues(connection: Redis): Queues {
  return {
    syncResults: new Queue<SyncResultsJobData>(QUEUE_NAMES.SYNC_RESULTS, { connection }),
    checkBets: new Queue<CheckBetsJobData>(QUEUE_NAMES.CHECK_BETS, { connection }),
    notify: new Queue<NotifyJobData>(QUEUE_NAMES.NOTIFY, { connection }),
    accumulatedAlert: new Queue<AccumulatedAlertJobData>(QUEUE_NAMES.ACCUMULATED_ALERT, { connection }),
    billingDunning: new Queue<BillingDunningJobData>(QUEUE_NAMES.BILLING_DUNNING, { connection }),
    poolNotify: new Queue<PoolNotifyJobData>(QUEUE_NAMES.POOL_NOTIFY, { connection }),
  }
}

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all([
    queues.syncResults.close(),
    queues.checkBets.close(),
    queues.notify.close(),
    queues.accumulatedAlert.close(),
    queues.billingDunning.close(),
    queues.poolNotify.close(),
  ])
}

/**
 * Bootstrap do worker LotoPro: valida config, instancia as 4 filas/workers (SY-01/03/04/10),
 * registra os schedulers (SY-01 janela dinâmica; SY-10 repetível 1x/hora), sobe o
 * healthcheck (SY-14) e faz shutdown gracioso em SIGTERM/SIGINT.
 */
import { Worker } from 'bullmq'
import { PrismaClient } from '@lotopro/db'
import {
  AsaasClient,
  CaixaOfficialProvider,
  ResilientResultProvider,
  ResendEmailSender,
  NoopPushSender,
  WebPushSender,
  type PushSender,
} from '@lotopro/integrations'
import { loadConfig, ConfigError, type WorkerConfig } from './config'
import { createRedisConnection, createQueues, closeQueues, QUEUE_NAMES, type Queues } from './queues'
import { createLogger, type Logger } from './lib/logger'
import {
  createSyncResultsPrismaAdapter,
  createCheckBetsPrismaAdapter,
  createNotifyPrismaAdapter,
  createAccumulatedAlertPrismaAdapter,
} from './lib/prisma-adapters'
import { createSyncResultsJob } from './jobs/sync-results'
import { createCheckBetsJob } from './jobs/check-bets'
import { createNotifyJob } from './jobs/notify'
import { createAccumulatedAlertJob, registerAccumulatedAlertSchedule } from './jobs/accumulated-alert'
import {
  createBillingDunningJob,
  createBillingDunningPrismaAdapter,
  registerBillingDunningSchedule,
} from './jobs/billing-dunning'
import { createSyncWindowGate, registerSyncSchedule, createGatedSyncProcessor } from './scheduler'
import { createHealthServer } from './health'
import type Redis from 'ioredis'

const rootLogger = createLogger('worker')

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit(rootLogger)
  if (!config) return

  rootLogger.info('worker.boot', { syncEnabled: config.SYNC_ENABLED, nodeEnv: config.NODE_ENV })

  const prisma = new PrismaClient()
  const connection = createRedisConnection(config)
  await connection.connect()
  const queues = createQueues(connection)

  const provider = new ResilientResultProvider(new CaixaOfficialProvider(), [], {
    logger: (event) => rootLogger.info('provider.event', { event }),
  })

  const runSyncResults = createSyncResultsJob({
    prisma: createSyncResultsPrismaAdapter(prisma),
    provider,
    checkBetsQueue: queues.checkBets,
    logger: createLogger('sync-results'),
  })

  const runCheckBets = createCheckBetsJob({
    prisma: createCheckBetsPrismaAdapter(prisma),
    notifyQueue: queues.notify,
    logger: createLogger('check-bets'),
  })

  const runNotify = createNotifyJob({
    prisma: createNotifyPrismaAdapter(prisma),
    emailSender: new ResendEmailSender({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM }),
    pushSender: createPushSender(config),
    logger: createLogger('notify'),
  })

  const runAccumulatedAlert = createAccumulatedAlertJob({
    prisma: createAccumulatedAlertPrismaAdapter(prisma),
    notifyQueue: queues.notify,
    logger: createLogger('accumulated-alert'),
  })

  const gate = createSyncWindowGate({ redis: connection })
  const schedulerLogger = createLogger('scheduler')
  const gatedSync = createGatedSyncProcessor(gate, (slugs) => runSyncResults(slugs), schedulerLogger)

  const workers = [
    new Worker(QUEUE_NAMES.SYNC_RESULTS, () => gatedSync(), { connection, concurrency: 1 }),
    new Worker(QUEUE_NAMES.CHECK_BETS, (job) => runCheckBets(job.data), { connection, concurrency: 4 }),
    new Worker(QUEUE_NAMES.NOTIFY, (job) => runNotify(job.data), { connection, concurrency: 8 }),
    new Worker(QUEUE_NAMES.ACCUMULATED_ALERT, (job) => runAccumulatedAlert(job.data), { connection, concurrency: 1 }),
  ]

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      rootLogger.error('worker.job.failed', { queue: worker.name, jobId: job?.id, error })
    })
  }

  if (config.SYNC_ENABLED) {
    await registerSyncSchedule(queues.syncResults)
    rootLogger.info('scheduler.registered', {})
  } else {
    rootLogger.warn('scheduler.disabled', { reason: 'SYNC_ENABLED=false' })
  }

  // SY-10 — repetível 1x/hora, sempre registrado (não depende de SYNC_ENABLED: não chama a
  // Caixa, só lê o banco local — ver docs/08 SY-10 e jobs/accumulated-alert.ts).
  await registerAccumulatedAlertSchedule(queues.accumulatedAlert)
  rootLogger.info('accumulated-alert.scheduler.registered', {})

  // SY-09 — dunning diário. Só com ASAAS_API_KEY (dev sem conta Asaas roda sem billing).
  if (config.ASAAS_API_KEY) {
    const runBillingDunning = createBillingDunningJob({
      prisma: createBillingDunningPrismaAdapter(prisma),
      notifyQueue: queues.notify,
      gateway: new AsaasClient({ apiKey: config.ASAAS_API_KEY }),
      logger: createLogger('billing-dunning'),
    })
    const dunningWorker = new Worker(QUEUE_NAMES.BILLING_DUNNING, () => runBillingDunning(), {
      connection,
      concurrency: 1,
    })
    // O loop de handlers 'failed' acima roda antes deste bloco — anexar manualmente.
    dunningWorker.on('failed', (job, error) => {
      rootLogger.error('worker.job.failed', { queue: dunningWorker.name, jobId: job?.id, error })
    })
    workers.push(dunningWorker)
    await registerBillingDunningSchedule(queues.billingDunning)
    rootLogger.info('billing-dunning.scheduler.registered', {})
  } else {
    rootLogger.warn('billing-dunning.disabled', { reason: 'ASAAS_API_KEY ausente' })
  }

  const healthServer = createHealthServer({
    redis: connection,
    gate,
    port: config.HEALTH_PORT,
    logger: createLogger('health'),
  })

  registerShutdown({ rootLogger, workers, queues, connection, healthServer, prisma })
}

function loadConfigOrExit(logger: Logger): WorkerConfig | undefined {
  try {
    return loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error('config.invalid', { error })
    } else {
      logger.error('config.invalid.unexpected', { error })
    }
    process.exitCode = 1
    return undefined
  }
}

interface ShutdownDeps {
  rootLogger: Logger
  workers: Worker[]
  queues: Queues
  connection: Redis
  healthServer: { close: () => void }
  prisma: PrismaClient
}

function registerShutdown(deps: ShutdownDeps): void {
  let shuttingDown = false

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    deps.rootLogger.info('worker.shutdown.start', { signal })

    deps.healthServer.close()
    await Promise.all(deps.workers.map((worker) => worker.close()))
    await closeQueues(deps.queues)
    await deps.connection.quit()
    await deps.prisma.$disconnect()

    deps.rootLogger.info('worker.shutdown.done', {})
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

bootstrap().catch((error: unknown) => {
  rootLogger.error('worker.boot.failed', { error })
  process.exitCode = 1
})

/**
 * SY-04 — escolhe o sender de push: WebPushSender real quando as três envs VAPID
 * existem; NoopPushSender caso contrário (dev sem chaves). Chaves: ver ORQUESTRACAO.md.
 */
function createPushSender(config: WorkerConfig): PushSender {
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT) {
    return new WebPushSender({
      vapidPublicKey: config.VAPID_PUBLIC_KEY,
      vapidPrivateKey: config.VAPID_PRIVATE_KEY,
      subject: config.VAPID_SUBJECT,
    })
  }
  rootLogger.warn('push.disabled', { reason: 'VAPID_* ausentes — usando NoopPushSender' })
  return new NoopPushSender()
}

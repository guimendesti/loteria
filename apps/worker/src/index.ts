/**
 * Bootstrap do worker LotoPro: valida config, instancia as 3 filas/workers (SY-01/03/04),
 * registra o scheduler (SY-01 janela dinâmica), sobe o healthcheck (SY-14) e faz shutdown
 * gracioso em SIGTERM/SIGINT.
 */
import { Worker } from 'bullmq'
import { PrismaClient } from '@lotopro/db'
import { CaixaOfficialProvider, ResilientResultProvider } from '@lotopro/integrations'
import { loadConfig, ConfigError, type WorkerConfig } from './config'
import { createRedisConnection, createQueues, closeQueues, QUEUE_NAMES, type Queues } from './queues'
import { createLogger, type Logger } from './lib/logger'
import {
  createSyncResultsPrismaAdapter,
  createCheckBetsPrismaAdapter,
  createNotifyPrismaAdapter,
} from './lib/prisma-adapters'
import { createSyncResultsJob } from './jobs/sync-results'
import { createCheckBetsJob } from './jobs/check-bets'
import { createNotifyJob } from './jobs/notify'
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
    logger: createLogger('notify'),
  })

  const gate = createSyncWindowGate({ redis: connection })
  const schedulerLogger = createLogger('scheduler')
  const gatedSync = createGatedSyncProcessor(gate, (slugs) => runSyncResults(slugs), schedulerLogger)

  const workers = [
    new Worker(QUEUE_NAMES.SYNC_RESULTS, () => gatedSync(), { connection, concurrency: 1 }),
    new Worker(QUEUE_NAMES.CHECK_BETS, (job) => runCheckBets(job.data), { connection, concurrency: 4 }),
    new Worker(QUEUE_NAMES.NOTIFY, (job) => runNotify(job.data), { connection, concurrency: 8 }),
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

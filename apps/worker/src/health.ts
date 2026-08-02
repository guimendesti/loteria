/**
 * SY-14 — healthcheck HTTP nativo (sem framework) na porta `HEALTH_PORT` (default 3001).
 * `GET /health` → `{ status, redis, lastSyncAt }`, onde `lastSyncAt` é o último horário em
 * que cada modalidade foi de fato sincronizada (lido do gate de janela — `src/scheduler.ts`,
 * que já guarda isso no Redis por modalidade).
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import type { LotterySlug } from '@lotopro/core'
import type { Logger } from './lib/logger'

export interface HealthRedis {
  ping(): Promise<string>
}

export interface HealthGate {
  lastRunAll(): Promise<Record<LotterySlug, string | null>>
}

export interface HealthPayload {
  status: 'ok' | 'degraded'
  redis: boolean
  lastSyncAt: Record<string, string | null>
}

export interface HealthDeps {
  redis: HealthRedis
  gate: HealthGate
  port: number
  logger?: Logger
}

async function pingRedis(redis: HealthRedis): Promise<boolean> {
  try {
    const reply = await redis.ping()
    return reply === 'PONG'
  } catch {
    return false
  }
}

export async function buildHealthPayload(deps: Pick<HealthDeps, 'redis' | 'gate'>): Promise<HealthPayload> {
  const redisOk = await pingRedis(deps.redis)
  const lastSyncAt = await deps.gate.lastRunAll()
  return { status: redisOk ? 'ok' : 'degraded', redis: redisOk, lastSyncAt }
}

function handleRequest(deps: HealthDeps, req: IncomingMessage, res: ServerResponse): void {
  if (req.url !== '/health') {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  buildHealthPayload(deps)
    .then((payload) => {
      res.writeHead(payload.redis ? 200 : 503, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
    .catch((error: unknown) => {
      deps.logger?.error('health.failed', { error })
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'health check failed' }))
    })
}

export function createHealthServer(deps: HealthDeps): Server {
  const server = createServer((req, res) => handleRequest(deps, req, res))
  server.listen(deps.port)
  deps.logger?.info('health.listening', { port: deps.port })
  return server
}

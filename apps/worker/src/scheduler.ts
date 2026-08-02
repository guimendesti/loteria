/**
 * SY-01 — janelas dinâmicas de sincronização (docs/06 §6.6):
 *
 *   | Janela                          | Frequência   |
 *   |----------------------------------|--------------|
 *   | Dias de sorteio, 20:50–23:00     | a cada 5 min |
 *   | Domingos, 10:40–13:00            | a cada 5 min |
 *   | Demais horários                  | a cada 1 hora|
 *
 * O job repetível do BullMQ dispara a cada 5 min SEMPRE (timer burro, registrado uma vez
 * em `registerSyncSchedule`). É o HANDLER (`createGatedSyncProcessor`) que decide, a cada
 * disparo, quais modalidades de fato merecem uma chamada à Caixa: as que estão na janela
 * quente entram sempre; as demais só entram se fizer >= 1h desde a última tentativa
 * (guardada por modalidade no Redis). Isso implementa o rate limit do doc 06 §6.6
 * ("1 req/modalidade/min na janela de sorteio; 1/h fora dela") sem exigir N crons diferentes.
 */
import type { Queue } from 'bullmq'
import { ALL_LOTTERIES, type DrawSchedule, type LotteryConfig, type LotterySlug } from '@lotopro/core'
import type { SyncResultsJobData } from './queues'
import { getSaoPauloParts } from './lib/timezone'
import type { Logger } from './lib/logger'

// ─── Janela quente (função pura, testada com datas fixas) ────────────────────

interface ClockWindow {
  startMinutes: number
  endMinutes: number
}

function clockWindow(startHour: number, startMinute: number, endHour: number, endMinute: number): ClockWindow {
  return { startMinutes: startHour * 60 + startMinute, endMinutes: endHour * 60 + endMinute }
}

/** 20:50–23:00 — cobre o horário de sorteio de todas as modalidades (19:00–20:00 + apuração). */
const EVENING_DRAW_WINDOW = clockWindow(20, 50, 23, 0)
/** 10:40–13:00 aos domingos — apuração de resultados que fecham no fim de semana (ex.: Loteca). */
const SUNDAY_WINDOW = clockWindow(10, 40, 13, 0)
const SUNDAY = 0

function withinClock(minutesOfDay: number, window: ClockWindow): boolean {
  return minutesOfDay >= window.startMinutes && minutesOfDay <= window.endMinutes
}

/**
 * `true` se `date` (instante UTC) cai na janela quente da modalidade, em horário local de
 * America/Sao_Paulo. Pura — sem I/O — para ser testável com datas fixas (item 9 do escopo).
 */
export function isWithinHotWindow(date: Date, schedule: DrawSchedule): boolean {
  const { weekday, hour, minute } = getSaoPauloParts(date)
  const minutesOfDay = hour * 60 + minute

  if (schedule.days.includes(weekday) && withinClock(minutesOfDay, EVENING_DRAW_WINDOW)) return true
  if (weekday === SUNDAY && withinClock(minutesOfDay, SUNDAY_WINDOW)) return true
  return false
}

// ─── Seleção de modalidades due neste tick ────────────────────────────────────

export const COLD_WINDOW_MIN_INTERVAL_MS = 60 * 60 * 1000

export type LastRunLookup = (slug: LotterySlug) => Date | null

/**
 * Decide quais modalidades devem sincronizar agora. Pura — quem chama injeta `lastRun`
 * (em produção, lida do Redis por `createSyncWindowGate`; em teste, de um `Map` em memória).
 */
export function selectDueLotteries(
  now: Date,
  lotteries: readonly LotteryConfig[],
  lastRun: LastRunLookup,
  minColdIntervalMs: number = COLD_WINDOW_MIN_INTERVAL_MS,
): LotterySlug[] {
  const due: LotterySlug[] = []
  for (const config of lotteries) {
    if (isWithinHotWindow(now, config.drawSchedule)) {
      due.push(config.slug)
      continue
    }
    const last = lastRun(config.slug)
    if (last === null || now.getTime() - last.getTime() >= minColdIntervalMs) {
      due.push(config.slug)
    }
  }
  return due
}

// ─── Gate com estado em Redis (lastRun por modalidade) ────────────────────────

/** Assinatura mínima do ioredis usada aqui — troque por um duplo em teste sem tocar Redis. */
export interface SchedulerRedis {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
}

const LAST_RUN_KEY_PREFIX = 'lotopro:worker:sync:last-run:'

export interface SyncWindowGate {
  /** Modalidades due agora (janela quente sempre; fria só se >= 1h desde o último run). */
  selectDue(at?: Date): Promise<LotterySlug[]>
  /** Registra que as modalidades listadas acabaram de rodar (marca `lastRun`). */
  markRun(slugs: readonly LotterySlug[], at?: Date): Promise<void>
  /** Snapshot de `lastRun` por modalidade — usado pelo healthcheck (SY-14). */
  lastRunAll(): Promise<Record<LotterySlug, string | null>>
}

export interface CreateSyncWindowGateOptions {
  redis: SchedulerRedis
  now?: () => Date
  /** Fonte estática das modalidades (decisão temporária — ver `jobs/sync-results.ts`). */
  lotteries?: readonly LotteryConfig[]
}

export function createSyncWindowGate(options: CreateSyncWindowGateOptions): SyncWindowGate {
  const { redis } = options
  const now = options.now ?? (() => new Date())
  const lotteries = options.lotteries ?? ALL_LOTTERIES

  async function getLastRun(slug: LotterySlug): Promise<Date | null> {
    const raw = await redis.get(LAST_RUN_KEY_PREFIX + slug)
    if (raw === null) return null
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return {
    async selectDue(at = now()) {
      const entries = await Promise.all(
        lotteries.map(async (config) => [config.slug, await getLastRun(config.slug)] as const),
      )
      const lastRunBySlug = new Map(entries)
      return selectDueLotteries(at, lotteries, (slug) => lastRunBySlug.get(slug) ?? null)
    },
    async markRun(slugs, at = now()) {
      const iso = at.toISOString()
      await Promise.all(slugs.map((slug) => redis.set(LAST_RUN_KEY_PREFIX + slug, iso)))
    },
    async lastRunAll() {
      const entries = await Promise.all(
        lotteries.map(async (config) => [config.slug, (await getLastRun(config.slug))?.toISOString() ?? null] as const),
      )
      return Object.fromEntries(entries) as Record<LotterySlug, string | null>
    },
  }
}

// ─── Registro do job repetível ────────────────────────────────────────────────

export const SYNC_SCHEDULER_ID = 'sync-results-5min'
export const SYNC_TICK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Registra (ou atualiza — `upsertJobScheduler` é idempotente) o job repetível que dispara
 * a cada 5 min. `job.data` aqui é só metadado informativo de log: a decisão real de "rodar
 * ou não" acontece dentro do processor (`createGatedSyncProcessor`), não no template do job.
 */
export async function registerSyncSchedule(
  queue: Pick<Queue<SyncResultsJobData>, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    SYNC_SCHEDULER_ID,
    { every: SYNC_TICK_INTERVAL_MS },
    { name: 'sync-results', data: { triggeredAt: new Date().toISOString(), reason: 'schedule' } },
  )
}

// ─── Wrapper do processor com a decisão de janela ─────────────────────────────

export type GatedSyncRunner = (lotterySlugs: LotterySlug[]) => Promise<unknown>

/**
 * Envolve a lógica de sync (`createSyncResultsJob` de `jobs/sync-results.ts`) com o gate de
 * janela quente/fria. Cada disparo do job repetível passa por aqui antes de chamar a Caixa.
 */
export function createGatedSyncProcessor(
  gate: SyncWindowGate,
  runSync: GatedSyncRunner,
  logger?: Logger,
): () => Promise<{ due: LotterySlug[] }> {
  return async function gatedSync() {
    const due = await gate.selectDue()
    if (due.length === 0) {
      logger?.debug('scheduler.tick.skip', { reason: 'nenhuma modalidade due neste tick' })
      return { due: [] }
    }
    logger?.info('scheduler.tick.due', { lotteries: due })
    await runSync(due)
    await gate.markRun(due)
    return { due }
  }
}

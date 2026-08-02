/**
 * SY-01 — janelas dinâmicas de sincronização (docs/06 §6.6):
 *
 *   | Janela                                     | Frequência   |
 *   |--------------------------------------------|--------------|
 *   | Sorteio da modalidade − 10 min … + 2 h     | a cada 5 min |
 *   | Demais horários                            | a cada 1 hora|
 *
 * O job repetível do BullMQ dispara a cada 5 min SEMPRE (timer burro, registrado uma vez
 * em `registerSyncSchedule`). É o HANDLER (`createGatedSyncProcessor`) que decide, a cada
 * disparo, quais modalidades de fato merecem uma chamada à Caixa: as que estão na janela
 * quente entram sempre; as demais só entram se fizer >= 1h desde a última tentativa
 * (guardada por modalidade no Redis). Isso implementa o rate limit do doc 06 §6.6
 * ("1 req/modalidade/min na janela de sorteio; 1/h fora dela") sem exigir N crons diferentes.
 *
 * ── v2: a janela sai do DADO, não de constantes ──────────────────────────────────────────
 *
 * A v1 tinha duas faixas fixas de relógio (20:50–23:00 em dia de sorteio + 10:40–13:00 aos
 * domingos para todo mundo). Com `DrawSchedule.entries` trazendo `{day, time}` POR DIA — e
 * com sete modalidades sorteando domingo às 11h e no meio da semana às 20h —, a janela passa
 * a ser DERIVADA de cada entrada da agenda: do horário do sorteio menos 10 min até 2h depois.
 * Modalidade continua sendo dado (CLAUDE.md §6): nenhum horário fica hardcoded aqui.
 */
import type { Queue } from 'bullmq'
import {
  ALL_LOTTERIES,
  type DrawSchedule,
  type DrawScheduleEntry,
  type LotteryConfig,
  type LotterySlug,
} from '@lotopro/core'
import type { SyncResultsJobData } from './queues'
import { getSaoPauloParts } from './lib/timezone'
import type { Logger } from './lib/logger'

// ─── Janela quente (função pura, testada com datas fixas) ────────────────────

/** Abre 10 min ANTES do sorteio (a Caixa às vezes publica adiantado). */
export const HOT_WINDOW_BEFORE_MINUTES = 10
/** Fecha 2h DEPOIS: cobre atraso de apuração e republicação do rateio. */
export const HOT_WINDOW_AFTER_MINUTES = 120

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

/** "HH:mm" → minutos desde a meia-noite. `null` quando o horário é inválido. */
function parseTimeOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (match === null) return null
  const hour = Number.parseInt(match[1] ?? '', 10)
  const minute = Number.parseInt(match[2] ?? '', 10)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * `true` se o instante (expresso em "minutos desde a meia-noite de domingo", horário local)
 * cai na janela quente desta entrada da agenda.
 *
 * A conta é feita em minutos-da-semana e fechada em módulo 7 dias, o que resolve de graça os
 * dois casos de borda: janela que atravessa a meia-noite (sorteio às 23:30 + 2h) e janela que
 * atravessa a virada da semana (sorteio no domingo 00:05 → começa no sábado 23:55).
 */
function entryCoversWeekMinute(entry: DrawScheduleEntry, weekMinute: number): boolean {
  const drawMinute = parseTimeOfDay(entry.time)
  if (drawMinute === null) return false

  const start = entry.day * MINUTES_PER_DAY + drawMinute - HOT_WINDOW_BEFORE_MINUTES
  const length = HOT_WINDOW_BEFORE_MINUTES + HOT_WINDOW_AFTER_MINUTES
  const elapsed = (((weekMinute - start) % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK
  return elapsed <= length // bordas inclusivas nas duas pontas
}

/**
 * `true` se `date` (instante UTC) cai na janela quente da modalidade, em horário local de
 * America/Sao_Paulo. Pura — sem I/O — para ser testável com datas fixas (item 9 do escopo).
 */
export function isWithinHotWindow(date: Date, schedule: DrawSchedule): boolean {
  const { weekday, hour, minute } = getSaoPauloParts(date)
  const weekMinute = weekday * MINUTES_PER_DAY + hour * 60 + minute
  return schedule.entries.some((entry) => entryCoversWeekMinute(entry, weekMinute))
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

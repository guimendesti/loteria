/**
 * SY-10 — accumulated-alert: varre, por modalidade ATIVA, o concurso mais recente e, se
 * ele estiver acumulado (`isAccumulated`) com uma estimativa de próximo prêmio conhecida
 * (`estimatedNextCents`), enfileira `notify` (`type: "contest.accumulated"`) para todo
 * usuário cujo `NotificationPreference.accumulatedThresholdCents` esteja definido e seja
 * `<= estimatedNextCents`.
 *
 * Repetível, 1x/hora (`registerAccumulatedAlertSchedule`, chamado no bootstrap —
 * `src/index.ts`). "A janela fina não importa aqui" (pedido no escopo): rodar de hora em
 * hora é suficiente, não há necessidade de alinhar com o instante exato em que a Caixa
 * publica a estimativa.
 *
 * ── Por que reenfileirar toda hora não gera spam ──────────────────────────────────────
 *
 * Este job NÃO controla idempotência sozinho — ele pode (e vai) enfileirar o MESMO
 * `(usuário, modalidade, concurso)` a cada execução enquanto o concurso seguir acumulado
 * com o mesmo limiar batendo. Quem garante "1 notificação por (usuário, lottery, contest)"
 * (pedido no escopo, item 4/P4) é a `dedupeKey` de `jobs/notify.ts`: a partir da segunda
 * execução, o `notify` job correspondente vira um no-op barato (um `findFirst` que já
 * acha a linha e retorna, sem reenviar e-mail/push). Reenfileirar é intencionalmente
 * simples aqui — a deduplicação real mora num lugar só.
 */
import { z } from 'zod'
import { getLotteryConfig, type DrawSchedule, type LotterySlug } from '@lotopro/core'
import { formatMillionsBRL } from '@lotopro/integrations'
import { accumulatedAlertJobSchema, type AccumulatedAlertJobData, type NotifyJobData } from '../queues'
import { parseTimeOfDay } from '../scheduler'
import { getSaoPauloParts } from '../lib/timezone'
import type { Logger } from '../lib/logger'
import type { Queue } from 'bullmq'

// ─── Interface mínima de Prisma ────────────────────────────────────────────────

export interface AccumulatedAlertPrismaContestRow {
  number: number
  lotterySlug: string
  estimatedNextCents: bigint | null
  isAccumulated: boolean
}

export interface AccumulatedAlertPrismaPreferenceRow {
  userId: string
  accumulatedThresholdCents: bigint
}

export interface AccumulatedAlertPrisma {
  contest: {
    /** Um registro por modalidade ATIVA: o concurso de maior `number` (o mais recente). */
    findLatestPerLottery(): Promise<AccumulatedAlertPrismaContestRow[]>
  }
  notificationPreference: {
    /** Só usuários com `accumulatedThresholdCents IS NOT NULL`. */
    findManyWithThreshold(): Promise<AccumulatedAlertPrismaPreferenceRow[]>
  }
}

export interface AccumulatedAlertNotifyQueue {
  add(name: string, data: NotifyJobData): Promise<unknown>
}

export interface AccumulatedAlertDeps {
  prisma: AccumulatedAlertPrisma
  notifyQueue: AccumulatedAlertNotifyQueue
  logger?: Logger
  now?: () => Date
}

export interface AccumulatedAlertResult {
  scannedContests: number
  scannedPreferences: number
  enqueued: number
}

// ─── Rótulo do próximo sorteio ("quinta-feira, 21h") ──────────────────────────

const WEEKDAY_NAMES_PT: readonly string[] = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

function formatHourLabel(time: string): string {
  const [hh, mm] = time.split(':')
  const hour = Number(hh)
  return mm === '00' ? `${hour}h` : `${hour}h${mm}`
}

/**
 * Próxima ocorrência (a partir de `now`, em America/Sao_Paulo) de qualquer entrada de
 * `schedule.entries`, formatada como "quinta-feira, 21h" (docs/09 §9.6, linha "Acumulado").
 * Pura — mesma técnica de "minutos da semana, módulo 7 dias" de `scheduler.ts`
 * `isWithinHotWindow`, aqui usada para achar a MENOR distância até a próxima ocorrência em
 * vez de testar se `now` está dentro de uma janela.
 */
export function formatNextDrawLabel(now: Date, schedule: DrawSchedule): string | null {
  const { weekday, hour, minute } = getSaoPauloParts(now)
  const nowWeekMinute = weekday * MINUTES_PER_DAY + hour * 60 + minute

  let best: { deltaMinutes: number; day: number; time: string } | null = null
  for (const entry of schedule.entries) {
    const drawMinute = parseTimeOfDay(entry.time)
    if (drawMinute === null) continue
    const entryWeekMinute = entry.day * MINUTES_PER_DAY + drawMinute
    const deltaMinutes = ((entryWeekMinute - nowWeekMinute) % MINUTES_PER_WEEK + MINUTES_PER_WEEK) % MINUTES_PER_WEEK
    if (best === null || deltaMinutes < best.deltaMinutes) {
      best = { deltaMinutes, day: entry.day, time: entry.time }
    }
  }
  if (best === null) return null

  const weekdayName = WEEKDAY_NAMES_PT[best.day]
  if (weekdayName === undefined) return null
  return `${weekdayName}, ${formatHourLabel(best.time)}`
}

// ─── Payload do notify enfileirado ─────────────────────────────────────────────

function buildAccumulatedNotifyPayload(
  userId: string,
  contest: AccumulatedAlertPrismaContestRow,
  now: Date,
): NotifyJobData {
  const config = getLotteryConfig(contest.lotterySlug as LotterySlug)
  const estimatedNextCents = contest.estimatedNextCents ?? 0n
  const nextDrawLabel = formatNextDrawLabel(now, config.drawSchedule) ?? 'em breve'

  return {
    userId,
    type: 'contest.accumulated',
    title: `${config.name} acumulou ${formatMillionsBRL(estimatedNextCents)}`,
    body: `Próximo sorteio: ${nextDrawLabel}.`,
    payload: {
      lotterySlug: config.slug,
      contestNumber: contest.number,
      estimatedNextCents: estimatedNextCents.toString(),
      nextDrawLabel,
    },
  }
}

// ─── Job ─────────────────────────────────────────────────────────────────────────

export function createAccumulatedAlertJob(deps: AccumulatedAlertDeps) {
  const logger = deps.logger
  const now = deps.now ?? (() => new Date())

  return async function accumulatedAlert(data: AccumulatedAlertJobData): Promise<AccumulatedAlertResult> {
    accumulatedAlertJobSchema.parse(data)

    const [contests, preferences] = await Promise.all([
      deps.prisma.contest.findLatestPerLottery(),
      deps.prisma.notificationPreference.findManyWithThreshold(),
    ])

    let enqueued = 0
    const instant = now()
    for (const contest of contests) {
      if (!contest.isAccumulated || contest.estimatedNextCents === null) continue
      for (const preference of preferences) {
        if (contest.estimatedNextCents < preference.accumulatedThresholdCents) continue
        await deps.notifyQueue.add('notify', buildAccumulatedNotifyPayload(preference.userId, contest, instant))
        enqueued += 1
      }
    }

    logger?.info('accumulated-alert.done', {
      scannedContests: contests.length,
      scannedPreferences: preferences.length,
      enqueued,
    })
    return { scannedContests: contests.length, scannedPreferences: preferences.length, enqueued }
  }
}

// ─── Registro do job repetível ────────────────────────────────────────────────

export const ACCUMULATED_ALERT_SCHEDULER_ID = 'accumulated-alert-1h'
export const ACCUMULATED_ALERT_INTERVAL_MS = 60 * 60 * 1000

export async function registerAccumulatedAlertSchedule(
  queue: Pick<Queue<AccumulatedAlertJobData>, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    ACCUMULATED_ALERT_SCHEDULER_ID,
    { every: ACCUMULATED_ALERT_INTERVAL_MS },
    { name: 'accumulated-alert', data: { triggeredAt: new Date().toISOString() } },
  )
}

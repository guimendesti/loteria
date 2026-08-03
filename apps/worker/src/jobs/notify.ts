/**
 * SY-04 — notify: envia/grava notificação para um usuário respeitando canal, plano (via
 * `NotificationPreference.emailEnabled`/`pushEnabled`), preferências (`onlyWhenPrized`) e
 * horário de silêncio (docs/08 parte E). Fluxo por canal:
 *
 *   1. IN_APP — sempre gravado (não é intrusivo: é o "inbox" do usuário, não acorda
 *      ninguém). Não é afetado por `onlyWhenPrized` nem por horário de silêncio — essas
 *      regras só fazem sentido para canais que INTERROMPEM o usuário (e-mail, push).
 *   2. Se `onlyWhenPrized` estiver ligado e a notificação for de resultado de aposta
 *      (`bet.prized`/`bet.checked`) sem prêmio (`totalPrizeCents <= 0`), paramos aqui: só
 *      IN_APP. Fora desse caso (ex.: `contest.accumulated`, que não tem noção de "prêmio"),
 *      a preferência não se aplica.
 *   3. Se estiver dentro do horário de silêncio (`isInQuietHours`, em America/Sao_Paulo),
 *      também paramos aqui — e-mail/push não são sequer tentados (não há fila de
 *      reenvio depois que a janela fecha; é supressão, não falha).
 *   4. E-mail — se `emailEnabled`, tenta `EmailSender.send`; grava `Notification` com
 *      status SENT (sucesso) ou FAILED (`error` = mensagem do `EmailSendError`).
 *   5. Push — se `pushEnabled` E o usuário tem >= 1 `PushSubscription`, tenta
 *      `PushSender.send` na primeira subscription; grava SENT/FAILED. Sem subscription
 *      cadastrada, não há o que enviar — não é falha, não gera linha (mesma lógica de
 *      "supressão" do horário de silêncio). Subscription MORTA (404/410,
 *      `PushSendResult.shouldDeleteSubscription`) cai na mesma supressão — ver P4a abaixo.
 *
 * ── Idempotência (P4) ──────────────────────────────────────────────────────────────────
 *
 * RESOLVIDO (S3): `Notification.dedupeKey` é coluna UNIQUE (migration
 * `20260802T2_notification_dedupe_key`). Cada tentativa de canal calcula uma `dedupeKey`
 * DETERMINÍSTICA (`type:userId:lotterySlug:contestNumber:channel`, ou prefixo mais curto
 * sem contexto de concurso), embutida em `payload.dedupeKey` (contrato do job inalterado)
 * e extraída para a coluna pelo adapter (`lib/prisma-adapters.ts`). O `findFirst` ANTES
 * de agir evita reenviar e-mail/push no retry; numa corrida real, o segundo INSERT viola
 * a unique (P2002), o job falha e o retry vira no-op — idempotência garantida pelo banco.
 *
 * ── Subscription morta (P4a) ─────────────────────────────────────────────────────────────
 *
 * RESOLVIDO: `PushSendResult.shouldDeleteSubscription` (`@lotopro/integrations`, setado por
 * `WebPushSender` em 404/410) sinaliza que o ENDPOINT não existe mais do lado do
 * navegador/SO — não é uma falha de envio, é um destinatário que sumiu. `sendPush` (abaixo)
 * apaga a `PushSubscription` (`deleteMany` por `endpoint`, idempotente) e devolve `null` —
 * mesmo tratamento de "sem subscription cadastrada" — em vez de gravar uma `Notification`
 * FAILED, que sugeriria um problema de envio a investigar quando na verdade é limpeza
 * esperada de um dispositivo revogado.
 *
 * ── Templates de billing (P4b) ───────────────────────────────────────────────────────────
 *
 * `billing.payment_failed`/`billing.downgraded`/`billing.trial_ended` (enfileirados por
 * `apps/worker/jobs/billing-dunning.ts`) agora têm template dedicado em
 * `@lotopro/integrations` (docs/09 §9.6 "Cobrança falhou" + mesmo tom para
 * downgraded/trial_ended) — ver `buildEmailContent` abaixo. Antes caíam no fallback
 * genérico (`renderPlainTemplate(parsed.title, parsed.body)`).
 */
import { getLotteryConfig, type LotterySlug } from '@lotopro/core'
import {
  betCheckedTemplate,
  betPrizedTemplate,
  billingDowngradedTemplate,
  billingPaymentFailedTemplate,
  billingTrialEndedTemplate,
  contestAccumulatedTemplate,
  renderPlainTemplate,
  type BillingDowngradedTemplatePayload,
  type EmailSender,
  type NotificationTemplateOutput,
  type PushSender,
  type PushSendResult,
} from '@lotopro/integrations'
import { NotificationChannel, NotificationStatus, Prisma } from '@lotopro/db'
import { notifyJobSchema, type NotifyJobData } from '../queues'
import { parseTimeOfDay } from '../scheduler'
import { getSaoPauloParts } from '../lib/timezone'
import type { Logger } from '../lib/logger'

// ─── Interface mínima de Prisma ────────────────────────────────────────────────

export interface NotifyPrismaUserRow {
  id: string
  email: string
}

export interface NotifyPrismaPreferenceRow {
  emailEnabled: boolean
  pushEnabled: boolean
  onlyWhenPrized: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

export interface NotifyPrismaPushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface NotifyPrismaNotificationCreateData {
  userId: string
  channel: NotificationChannel
  type: string
  title: string
  body: string
  payload: Prisma.InputJsonValue | typeof Prisma.JsonNull
  status: NotificationStatus
  sentAt?: Date
  error?: string
}

export interface NotifyPrisma {
  user: {
    findUnique(args: { where: { id: string } }): Promise<NotifyPrismaUserRow | null>
  }
  notificationPreference: {
    findUnique(args: { where: { userId: string } }): Promise<NotifyPrismaPreferenceRow | null>
  }
  pushSubscription: {
    findMany(args: { where: { userId: string } }): Promise<NotifyPrismaPushSubscriptionRow[]>
    /**
     * P4a — apaga a subscription morta (404/410, `PushSendResult.shouldDeleteSubscription`).
     * `deleteMany` (não `delete`) de propósito: idempotente por `endpoint` mesmo se a linha já
     * tiver sido removida por uma corrida anterior (retry do BullMQ) — não lança se 0 linhas
     * casarem, ao contrário de `delete` (que exige unique match e lançaria P2025).
     */
    deleteMany(args: { where: { endpoint: string } }): Promise<unknown>
  }
  notification: {
    /** `dedupeKey` é lido de dentro de `payload` (Json) — ver adapter em `lib/prisma-adapters.ts`. */
    findFirst(args: {
      where: { userId: string; type: string; dedupeKey: string }
    }): Promise<{ id: string } | null>
    create(args: { data: NotifyPrismaNotificationCreateData }): Promise<{ id: string }>
  }
}

export interface NotifyDeps {
  prisma: NotifyPrisma
  emailSender: EmailSender
  pushSender: PushSender
  logger?: Logger
  now?: () => Date
}

// ─── Resultado ─────────────────────────────────────────────────────────────────

export interface NotifyChannelOutcome {
  channel: NotificationChannel
  notificationId: string
  status: NotificationStatus
  /** `true` quando já existia uma notificação com a mesma `dedupeKey` (P4). */
  deduped: boolean
}

export interface NotifyResult {
  channels: NotifyChannelOutcome[]
}

// ─── Horário de silêncio (item b) ──────────────────────────────────────────────

/**
 * `true` se `now` (instante UTC) cai dentro do horário de silêncio `[start, end)` do
 * usuário, em horário local de America/Sao_Paulo. Pura — sem I/O — cobre o caso comum de
 * janela cruzando meia-noite (ex.: "22:00" a "06:00"). `start === end` é tratado como "sem
 * silêncio" (evita uma configuração ambígua silenciar 24h por engano).
 */
export function isInQuietHours(now: Date, start: string, end: string): boolean {
  const startMinutes = parseTimeOfDay(start)
  const endMinutes = parseTimeOfDay(end)
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false

  const { hour, minute } = getSaoPauloParts(now)
  const nowMinutes = hour * 60 + minute

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes // não cruza meia-noite
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes // cruza meia-noite
}

// ─── Preferências (item a) ──────────────────────────────────────────────────────

const DEFAULT_PREFERENCE: NotifyPrismaPreferenceRow = {
  // Espelha os defaults de `NotificationPreference` no schema.prisma — usuário sem linha
  // ainda (nunca visitou "Conta > Notificações") recebe o comportamento padrão opt-out.
  emailEnabled: true,
  pushEnabled: true,
  onlyWhenPrized: false,
  quietHoursStart: null,
  quietHoursEnd: null,
}

async function resolvePreference(prisma: NotifyPrisma, userId: string): Promise<NotifyPrismaPreferenceRow> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } })
  return row ?? DEFAULT_PREFERENCE
}

// ─── Extração de dados do payload livre (item c) ───────────────────────────────

const PRIZE_RELEVANT_TYPES = new Set(['bet.prized', 'bet.checked'])

/**
 * `onlyWhenPrized` só suprime canais intrusivos quando (a) o tipo é de resultado de aposta
 * E (b) o payload realmente carrega um valor de prêmio (checado explicitamente, não
 * assumido `0` na ausência — assim `contest.accumulated`/`pool.*`, que não têm essa noção,
 * nunca são suprimidos por esta regra).
 */
function extractPrizeCents(payload: Record<string, unknown> | undefined): bigint | null {
  const raw = payload?.['totalPrizeCents'] ?? payload?.['prizeCents']
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return BigInt(raw)
  if (typeof raw === 'number' && Number.isInteger(raw)) return BigInt(raw)
  return null
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const BILLING_DOWNGRADE_REASONS = new Set<BillingDowngradedTemplatePayload['reason']>([
  'payment_failed',
  'canceled',
  'scheduled_downgrade',
])

function asBillingDowngradeReason(value: unknown): BillingDowngradedTemplatePayload['reason'] | null {
  return typeof value === 'string' && BILLING_DOWNGRADE_REASONS.has(value as BillingDowngradedTemplatePayload['reason'])
    ? (value as BillingDowngradedTemplatePayload['reason'])
    : null
}

function safeLotteryName(slug: string): string | null {
  try {
    return getLotteryConfig(slug as LotterySlug).name
  } catch {
    return null
  }
}

/**
 * Monta o conteúdo do e-mail (e, por reaproveitamento, o texto exibido em IN_APP quando um
 * template dedicado existe) a partir do `type` + `payload` do job. Cai para
 * `renderPlainTemplate(parsed.title, parsed.body)` — o texto cru que o job já carrega —
 * quando o `type` não tem template em `@lotopro/integrations` (ex.: `pool.*`, ainda sem
 * job que os enfileire) ou o `payload` não tem os campos exigidos pelo template.
 */
function buildEmailContent(parsed: NotifyJobData): NotificationTemplateOutput {
  const payload = parsed.payload ?? {}
  const lotterySlug = typeof payload['lotterySlug'] === 'string' ? (payload['lotterySlug'] as string) : null
  const lotteryName = lotterySlug !== null ? safeLotteryName(lotterySlug) : null

  if (parsed.type === 'bet.prized' && lotteryName !== null) {
    const contestNumber = asPositiveInt(payload['contestNumber'])
    const hits = asNonNegativeInt(payload['hits'])
    if (contestNumber !== null && hits !== null) {
      return betPrizedTemplate({ lotteryName, contestNumber, hits })
    }
  }

  if (parsed.type === 'bet.checked' && lotteryName !== null) {
    const contestNumber = asPositiveInt(payload['contestNumber'])
    const hits = asNonNegativeInt(payload['hits'])
    if (contestNumber !== null && hits !== null) {
      const remainingContests = asNonNegativeInt(payload['remainingContests'])
      return betCheckedTemplate({
        lotteryName,
        contestNumber,
        hits,
        ...(remainingContests !== null ? { remainingContests } : {}),
      })
    }
  }

  if (parsed.type === 'contest.accumulated' && lotteryName !== null) {
    const nextDrawLabel = typeof payload['nextDrawLabel'] === 'string' ? (payload['nextDrawLabel'] as string) : null
    const estimatedRaw = payload['estimatedNextCents']
    const estimatedNextCents =
      typeof estimatedRaw === 'string' && /^-?\d+$/.test(estimatedRaw) ? BigInt(estimatedRaw) : null
    if (nextDrawLabel !== null && estimatedNextCents !== null) {
      return contestAccumulatedTemplate({ lotteryName, estimatedNextCents, nextDrawLabel })
    }
  }

  // P4b — billing.* (docs/09 §9.6 "Cobrança falhou" + downgraded/trial_ended, mesmo tom).
  // Enfileirado hoje por `apps/worker/jobs/billing-dunning.ts` (fora do território desta
  // tarefa) com um `title`/`body` próprio embutido no job — esse texto inline segue sendo
  // usado para IN_APP/PUSH (`createNotificationRow`/`sendPush` usam `parsed.title`/`body`
  // diretamente, não passam por `buildEmailContent`); só o e-mail passa a usar o template
  // dedicado abaixo, com o texto canônico de docs/09 §9.6.
  if (parsed.type === 'billing.payment_failed') {
    return billingPaymentFailedTemplate()
  }

  if (parsed.type === 'billing.downgraded') {
    const targetPlanName = asNonEmptyString(payload['targetPlanName'])
    const reason = asBillingDowngradeReason(payload['reason'])
    if (targetPlanName !== null && reason !== null) {
      return billingDowngradedTemplate({ targetPlanName, reason })
    }
  }

  if (parsed.type === 'billing.trial_ended') {
    const targetPlanName = asNonEmptyString(payload['targetPlanName'])
    if (targetPlanName !== null) {
      return billingTrialEndedTemplate({ targetPlanName })
    }
  }

  return renderPlainTemplate(parsed.title, parsed.body)
}

// ─── Idempotência (P4) ──────────────────────────────────────────────────────────

/**
 * Chave determinística por (tipo, usuário, [modalidade, concurso], canal). Quando o
 * payload não traz `lotterySlug`/`contestNumber` (nem todo `type` tem essa noção), a chave
 * fica mais curta — ainda deduplica retries do MESMO job (mesmo `type`+`userId`+`channel`),
 * só não diferencia dois eventos distintos do mesmo tipo para o mesmo usuário no mesmo
 * instante (caso raro; documentado como limitação no cabeçalho do arquivo).
 */
function buildDedupeKey(parsed: NotifyJobData, channel: NotificationChannel): string {
  const payload = parsed.payload ?? {}
  const parts = [parsed.type, parsed.userId]
  if (typeof payload['lotterySlug'] === 'string') parts.push(payload['lotterySlug'] as string)
  if (typeof payload['contestNumber'] === 'number') parts.push(String(payload['contestNumber']))
  parts.push(channel)
  return parts.join(':')
}

async function findExisting(
  prisma: NotifyPrisma,
  parsed: NotifyJobData,
  channel: NotificationChannel,
): Promise<{ dedupeKey: string; existing: { id: string } | null }> {
  const dedupeKey = buildDedupeKey(parsed, channel)
  const existing = await prisma.notification.findFirst({ where: { userId: parsed.userId, type: parsed.type, dedupeKey } })
  return { dedupeKey, existing }
}

async function createNotificationRow(
  prisma: NotifyPrisma,
  parsed: NotifyJobData,
  channel: NotificationChannel,
  dedupeKey: string,
  outcome: { status: NotificationStatus; sentAt?: Date; error?: string },
): Promise<string> {
  const payload = { ...(parsed.payload ?? {}), dedupeKey } as Prisma.InputJsonValue
  const created = await prisma.notification.create({
    data: {
      userId: parsed.userId,
      channel,
      type: parsed.type,
      title: parsed.title,
      body: parsed.body,
      payload,
      status: outcome.status,
      ...(outcome.sentAt !== undefined ? { sentAt: outcome.sentAt } : {}),
      ...(outcome.error !== undefined ? { error: outcome.error } : {}),
    },
  })
  return created.id
}

// ─── P4a — subscription morta ──────────────────────────────────────────────────

/**
 * `true` quando o `PushSendResult` sinaliza um endpoint que não existe mais (404/410).
 * Prioriza o campo tipado (`shouldDeleteSubscription`); o prefixo `"gone:"` em `error` fica
 * como fallback para um `PushSender` mais antigo que ainda não tenha sido atualizado para
 * setar o campo (defesa em profundidade, não o contrato principal — ver `webpush.ts`).
 */
function isDeadSubscriptionResult(result: PushSendResult): boolean {
  if (result.shouldDeleteSubscription === true) return true
  return typeof result.error === 'string' && result.error.startsWith('gone:')
}

// ─── Canais ─────────────────────────────────────────────────────────────────────

async function sendInApp(
  deps: NotifyDeps,
  parsed: NotifyJobData,
  now: Date,
  logger?: Logger,
): Promise<NotifyChannelOutcome> {
  const channel = NotificationChannel.IN_APP
  const { dedupeKey, existing } = await findExisting(deps.prisma, parsed, channel)
  if (existing) {
    logger?.info('notify.dedupe.skip', { userId: parsed.userId, type: parsed.type, channel, dedupeKey })
    return { channel, notificationId: existing.id, status: NotificationStatus.SENT, deduped: true }
  }
  // A própria linha É a entrega — não há "envio" separado, então já nasce SENT.
  const notificationId = await createNotificationRow(deps.prisma, parsed, channel, dedupeKey, {
    status: NotificationStatus.SENT,
    sentAt: now,
  })
  return { channel, notificationId, status: NotificationStatus.SENT, deduped: false }
}

async function sendEmail(
  deps: NotifyDeps,
  parsed: NotifyJobData,
  now: Date,
  logger?: Logger,
): Promise<NotifyChannelOutcome> {
  const channel = NotificationChannel.EMAIL
  const { dedupeKey, existing } = await findExisting(deps.prisma, parsed, channel)
  if (existing) {
    logger?.info('notify.dedupe.skip', { userId: parsed.userId, type: parsed.type, channel, dedupeKey })
    return { channel, notificationId: existing.id, status: NotificationStatus.SENT, deduped: true }
  }

  const user = await deps.prisma.user.findUnique({ where: { id: parsed.userId } })
  if (!user || !user.email) {
    logger?.warn('notify.email.no-address', { userId: parsed.userId })
    const notificationId = await createNotificationRow(deps.prisma, parsed, channel, dedupeKey, {
      status: NotificationStatus.FAILED,
      error: 'usuário sem e-mail cadastrado',
    })
    return { channel, notificationId, status: NotificationStatus.FAILED, deduped: false }
  }

  const content = buildEmailContent(parsed)
  try {
    await deps.emailSender.send({ to: user.email, subject: content.subject, html: content.html, text: content.text })
    const notificationId = await createNotificationRow(deps.prisma, parsed, channel, dedupeKey, {
      status: NotificationStatus.SENT,
      sentAt: now,
    })
    return { channel, notificationId, status: NotificationStatus.SENT, deduped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger?.error('notify.email.failed', { userId: parsed.userId, type: parsed.type, error })
    const notificationId = await createNotificationRow(deps.prisma, parsed, channel, dedupeKey, {
      status: NotificationStatus.FAILED,
      error: message,
    })
    return { channel, notificationId, status: NotificationStatus.FAILED, deduped: false }
  }
}

async function sendPush(
  deps: NotifyDeps,
  parsed: NotifyJobData,
  now: Date,
  logger?: Logger,
): Promise<NotifyChannelOutcome | null> {
  const channel = NotificationChannel.PUSH
  const subscriptions = await deps.prisma.pushSubscription.findMany({ where: { userId: parsed.userId } })
  if (subscriptions.length === 0) {
    logger?.debug('notify.push.no-subscription', { userId: parsed.userId })
    return null // nada para enviar — não é falha, não gera linha
  }

  const { dedupeKey, existing } = await findExisting(deps.prisma, parsed, channel)
  if (existing) {
    logger?.info('notify.dedupe.skip', { userId: parsed.userId, type: parsed.type, channel, dedupeKey })
    return { channel, notificationId: existing.id, status: NotificationStatus.SENT, deduped: true }
  }

  // Tenta só o primeiro dispositivo. `NoopPushSender` sempre falha hoje (ver decisão em
  // packages/integrations/src/notify/noop.ts) — quando `WebPushSender` existir, considerar
  // tentar os demais dispositivos em caso de falha do primeiro (fora de escopo aqui).
  const subscription = subscriptions[0]!
  const result = await deps.pushSender.send({
    subscription: { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
    title: parsed.title,
    body: parsed.body,
  })

  // P4a — subscription morta (404/410): apaga o registro e trata como "nada para enviar"
  // (mesma supressão de `subscriptions.length === 0`, acima) em vez de falha permanente do
  // canal — a falha é do DISPOSITIVO revogado, não do envio em si, então não grava uma linha
  // FAILED enganosa. Um retry do mesmo job (mesma dedupeKey) cai direto no early-return de
  // "sem subscription" depois disso, sem loop.
  if (!result.ok && isDeadSubscriptionResult(result)) {
    await deps.prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } })
    logger?.info('notify.push.subscription-deleted', {
      userId: parsed.userId,
      endpoint: subscription.endpoint,
      error: result.error,
    })
    return null
  }

  const status = result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED
  const notificationId = await createNotificationRow(deps.prisma, parsed, channel, dedupeKey, {
    status,
    ...(result.ok ? { sentAt: now } : { error: result.error ?? 'push falhou' }),
  })
  if (!result.ok) logger?.warn('notify.push.failed', { userId: parsed.userId, error: result.error })
  return { channel, notificationId, status, deduped: false }
}

// ─── Job ─────────────────────────────────────────────────────────────────────────

export function createNotifyJob(deps: NotifyDeps) {
  const logger = deps.logger
  const now = deps.now ?? (() => new Date())

  return async function notify(data: NotifyJobData): Promise<NotifyResult> {
    const parsed = notifyJobSchema.parse(data)
    const instant = now()

    const preference = await resolvePreference(deps.prisma, parsed.userId)

    const channels: NotifyChannelOutcome[] = [await sendInApp(deps, parsed, instant, logger)]

    // item (c) — onlyWhenPrized: só se aplica a resultado de aposta, e só quando o payload
    // realmente informa o prêmio (ver `extractPrizeCents`).
    const prizeCents = extractPrizeCents(parsed.payload)
    const suppressToInAppOnly =
      PRIZE_RELEVANT_TYPES.has(parsed.type) && preference.onlyWhenPrized && prizeCents !== null && prizeCents <= 0n
    if (suppressToInAppOnly) {
      logger?.info('notify.only-when-prized.suppressed', { userId: parsed.userId, type: parsed.type })
      return { channels }
    }

    // item (b) — horário de silêncio: suprime e-mail/push, não IN_APP.
    const quiet =
      preference.quietHoursStart !== null &&
      preference.quietHoursEnd !== null &&
      isInQuietHours(instant, preference.quietHoursStart, preference.quietHoursEnd)
    if (quiet) {
      logger?.info('notify.quiet-hours.suppressed', { userId: parsed.userId, type: parsed.type })
      return { channels }
    }

    if (preference.emailEnabled) {
      channels.push(await sendEmail(deps, parsed, instant, logger))
    }

    if (preference.pushEnabled) {
      const pushOutcome = await sendPush(deps, parsed, instant, logger)
      if (pushOutcome) channels.push(pushOutcome)
    }

    return { channels }
  }
}

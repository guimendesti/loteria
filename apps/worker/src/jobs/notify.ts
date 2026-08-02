/**
 * SY-04 (esqueleto) — notify: por ora só grava a notificação em `Notification` com canal
 * `IN_APP` e status `QUEUED`, e loga. Envio de fato (e-mail via Resend, push, WhatsApp),
 * respeito a preferências/horário de silêncio e o canal por plano ficam para onda futura —
 * ver docs/08 parte E, SY-04.
 *
 * ⚠️ Idempotência conhecida como limitação: `Notification` (schema.prisma) não tem chave
 * única para deduplicar (ex.: `(userId, type, payload.contestNumber)`). Reprocessar o mesmo
 * job `notify` duas vezes (ex.: retry do BullMQ após falha de rede no meio do job) cria duas
 * linhas. Como o job só grava-e-loga, o risco prático é notificação duplicada, não dado
 * inconsistente — aceitável para o esqueleto; entra na lista de pendências.
 */
import { NotificationChannel, NotificationStatus, Prisma } from '@lotopro/db'
import { notifyJobSchema, type NotifyJobData } from '../queues'
import type { Logger } from '../lib/logger'

export interface NotifyPrisma {
  notification: {
    create(args: {
      data: {
        userId: string
        channel: NotificationChannel
        type: string
        title: string
        body: string
        payload: Prisma.InputJsonValue | typeof Prisma.JsonNull
        status: NotificationStatus
      }
    }): Promise<{ id: string }>
  }
}

export interface NotifyDeps {
  prisma: NotifyPrisma
  logger?: Logger
}

export function createNotifyJob(deps: NotifyDeps) {
  const logger = deps.logger

  return async function notify(data: NotifyJobData): Promise<{ notificationId: string }> {
    const parsed = notifyJobSchema.parse(data)

    const created = await deps.prisma.notification.create({
      data: {
        userId: parsed.userId,
        channel: NotificationChannel.IN_APP,
        type: parsed.type,
        title: parsed.title,
        body: parsed.body,
        payload: (parsed.payload as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        status: NotificationStatus.QUEUED,
      },
    })

    logger?.info('notify.queued', { userId: parsed.userId, type: parsed.type, notificationId: created.id })
    return { notificationId: created.id }
  }
}

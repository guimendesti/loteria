/**
 * Adapta o `PrismaClient` real (`@lotopro/db`) para as interfaces MÍNIMAS que os jobs
 * declaram (`SyncResultsPrisma`, `CheckBetsPrisma`, `NotifyPrisma`). Só este arquivo conhece
 * o `PrismaClient` de verdade — os jobs recebem a interface mínima por injeção de
 * dependência, e os testes usam um duplo em memória no lugar deste adapter.
 */
import type { PrismaClient } from '@lotopro/db'
import type { SyncResultsPrisma } from '../jobs/sync-results'
import type { CheckBetsPrisma } from '../jobs/check-bets'
import type { NotifyPrisma } from '../jobs/notify'
import type { AccumulatedAlertPrisma, AccumulatedAlertPrismaContestRow } from '../jobs/accumulated-alert'

export function createSyncResultsPrismaAdapter(prisma: PrismaClient): SyncResultsPrisma {
  return {
    lottery: {
      findMany: ({ where }) =>
        prisma.lottery.findMany({ where: { isActive: where.isActive }, select: { id: true, slug: true } }),
    },
    contest: {
      findFirst: ({ where, orderBy }) =>
        prisma.contest.findFirst({
          where: { lotteryId: where.lotteryId },
          orderBy: { number: orderBy.number },
          select: { number: true },
        }),
      upsert: ({ where, create, update }) =>
        prisma.contest.upsert({
          where: { lotteryId_number: where.lotteryId_number },
          create,
          update,
          select: { id: true },
        }),
    },
    contestPrize: {
      upsert: ({ where, create, update }) =>
        prisma.contestPrize.upsert({ where: { contestId_tier: where.contestId_tier }, create, update }),
    },
  }
}

export function createCheckBetsPrismaAdapter(prisma: PrismaClient): CheckBetsPrisma {
  return {
    lottery: {
      findUnique: ({ where }) =>
        prisma.lottery.findUnique({ where: { slug: where.slug }, select: { id: true, slug: true } }),
    },
    contest: {
      findUnique: ({ where }) =>
        prisma.contest.findUnique({
          where: { lotteryId_number: where.lotteryId_number },
          select: {
            id: true,
            number: true,
            drawDate: true,
            numbers: true,
            numbersDrawOrder: true,
            secondaryNumbers: true,
            extraResult: true,
            isAccumulated: true,
            collectedCents: true,
            accumulatedNextCents: true,
            estimatedNextCents: true,
            rawPayload: true,
            prizes: { select: { tier: true, label: true, winnersCount: true, prizeCents: true } },
          },
        }),
      update: ({ where, data }) =>
        prisma.contest.update({ where: { id: where.id }, data: { settledAt: data.settledAt } }),
    },
    bet: {
      findMany: ({ where, orderBy, take }) =>
        prisma.bet.findMany({
          where: {
            lotteryId: where.lotteryId,
            isActive: where.isActive,
            contestFrom: where.contestFrom,
            contestTo: where.contestTo,
            ...(where.id ? { id: where.id } : {}),
          },
          orderBy: { id: orderBy.id },
          take,
          select: { id: true, userId: true, numbers: true, extraPicks: true, columns: true, matchPicks: true },
        }),
    },
    betCheck: {
      upsert: ({ where, create, update }) =>
        prisma.betCheck.upsert({
          where: { betId_contestId_drawIndex: where.betId_contestId_drawIndex },
          create,
          update,
        }),
    },
  }
}

export function createNotifyPrismaAdapter(prisma: PrismaClient): NotifyPrisma {
  return {
    user: {
      findUnique: ({ where }) => prisma.user.findUnique({ where: { id: where.id }, select: { id: true, email: true } }),
    },
    notificationPreference: {
      findUnique: ({ where }) =>
        prisma.notificationPreference.findUnique({
          where: { userId: where.userId },
          select: {
            emailEnabled: true,
            pushEnabled: true,
            onlyWhenPrized: true,
            quietHoursStart: true,
            quietHoursEnd: true,
          },
        }),
    },
    pushSubscription: {
      findMany: ({ where }) =>
        prisma.pushSubscription.findMany({
          where: { userId: where.userId },
          select: { endpoint: true, p256dh: true, auth: true },
        }),
    },
    notification: {
      // P4 RESOLVIDO (S3): `Notification.dedupeKey` agora é coluna com UNIQUE
      // (migration 20260802T2_notification_dedupe_key). O findFirst consulta a
      // coluna; o create grava a coluna — numa corrida, o segundo INSERT viola a
      // unique (P2002), o job falha e o retry do BullMQ cai no findFirst e vira
      // no-op. Idempotência garantida pelo banco, não pela aplicação.
      findFirst: ({ where }) =>
        prisma.notification.findFirst({
          where: { userId: where.userId, type: where.type, dedupeKey: where.dedupeKey },
          select: { id: true },
        }),
      create: ({ data }) =>
        prisma.notification.create({
          data: {
            userId: data.userId,
            channel: data.channel,
            type: data.type,
            title: data.title,
            body: data.body,
            payload: data.payload,
            status: data.status,
            // P4: a dedupeKey vem embutida no payload (contrato do job inalterado);
            // extraímos para a coluna UNIQUE — é ela que garante a idempotência.
            dedupeKey: extractDedupeKey(data.payload),
            ...(data.sentAt !== undefined ? { sentAt: data.sentAt } : {}),
            ...(data.error !== undefined ? { error: data.error } : {}),
          },
          select: { id: true },
        }),
    },
  }
}

export function createAccumulatedAlertPrismaAdapter(prisma: PrismaClient): AccumulatedAlertPrisma {
  return {
    contest: {
      findLatestPerLottery: async () => {
        const lotteries = await prisma.lottery.findMany({ where: { isActive: true }, select: { id: true, slug: true } })
        const rows = await Promise.all(
          lotteries.map(async (lottery): Promise<AccumulatedAlertPrismaContestRow | null> => {
            const contest = await prisma.contest.findFirst({
              where: { lotteryId: lottery.id },
              orderBy: { number: 'desc' },
              select: { number: true, estimatedNextCents: true, isAccumulated: true },
            })
            if (!contest) return null
            return {
              number: contest.number,
              lotterySlug: lottery.slug,
              estimatedNextCents: contest.estimatedNextCents,
              isAccumulated: contest.isAccumulated,
            }
          }),
        )
        return rows.filter((row): row is AccumulatedAlertPrismaContestRow => row !== null)
      },
    },
    notificationPreference: {
      findManyWithThreshold: async () => {
        const rows = await prisma.notificationPreference.findMany({
          where: { accumulatedThresholdCents: { not: null } },
          select: { userId: true, accumulatedThresholdCents: true },
        })
        // O `where` acima garante não-nulo em runtime; o tipo gerado pelo Prisma não
        // propaga essa garantia para a seleção (`accumulatedThresholdCents` continua
        // `bigint | null`), daí o cast explícito.
        return rows.map((row) => ({
          userId: row.userId,
          accumulatedThresholdCents: row.accumulatedThresholdCents as bigint,
        }))
      },
    },
  }
}

/** P4: extrai a dedupeKey embutida no Json `payload` para gravá-la na coluna UNIQUE. */
function extractDedupeKey(payload: unknown): string | null {
  if (payload !== null && typeof payload === 'object' && 'dedupeKey' in payload) {
    const v = (payload as Record<string, unknown>)['dedupeKey']
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  return null
}

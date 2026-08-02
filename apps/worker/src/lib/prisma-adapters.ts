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
    notification: {
      create: ({ data }) => prisma.notification.create({ data, select: { id: true } }),
    },
  }
}

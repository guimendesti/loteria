/**
 * @lotopro/db — cliente Prisma singleton.
 *
 * Padrão recomendado pela Prisma para Next.js/dev com hot-reload: em desenvolvimento,
 * o módulo é reavaliado a cada mudança de arquivo, o que criaria uma nova instância de
 * PrismaClient (e uma nova pool de conexões) a cada reload. Guardamos a instância em
 * `globalThis` para reaproveitá-la entre reloads.
 *
 * Uso:
 *   import { prisma } from '@lotopro/db'
 *   const lotteries = await prisma.lottery.findMany()
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Reexporta a classe e todos os tipos gerados (models, enums, namespace Prisma.*)
// para que outros pacotes do monorepo não precisem depender diretamente de @prisma/client.
export { PrismaClient, Prisma } from '@prisma/client'
export type {
  Lottery,
  PriceTier,
  PrizeTier,
  Contest,
  ContestPrize,
  ClosureMatrix,
  Tenant,
  User,
  Plan,
  Subscription,
  Invoice,
  UsageCounter,
  Bet,
  BetCheck,
  Strategy,
  Pool,
  PoolMember,
  PoolPayment,
  PoolPayout,
  NotificationPreference,
  Notification,
  PushSubscription,
  AuditLog,
  WebhookEvent,
  FeatureFlag,
} from '@prisma/client'

// Enums são exportados como valor (não apenas tipo) pois são usados em runtime
// (ex.: `if (bet.source === BetSource.GENERATED)`).
export {
  LotteryFormat,
  TenantType,
  UserRole,
  PixKeyType,
  SubStatus,
  BillingCycle,
  PaymentMethod,
  InvoiceStatus,
  BetSource,
  PoolStatus,
  MemberStatus,
  PaymentConfirmation,
  PayoutStatus,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client'

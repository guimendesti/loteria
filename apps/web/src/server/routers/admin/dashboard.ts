/**
 * Router `admin.dashboard` — BO-01..05 (docs/08 §D.2). Só leitura: todas as procedures
 * exigem `min: 'VIEWER'` (D.1 — "Somente leitura de métricas e listagens"). Nenhuma
 * mutation aqui, então nenhuma chama `writeAudit` (a auditoria é para AÇÕES, não leituras).
 *
 * Convenção de agregação: tudo com `count`/`aggregate`/`groupBy` do Prisma ou, no máximo,
 * um `findMany` com `select` estreito seguido de um `reduce` em memória — nunca um loop
 * chamando o Prisma de novo por item (CLAUDE.md "nada de N+1 gratuito", pedido explícito
 * da tarefa). `kpis`/`growth`/`funnel`/`systemHealth` cada um roda um punhado fixo de
 * queries em `Promise.all`, independente do tamanho da base.
 */
import { z } from 'zod'
import { BillingCycle, InvoiceStatus, NotificationStatus, SubStatus } from '@lotopro/db'
import { router } from '@/server/trpc'
import { adminProcedure } from '@/server/lib/admin/rbac'
import { planPriceCents } from '@/server/lib/billing/period'
import { FREE_PLAN_SLUG } from '@/server/lib/billing/service'
import { lastMonthKeys, monthKey } from '@/server/lib/wallet-period'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** "Assinante" (para distribuição por plano/MRR): tem acesso pago ou em período de graça. */
const SUBSCRIBER_STATUSES = [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] as const
/** "Pagante" (para conversão free→pago e ticket médio): já pagou de fato, não em trial. */
const PAYING_STATUSES = [SubStatus.ACTIVE, SubStatus.PAST_DUE] as const

interface PlanRow {
  id: string
  slug: string
  name: string
  priceMonthlyCents: bigint
  priceYearlyCents: bigint
}

/** Preço mensal equivalente: anual vira preço-de-tabela ÷ 12 (piso em centavos). */
function monthlyEquivalentCents(plan: PlanRow, cycle: BillingCycle): bigint {
  const price = planPriceCents(plan, cycle)
  return cycle === BillingCycle.YEARLY ? price / 12n : price
}

const growthInput = z.object({
  months: z.number().int().min(1).max(24).default(12),
})

const funnelInput = z.object({
  /** Janela do funil — sem filtro por padrão (contagens acumuladas desde sempre). */
  sinceDays: z.number().int().min(1).max(3650).optional(),
})

export const adminDashboardRouter = router({
  /**
   * BO-01 — KPIs do topo do dashboard. `mrrCents`/`arrCents`/`averageTicketCents` são
   * ESTIMATIVAS (usam o preço de TABELA do plano, não o valor com desconto de Pix
   * Automático — docs/05 §5.5 — que só existe no momento da cobrança real no gateway;
   * calcular o valor exato aqui exigiria olhar `paymentMethod` de cada assinatura, o que
   * é uma melhoria futura de precisão, não uma pendência bloqueante).
   */
  kpis: adminProcedure('VIEWER').query(async ({ ctx }) => {
    const now = new Date()
    const since30d = new Date(now.getTime() - THIRTY_DAYS_MS)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [totalUsers, activeUsers30d, subscriberRows, plans, canceledThisMonth, payingUsersCount] =
      await Promise.all([
        ctx.prisma.user.count({ where: { deletedAt: null } }),
        ctx.prisma.user.count({ where: { deletedAt: null, lastSeenAt: { gte: since30d } } }),
        ctx.prisma.subscription.findMany({
          where: { status: { in: [...SUBSCRIBER_STATUSES] } },
          select: { planId: true, billingCycle: true },
        }),
        ctx.prisma.plan.findMany({
          select: { id: true, slug: true, name: true, priceMonthlyCents: true, priceYearlyCents: true },
        }),
        ctx.prisma.subscription.count({
          where: { canceledAt: { gte: startOfMonth, lt: startOfNextMonth } },
        }),
        ctx.prisma.subscription.count({
          where: { status: { in: [...PAYING_STATUSES] }, plan: { slug: { not: FREE_PLAN_SLUG } } },
        }),
      ])

    const planById = new Map(plans.map((plan) => [plan.id, plan]))

    const countByPlan = new Map<string, number>()
    let mrrCents = 0n
    for (const row of subscriberRows) {
      countByPlan.set(row.planId, (countByPlan.get(row.planId) ?? 0) + 1)
      const plan = planById.get(row.planId)
      if (plan) mrrCents += monthlyEquivalentCents(plan, row.billingCycle)
    }

    const subscribersByPlan = plans
      .map((plan) => ({
        planId: plan.id,
        planSlug: plan.slug,
        planName: plan.name,
        subscriberCount: countByPlan.get(plan.id) ?? 0,
      }))
      .filter((entry) => entry.subscriberCount > 0)
      .sort((a, b) => b.subscriberCount - a.subscriberCount)

    // Aproximação documentada: cohort exata de churn exigiria um snapshot do início do
    // mês (não temos event sourcing de assinaturas). Base = quem estava ativo agora +
    // quem cancelou este mês (proxy de "quem estava ativo no início do mês").
    const churnBaseline = subscriberRows.length + canceledThisMonth
    const churnRatePct = churnBaseline > 0 ? (canceledThisMonth / churnBaseline) * 100 : 0

    const freeToPaidConversionPct = totalUsers > 0 ? (payingUsersCount / totalUsers) * 100 : 0
    const averageTicketCents = payingUsersCount > 0 ? mrrCents / BigInt(payingUsersCount) : 0n

    return {
      totalUsers,
      activeUsers30d,
      subscribersByPlan,
      mrrCents,
      arrCents: mrrCents * 12n,
      averageTicketCents,
      churnRatePct,
      freeToPaidConversionPct,
      payingUsersCount,
      generatedAt: now,
    }
  }),

  /** BO-02 — série mensal de novos usuários e novos assinantes (12 meses por padrão). */
  growth: adminProcedure('VIEWER').input(growthInput).query(async ({ ctx, input }) => {
    const now = new Date()
    const months = lastMonthKeys(now, input.months)

    // 1 mês de folga na busca: mesma técnica de `wallet.monthly` (cobre a borda entre o
    // fuso do Postgres/UTC e o de agrupamento, America/Sao_Paulo).
    const searchSince = new Date(now)
    searchSince.setUTCMonth(searchSince.getUTCMonth() - input.months - 1)

    const [users, subscriptions] = await Promise.all([
      ctx.prisma.user.findMany({
        where: { deletedAt: null, createdAt: { gte: searchSince } },
        select: { createdAt: true },
      }),
      ctx.prisma.subscription.findMany({
        where: { createdAt: { gte: searchSince } },
        select: { createdAt: true },
      }),
    ])

    const byMonth = new Map<string, { newUsers: number; newSubscribers: number }>(
      months.map((month) => [month, { newUsers: 0, newSubscribers: 0 }]),
    )
    for (const user of users) {
      const entry = byMonth.get(monthKey(user.createdAt))
      if (entry) entry.newUsers += 1
    }
    for (const subscription of subscriptions) {
      const entry = byMonth.get(monthKey(subscription.createdAt))
      if (entry) entry.newSubscribers += 1
    }

    return months.map((month) => ({ month, ...(byMonth.get(month) ?? { newUsers: 0, newSubscribers: 0 }) }))
  }),

  /**
   * BO-03 — funil cadastro → 1º jogo → 1ª conferência → assinante. Cada etapa é um
   * `count` com filtro de relação (`some`/nested), nunca uma varredura em memória.
   */
  funnel: adminProcedure('VIEWER').input(funnelInput).query(async ({ ctx, input }) => {
    const createdAtFilter =
      input.sinceDays !== undefined
        ? { gte: new Date(Date.now() - input.sinceDays * ONE_DAY_MS) }
        : undefined
    const userWhere = {
      deletedAt: null,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    }

    const [signups, firstBet, firstCheck, subscribers] = await Promise.all([
      ctx.prisma.user.count({ where: userWhere }),
      ctx.prisma.user.count({ where: { ...userWhere, bets: { some: {} } } }),
      ctx.prisma.user.count({ where: { ...userWhere, bets: { some: { checks: { some: {} } } } } }),
      ctx.prisma.user.count({
        where: {
          ...userWhere,
          subscription: { status: { in: [...PAYING_STATUSES] }, plan: { slug: { not: FREE_PLAN_SLUG } } },
        },
      }),
    ])

    const pctOfSignups = (count: number): number => (signups > 0 ? (count / signups) * 100 : 0)

    return {
      steps: [
        { key: 'signup' as const, label: 'Cadastro', count: signups, pctOfSignups: 100 },
        { key: 'first_bet' as const, label: '1º jogo', count: firstBet, pctOfSignups: pctOfSignups(firstBet) },
        {
          key: 'first_check' as const,
          label: '1ª conferência',
          count: firstCheck,
          pctOfSignups: pctOfSignups(firstCheck),
        },
        { key: 'subscriber' as const, label: 'Assinante', count: subscribers, pctOfSignups: pctOfSignups(subscribers) },
      ],
    }
  }),

  /**
   * BO-04 (crítico) — saúde do sistema. Semáforo por modalidade é uma HEURÍSTICA
   * documentada (`syncStatusFromMinutes` abaixo): não existe, neste território, acesso à
   * lógica real de janela de sincronização do worker (`apps/worker`, SY-01 — fora do
   * escopo desta tarefa). O intervalo esperado entre concursos é aproximado a partir de
   * `Lottery.drawSchedule.days` (dado, não código — CLAUDE.md regra 6), não hardcoded por
   * modalidade.
   */
  systemHealth: adminProcedure('VIEWER').query(async ({ ctx }) => {
    const now = new Date()
    const since24h = new Date(now.getTime() - ONE_DAY_MS)

    const [lotteries, betChecks24h, failedNotifications24h, overdueInvoices] = await Promise.all([
      ctx.prisma.lottery.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          drawSchedule: true,
          contests: { orderBy: { createdAt: 'desc' }, take: 1, select: { number: true, createdAt: true } },
        },
      }),
      ctx.prisma.betCheck.count({ where: { checkedAt: { gte: since24h } } }),
      ctx.prisma.notification.count({
        where: { status: NotificationStatus.FAILED, createdAt: { gte: since24h } },
      }),
      ctx.prisma.invoice.count({ where: { status: InvoiceStatus.PENDING, dueAt: { lt: now } } }),
    ])

    const lotteryHealth = lotteries.map((lottery) => {
      const last = lottery.contests[0]
      const minutesSinceLastSync = last ? Math.round((now.getTime() - last.createdAt.getTime()) / 60000) : null
      const expectedIntervalMinutes = expectedDrawIntervalMinutes(lottery.drawSchedule)
      return {
        lotterySlug: lottery.slug,
        lotteryName: lottery.name,
        lastContestNumber: last?.number ?? null,
        lastContestCreatedAt: last?.createdAt ?? null,
        minutesSinceLastSync,
        status: syncStatusFromMinutes(minutesSinceLastSync, expectedIntervalMinutes),
      }
    })

    const notificationsStatus = trafficLight(failedNotifications24h, { yellow: 1, red: 10 })
    const invoicesStatus = trafficLight(overdueInvoices, { yellow: 1, red: 5 })
    const worstLotteryStatus = worstOf(lotteryHealth.map((entry) => entry.status))
    const overallStatus = worstOf([worstLotteryStatus, notificationsStatus, invoicesStatus])

    return {
      lotteries: lotteryHealth,
      betChecks24h,
      failedNotifications24h,
      notificationsStatus,
      overdueInvoices,
      invoicesStatus,
      overallStatus,
      generatedAt: now,
    }
  }),
})

export type AdminDashboardRouter = typeof adminDashboardRouter

// ─── Heurística de semáforo (BO-04) ───────────────────────────────────────────────────

type TrafficLightStatus = 'green' | 'yellow' | 'red'

const STATUS_SEVERITY: Record<TrafficLightStatus, number> = { green: 0, yellow: 1, red: 2 }

function worstOf(statuses: TrafficLightStatus[]): TrafficLightStatus {
  return statuses.reduce<TrafficLightStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    'green',
  )
}

function trafficLight(count: number, thresholds: { yellow: number; red: number }): TrafficLightStatus {
  if (count >= thresholds.red) return 'red'
  if (count >= thresholds.yellow) return 'yellow'
  return 'green'
}

/**
 * Minutos aproximados entre sorteios a partir de `Lottery.drawSchedule` (Json —
 * `{ days: number[], time, cutoffMinutes, tz }`, docs/07 §7.3). Sem `days` válido,
 * assume 1 sorteio/semana (mais conservador — evita falso "vermelho" para modalidades
 * mal configuradas, mas ainda acusa se ficar realmente parada).
 */
function expectedDrawIntervalMinutes(drawSchedule: unknown): number {
  const days =
    drawSchedule !== null && typeof drawSchedule === 'object' && 'days' in drawSchedule
      ? (drawSchedule as { days: unknown }).days
      : null
  const drawsPerWeek = Array.isArray(days) && days.length > 0 ? days.length : 1
  return (7 / drawsPerWeek) * 24 * 60
}

/**
 * Verde: dentro de 1,5x o intervalo esperado. Amarelo: até 3x. Vermelho: além disso, ou
 * nenhum concurso já sincronizado (`minutesSinceLastSync === null`).
 */
function syncStatusFromMinutes(minutesSinceLastSync: number | null, expectedIntervalMinutes: number): TrafficLightStatus {
  if (minutesSinceLastSync === null) return 'red'
  if (minutesSinceLastSync <= expectedIntervalMinutes * 1.5) return 'green'
  if (minutesSinceLastSync <= expectedIntervalMinutes * 3) return 'yellow'
  return 'red'
}

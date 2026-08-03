/**
 * Router `admin.users` — BO-10..15 (docs/08 §D.3). Toda mutation chama `writeAudit`
 * (CLAUDE.md "toda ação de admin gera `audit_log`") com `actorId`/`actorRole` tirados da
 * sessão do backoffice, nunca do input — o ator é sempre quem está autenticado.
 *
 * Nunca `select`/`include` traz `passwordHash` nem `pixKeyEncrypted`: todo `select` de
 * `User` neste arquivo é uma lista explícita de campos, nunca a linha inteira — defesa em
 * profundidade contra vazamento acidental (regra da tarefa).
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { BillingCycle, PaymentMethod, SubStatus, UserRole, type Prisma } from '@lotopro/db'
import { adminProcedure, requirePermission } from '@/server/lib/admin/rbac'
import { writeAudit } from '@/server/lib/admin/audit'
import { router } from '@/server/trpc'
import { addDays, addMonths, TRIAL_DAYS } from '@/server/lib/billing/period'
import { TRIAL_PLAN_SLUG } from '@/server/lib/billing/service'

const REASON_MIN_LENGTH = 10
const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN_LENGTH, `Justificativa obrigatória (mínimo ${REASON_MIN_LENGTH} caracteres).`)
  .max(500)

const userIdInput = z.object({ userId: z.string().min(1) })

const userStatusFilterSchema = z.enum(['free', 'trialing', 'active', 'past_due', 'canceled', 'expired'])

const STATUS_FILTER_MAP: Record<Exclude<z.infer<typeof userStatusFilterSchema>, 'free'>, SubStatus> = {
  trialing: SubStatus.TRIALING,
  active: SubStatus.ACTIVE,
  past_due: SubStatus.PAST_DUE,
  canceled: SubStatus.CANCELED,
  expired: SubStatus.EXPIRED,
}

const listInput = z.object({
  /** Busca por nome/e-mail (contains, case-insensitive) OU id exato (BO-10). */
  search: z.string().trim().max(200).optional(),
  planSlug: z.string().trim().max(50).optional(),
  status: userStatusFilterSchema.optional(),
  role: z.nativeEnum(UserRole).optional(),
  /** Inclui contas anonimizadas/soft-deleted (BO-15) — ocultas por padrão. */
  includeDeleted: z.boolean().default(false),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

const userListSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  createdAt: true,
  lastSeenAt: true,
  deletedAt: true,
  subscription: {
    select: { status: true, plan: { select: { slug: true, name: true } } },
  },
} satisfies Prisma.UserSelect

const userDetailSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  emailVerified: true,
  emailVerifiedAt: true,
  isAdult: true,
  termsAcceptedAt: true,
  pixKeyType: true, // tipo só (CPF/CNPJ/...) — NUNCA `pixKeyEncrypted`
  timezone: true,
  lastSeenAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  avatarUrl: true,
  subscription: {
    select: {
      id: true,
      status: true,
      billingCycle: true,
      paymentMethod: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      cancelAtPeriodEnd: true,
      canceledAt: true,
      createdAt: true,
      plan: { select: { id: true, slug: true, name: true, priceMonthlyCents: true, priceYearlyCents: true } },
    },
  },
} satisfies Prisma.UserSelect

const invoiceSelect = {
  id: true,
  amountCents: true,
  status: true,
  method: true,
  dueAt: true,
  paidAt: true,
  attempts: true,
  failureReason: true,
  createdAt: true,
} satisfies Prisma.InvoiceSelect

const setPlanInput = z.object({
  userId: z.string().min(1),
  planSlug: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Plano inválido.'),
  reason: reasonSchema,
})

const grantTrialInput = z.object({
  userId: z.string().min(1),
  reason: reasonSchema,
})

const setRoleInput = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(UserRole),
  reason: reasonSchema,
})

const toggleBlockInput = z.object({
  userId: z.string().min(1),
  blocked: z.boolean(),
  reason: z.string().trim().max(500).optional(),
})

const anonymizeInput = z.object({
  userId: z.string().min(1),
  reason: reasonSchema,
})

export const adminUsersRouter = router({
  /** BO-10 — busca + filtros + paginação por cursor. */
  list: adminProcedure('VIEWER').input(listInput).query(async ({ ctx, input }) => {
    const and: Prisma.UserWhereInput[] = []
    if (!input.includeDeleted) and.push({ deletedAt: null })

    if (input.search) {
      const search = input.search
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { id: search },
        ],
      })
    }
    if (input.role) and.push({ role: input.role })
    if (input.planSlug) and.push({ subscription: { plan: { slug: input.planSlug } } })
    if (input.status) {
      and.push(
        input.status === 'free'
          ? { subscription: null }
          : { subscription: { status: STATUS_FILTER_MAP[input.status] } },
      )
    }

    const where: Prisma.UserWhereInput = and.length > 0 ? { AND: and } : {}

    const rows = await ctx.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: userListSelect,
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) {
      const extra = rows.pop()
      nextCursor = extra?.id
    }

    return { items: rows, nextCursor }
  }),

  /** BO-11 — perfil + assinatura + contadores + últimas faturas + timeline de auditoria. */
  detail: adminProcedure('SUPPORT').input(userIdInput).query(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:detail')

    const user = await ctx.prisma.user.findUnique({ where: { id: input.userId }, select: userDetailSelect })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })

    const [betsCount, activeBetsCount, ownedPoolsCount, poolMembershipsCount, invoices, auditEvents] =
      await Promise.all([
        ctx.prisma.bet.count({ where: { userId: input.userId, deletedAt: null } }),
        ctx.prisma.bet.count({ where: { userId: input.userId, deletedAt: null, isActive: true } }),
        ctx.prisma.pool.count({ where: { ownerId: input.userId } }),
        ctx.prisma.poolMember.count({ where: { userId: input.userId } }),
        user.subscription
          ? ctx.prisma.invoice.findMany({
              where: { subscriptionId: user.subscription.id },
              orderBy: { dueAt: 'desc' },
              take: 5,
              select: invoiceSelect,
            })
          : Promise.resolve([]),
        ctx.prisma.auditLog.findMany({
          where: { entityType: 'User', entityId: input.userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])

    return {
      user,
      counters: { betsCount, activeBetsCount, ownedPoolsCount, poolMembershipsCount },
      invoices,
      auditEvents,
    }
  }),

  /**
   * BO-12 — troca manual de plano, com justificativa obrigatória. Bypassa o gateway de
   * pagamento de propósito (é exatamente o que "manual" quer dizer aqui — mesmo padrão de
   * `billing.startTrial`, que também nunca chama o Asaas): NÃO mexe em
   * `gatewaySubscriptionId`/`gatewayCustomerId` de uma assinatura existente, então uma
   * troca manual pode divergir do que está cadastrado no Asaas até a próxima cobrança —
   * risco aceito e documentado; conciliação (BO-35) é território de outro agente
   * (`admin/financeiro`).
   */
  setPlan: adminProcedure('SUPPORT').input(setPlanInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:plan:write')

    const [user, plan] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          subscription: { select: { id: true, status: true, plan: { select: { slug: true } } } },
        },
      }),
      ctx.prisma.plan.findUnique({ where: { slug: input.planSlug } }),
    ])
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })
    if (!plan) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Plano "${input.planSlug}" não encontrado.` })
    }

    const now = new Date()
    const before = user.subscription
      ? { planSlug: user.subscription.plan.slug, status: user.subscription.status }
      : { planSlug: null, status: null }

    const subscription = user.subscription
      ? await ctx.prisma.subscription.update({
          where: { id: user.subscription.id },
          data: { planId: plan.id },
        })
      : await ctx.prisma.subscription.create({
          data: {
            userId: input.userId,
            planId: plan.id,
            status: SubStatus.ACTIVE,
            billingCycle: BillingCycle.MONTHLY,
            // Sem meio de pagamento real (não passou pelo gateway) — valor nominal, ver
            // docblock acima. Pix Automático é o padrão do produto (docs/05 §5.5, decisão 1).
            paymentMethod: PaymentMethod.PIX_AUTOMATIC,
            currentPeriodStart: now,
            currentPeriodEnd: addMonths(now, 1),
          },
        })

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.plan_changed',
      entityType: 'User',
      entityId: input.userId,
      before,
      after: { planSlug: plan.slug, reason: input.reason },
    })

    return { subscriptionId: subscription.id, planSlug: plan.slug }
  }),

  /**
   * BO-12 — concede trial (14 dias de Pro, `TRIAL_PLAN_SLUG`/`TRIAL_DAYS` de
   * `server/lib/billing/period.ts`/`service.ts`). Diferente de `billing.startTrial`
   * (self-service), este NÃO recusa um segundo trial — é exatamente o propósito de um
   * override manual de atendimento (gesto comercial para quem já usou o trial normal).
   */
  grantTrial: adminProcedure('SUPPORT').input(grantTrialInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:trial:grant')

    const [user, trialPlan] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          subscription: { select: { id: true, status: true, plan: { select: { slug: true } } } },
        },
      }),
      ctx.prisma.plan.findUnique({ where: { slug: TRIAL_PLAN_SLUG } }),
    ])
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })
    if (!trialPlan) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Plano de trial "${TRIAL_PLAN_SLUG}" não encontrado — rode o seed (pnpm -F @lotopro/db seed).`,
      })
    }

    const now = new Date()
    const trialEndsAt = addDays(now, TRIAL_DAYS)
    const before = user.subscription
      ? { planSlug: user.subscription.plan.slug, status: user.subscription.status }
      : null

    const subscription = user.subscription
      ? await ctx.prisma.subscription.update({
          where: { id: user.subscription.id },
          data: {
            planId: trialPlan.id,
            status: SubStatus.TRIALING,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            cancelReason: null,
          },
        })
      : await ctx.prisma.subscription.create({
          data: {
            userId: input.userId,
            planId: trialPlan.id,
            status: SubStatus.TRIALING,
            billingCycle: BillingCycle.MONTHLY,
            paymentMethod: PaymentMethod.PIX_AUTOMATIC,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            trialEndsAt,
          },
        })

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.trial_granted',
      entityType: 'User',
      entityId: input.userId,
      before,
      after: { planSlug: trialPlan.slug, trialEndsAt, reason: input.reason },
    })

    return { subscriptionId: subscription.id, trialEndsAt }
  }),

  /** BO-12/D.1 — só ADMIN ("gestão de... usuários admin"). Bloqueia auto-rebaixamento. */
  setRole: adminProcedure('ADMIN').input(setRoleInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:role:write')

    if (input.userId === ctx.session.user.id && input.role !== UserRole.ADMIN) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Você não pode remover seu próprio papel de administrador por aqui — peça a outro ADMIN.',
      })
    }

    const user = await ctx.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, role: true } })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })

    const updated = await ctx.prisma.user.update({
      where: { id: input.userId },
      data: { role: input.role },
      select: { id: true, role: true },
    })

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.role_changed',
      entityType: 'User',
      entityId: input.userId,
      before: { role: user.role },
      after: { role: input.role, reason: input.reason },
    })

    return updated
  }),

  /**
   * BO-12 (bloquear/desbloquear) — DECISÃO DE DESIGN (ver relatório da tarefa).
   *
   * O schema (`packages/db`, fora do território desta tarefa) não tem NENHUM campo de
   * bloqueio. `User.deletedAt` já tem semântica própria e conflitante (soft delete /
   * anonimização LGPD — `anonymize` abaixo): reaproveitá-lo aqui faria um usuário
   * "bloqueado" parecer anonimizado/excluído para o resto do sistema (login, listagens,
   * `anonymize`), o que é PIOR do que não ter a feature — nenhum outro campo existente
   * serve sem sobrecarregar um significado que já é usado para outra coisa.
   *
   * Implementação honesta dentro do território permitido: encerra AGORA todas as sessões
   * ativas do usuário (logout imediato, efeito real) e registra a INTENÇÃO em `AuditLog` —
   * mas NÃO impede um novo login (e-mail/senha continuam válidos): `implemented: false` na
   * resposta é para a UI mostrar isso com todas as letras, não fingir um controle que não
   * existe. Bloqueio persistente de verdade exige um campo no schema (`User.blockedAt`,
   * proposto) — pendência para o dono do schema/orquestrador.
   */
  toggleBlock: adminProcedure('SUPPORT').input(toggleBlockInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:block:write')

    const user = await ctx.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })

    const revoked = await ctx.prisma.session.deleteMany({ where: { userId: input.userId } })

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: input.blocked ? 'admin.user.block_requested' : 'admin.user.unblock_requested',
      entityType: 'User',
      entityId: input.userId,
      after: {
        blocked: input.blocked,
        sessionsRevoked: revoked.count,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    })

    return {
      implemented: false as const,
      sessionsRevoked: revoked.count,
      message:
        'Bloqueio persistente não implementado (requer campo novo no schema, fora do território desta tarefa). As sessões ativas foram encerradas agora, mas um novo login continua possível.',
    }
  }),

  /** BO-14 (LGPD) — exporta os dados do usuário. `.mutation` porque grava AuditLog (ação, não leitura pura). */
  exportData: adminProcedure('SUPPORT').input(userIdInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:lgpd:export')

    const user = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        isAdult: true,
        termsAcceptedAt: true,
        pixKeyType: true,
        timezone: true,
        lastSeenAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        subscription: { include: { plan: true, invoices: true } },
      },
    })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })

    const [bets, ownedPools, poolMemberships, strategies, notificationPreference, recentNotifications] =
      await Promise.all([
        ctx.prisma.bet.findMany({
          where: { userId: input.userId },
          include: { lottery: { select: { slug: true, name: true } }, checks: true },
        }),
        ctx.prisma.pool.findMany({ where: { ownerId: input.userId } }),
        ctx.prisma.poolMember.findMany({
          where: { userId: input.userId },
          include: { pool: { select: { id: true, name: true } } },
        }),
        ctx.prisma.strategy.findMany({ where: { userId: input.userId } }),
        ctx.prisma.notificationPreference.findUnique({ where: { userId: input.userId } }),
        ctx.prisma.notification.findMany({
          where: { userId: input.userId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ])

    const exportedAt = new Date()
    const payload = {
      exportedAt,
      profile: user,
      bets,
      ownedPools,
      poolMemberships,
      strategies,
      notificationPreference,
      recentNotifications,
    }

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.data_exported',
      entityType: 'User',
      entityId: input.userId,
      after: { exportedAt, sections: Object.keys(payload) },
    })

    return payload
  }),

  /**
   * BO-15 (LGPD) — anonimiza e-mail/nome, revoga credenciais/sessões (impede novo login),
   * mas NUNCA apaga `Bet`/`Pool`/`PoolMember`/`AuditLog` etc. — preserva a integridade
   * referencial de bolões de terceiros (a regra explícita da tarefa). `Account`/`Session`
   * apagados aqui são exclusivamente deste usuário (FK `userId`) — não são linhas de
   * outros usuários.
   */
  anonymize: adminProcedure('ADMIN').input(anonymizeInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:lgpd:anonymize')

    const user = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, name: true, deletedAt: true },
    })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })
    if (user.deletedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Este usuário já foi anonimizado.' })
    }

    const anonymizedEmail = `anon-${user.id}@deleted.lotopro.invalid`
    const anonymizedName = 'Usuário removido'

    const updated = await ctx.prisma.user.update({
      where: { id: input.userId },
      data: {
        email: anonymizedEmail,
        name: anonymizedName,
        phone: null,
        avatarUrl: null,
        image: null,
        passwordHash: null,
        pixKeyEncrypted: null,
        pixKeyType: null,
        // Defesa em profundidade: uma identidade anonimizada não deveria reter
        // privilégio de backoffice, mesmo que este ID um dia tenha tido um.
        role: UserRole.CUSTOMER,
        deletedAt: new Date(),
      },
      select: { id: true, email: true, deletedAt: true },
    })

    await Promise.all([
      ctx.prisma.account.deleteMany({ where: { userId: input.userId } }),
      ctx.prisma.session.deleteMany({ where: { userId: input.userId } }),
    ])

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.anonymized',
      entityType: 'User',
      entityId: input.userId,
      before: { email: user.email, name: user.name },
      after: { email: anonymizedEmail, name: anonymizedName, reason: input.reason },
    })

    return { userId: updated.id, anonymizedAt: updated.deletedAt }
  }),
})

export type AdminUsersRouter = typeof adminUsersRouter

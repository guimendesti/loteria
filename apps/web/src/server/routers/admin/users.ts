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
  /** BO-13 — filtra por estado de bloqueio. Omitido: mostra bloqueadas e não bloqueadas. */
  blocked: z.boolean().optional(),
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
  blockedAt: true,
  blockedReason: true,
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
  blockedAt: true,
  blockedReason: true,
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

/**
 * Bolões que o usuário ORGANIZA, para o export LGPD (BO-14). Lista explícita de campos, e
 * não a linha inteira, pelo mesmo motivo dos `select` de `User` acima: `Pool` tem DUAS
 * colunas que não podem sair daqui —
 * - `ownerPixKeyEnc`: snapshot cifrado da chave Pix do organizador (mesmo material sensível
 *   de `User.pixKeyEncrypted`, só que em outra tabela; docs/03 §3.5 "nunca logar/expor");
 * - `inviteCode`: credencial VIVA de entrada no bolão (`@unique`, usada no link de convite) —
 *   vazá-la num export permitiria a quem lesse o arquivo entrar no bolão.
 */
const poolExportSelect = {
  id: true,
  tenantId: true,
  lotteryId: true,
  name: true,
  description: true,
  contestFrom: true,
  contestTo: true,
  totalShares: true,
  shareValueCents: true,
  totalCostCents: true,
  status: true,
  ownerPixKeyType: true, // tipo só (CPF/CNPJ/...) — NUNCA `ownerPixKeyEnc`
  receiptUrl: true,
  receiptUploadedAt: true,
  rulesAcceptedAt: true,
  inviteExpiresAt: true,
  closedAt: true,
  createdAt: true,
} satisfies Prisma.PoolSelect

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
    if (input.blocked !== undefined) {
      and.push({ blockedAt: input.blocked ? { not: null } : null })
    }
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
      ip: ctx.ip,
      userAgent: ctx.userAgent,
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
      ip: ctx.ip,
      userAgent: ctx.userAgent,
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
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    return updated
  }),

  /**
   * BO-13 — bloqueio administrativo real. `User.blockedAt`/`blockedReason`
   * (packages/db/prisma/schema.prisma, migration `20260803T2_user_block_and_city`)
   * carregam o estado; DUAS camadas fecham o acesso a partir daqui:
   * - `protectedProcedure` (server/trpc.ts) recusa qualquer sessão cujo `blockedAt` esteja
   *   preenchido — cobre sessões que já existiam antes do bloqueio.
   * - `databaseHooks.session.create.before` (lib/auth.ts) recusa a CRIAÇÃO de uma sessão
   *   nova (login) para uma conta bloqueada.
   * Este mutation só grava o estado e faz a revogação imediata de sessões ativas — as duas
   * camadas acima são o que de fato barra o acesso.
   *
   * Diferente de `deletedAt` (soft delete / anonimização LGPD, `anonymize` abaixo):
   * bloquear NUNCA apaga/mascara dado nenhum, e é reversível por outro admin a qualquer
   * momento (`blocked: false` limpa os dois campos).
   *
   * Idempotente nos dois sentidos, de propósito (BO-13 pede isto explicitamente): bloquear
   * quem já está bloqueado não é erro (mantém o `blockedAt` ORIGINAL — a data do PRIMEIRO
   * bloqueio, não reseta o relógio a cada clique —, mas atualiza `blockedReason` se um novo
   * motivo foi informado); desbloquear quem já está desbloqueado também não é erro.
   *
   * Sessões só são revogadas ao BLOQUEAR — ao desbloquear não há nada para revogar (login
   * já estava recusado desde o bloqueio, então nenhuma sessão pode ter sido criada nesse
   * meio-tempo).
   */
  toggleBlock: adminProcedure('SUPPORT').input(toggleBlockInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:block:write')

    // Guarda de auto-lockout — mesmo raciocínio e mesma mensagem-base de `anonymize`
    // abaixo: um admin bloqueando a PRÓPRIA conta perde acesso ao backoffice imediatamente
    // (sessão revogada + login recusado por `databaseHooks.session.create.before`), sem
    // caminho de recuperação pela aplicação se for o único ADMIN. Só bloqueia o sentido
    // PERIGOSO (`blocked: true`); desbloquear a própria conta não tem esse risco — mas, na
    // prática, um admin já bloqueado nunca consegue chamar esta procedure de novo mesmo
    // para se desbloquear (`protectedProcedure` já recusa a sessão dele): a reversão sempre
    // precisa de OUTRO admin, por design.
    if (input.blocked && input.userId === ctx.session.user.id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Você não pode bloquear a própria conta pelo backoffice (risco de lockout). ' +
          'Peça a outro administrador.',
      })
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, blockedAt: true },
    })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })

    const before = { blockedAt: user.blockedAt }

    const updated = await ctx.prisma.user.update({
      where: { id: input.userId },
      data: input.blocked
        ? {
            // Preserva a data do primeiro bloqueio se já estava bloqueado (idempotência —
            // ver docblock acima); só carimba `now` na transição desbloqueado → bloqueado.
            blockedAt: user.blockedAt ?? new Date(),
            blockedReason: input.reason ?? null,
          }
        : { blockedAt: null, blockedReason: null },
      select: { id: true, blockedAt: true, blockedReason: true },
    })

    // Só revoga sessão ao BLOQUEAR (ver docblock acima) — `deleteMany` sem match nenhum
    // (conta que não tinha sessão ativa) devolve `count: 0` sem erro, então bloquear
    // duas vezes seguidas continua idempotente aqui também.
    const revoked = input.blocked ? await ctx.prisma.session.deleteMany({ where: { userId: input.userId } }) : { count: 0 }

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: input.blocked ? 'admin.user.blocked' : 'admin.user.unblocked',
      entityType: 'User',
      entityId: input.userId,
      before,
      after: {
        blockedAt: updated.blockedAt,
        sessionsRevoked: revoked.count,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    return {
      blocked: updated.blockedAt !== null,
      blockedAt: updated.blockedAt,
      blockedReason: updated.blockedReason,
      sessionsRevoked: revoked.count,
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
        ctx.prisma.pool.findMany({ where: { ownerId: input.userId }, select: poolExportSelect }),
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
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    return payload
  }),

  /**
   * BO-15 (LGPD) — anonimiza e-mail/nome, revoga credenciais/sessões (impede novo login),
   * mas NUNCA apaga `Bet`/`Pool`/`PoolMember`/`AuditLog` etc. — preserva a integridade
   * referencial de bolões de terceiros (a regra explícita da tarefa). `Account`/`Session`
   * apagados aqui são exclusivamente deste usuário (FK `userId`) — não são linhas de
   * outros usuários.
   *
   * ★ Achado de auditoria (severidade média, corrigido): além de `User.pixKeyEncrypted`,
   * também limpa o SNAPSHOT `Pool.ownerPixKeyEnc`/`ownerPixKeyType` gravado em cada bolão
   * que este usuário organiza — sem isso, os demais membros continuariam vendo a chave
   * mascarada e o app continuaria montando um BR Code Pix válido pagando alguém que acabou
   * de ser removido (docs/03 §3.5). Mesmo ajuste espelhado em `account.deleteAccount`
   * (`routers/account.ts`) para o caminho self-service. As quatro operações rodam na MESMA
   * `$transaction` (antes, `user.update` corria solto e só `account`/`session` iam juntos
   * num `Promise.all` — nenhuma atomicidade real entre elas).
   */
  anonymize: adminProcedure('ADMIN').input(anonymizeInput).mutation(async ({ ctx, input }) => {
    requirePermission(ctx, 'users:lgpd:anonymize')

    // Auto-anonimização é lockout IRREVERSÍVEL: rebaixa o próprio papel para CUSTOMER e
    // apaga as próprias sessões e contas. Sendo o único ADMIN, ninguém mais entra no
    // backoffice — e não há caminho de recuperação pela aplicação (só SQL direto).
    // `setRole` já bloqueia o auto-rebaixamento; este é o mesmo invariante pelo outro caminho.
    // Titular que queira exercer o direito de exclusão usa `account.deleteAccount`; se for
    // ADMIN, outro ADMIN o rebaixa antes.
    if (input.userId === ctx.session.user.id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Você não pode anonimizar a própria conta pelo backoffice (risco de lockout). ' +
          'Peça a outro administrador, ou use a exclusão de conta no painel do cliente.',
      })
    }

    // Não lemos e-mail/nome originais: não são necessários para anonimizar (o e-mail novo é
    // derivado do `id`) e não podem ir para o `AuditLog` — ver comentário no `writeAudit` abaixo.
    const user = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, deletedAt: true },
    })
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' })
    if (user.deletedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Este usuário já foi anonimizado.' })
    }

    const anonymizedEmail = `anon-${user.id}@deleted.lotopro.invalid`
    const anonymizedName = 'Usuário removido'

    const [updated] = await ctx.prisma.$transaction([
      ctx.prisma.user.update({
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
      }),
      // ★ Achado de auditoria (severidade média, corrigido) — ver docblock acima: limpa o
      // snapshot de chave Pix de cada bolão que este usuário organiza. `updateMany` sem
      // match nenhum devolve `count: 0` sem erro.
      ctx.prisma.pool.updateMany({
        where: { ownerId: input.userId },
        data: { ownerPixKeyEnc: null, ownerPixKeyType: null },
      }),
      ctx.prisma.account.deleteMany({ where: { userId: input.userId } }),
      ctx.prisma.session.deleteMany({ where: { userId: input.userId } }),
    ])

    await writeAudit(ctx.prisma, {
      actorId: ctx.session.user.id,
      actorRole: ctx.session.user.role,
      action: 'admin.user.anonymized',
      entityType: 'User',
      entityId: input.userId,
      // LGPD (BO-15): o `before` NÃO guarda o e-mail/nome ORIGINAIS. `admin.users.detail`
      // (timeline) e `admin.support.messages.list` devolvem linhas de `AuditLog` cruas para o
      // backoffice — gravar a PII aqui deixaria o identificador do titular legível para
      // qualquer operador PARA SEMPRE, depois de a conta ter sido anonimizada; ou seja, a
      // anonimização não seria efetiva. `entityId` já registra QUEM foi anonimizado, e
      // `after.email` é o placeholder derivado do id (não identifica a pessoa).
      before: { anonymizedFields: ['email', 'name', 'phone', 'avatarUrl', 'image', 'passwordHash', 'pixKey', 'role'] },
      after: { email: anonymizedEmail, name: anonymizedName, reason: input.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    return { userId: updated.id, anonymizedAt: updated.deletedAt }
  }),
})

export type AdminUsersRouter = typeof adminUsersRouter

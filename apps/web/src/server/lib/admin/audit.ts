/**
 * `writeAudit` — grava uma linha em `AuditLog` (docs/07 §7.7). CLAUDE.md §"Convenções":
 * "toda ação de admin gera `audit_log`" — TODA mutation dos routers `admin/*` chama isto,
 * sem exceção (inclusive as que "não implementam" de fato o efeito, ex.: `users.toggleBlock`
 * em `routers/admin/users.ts` — a INTENÇÃO do ator ainda precisa ficar registrada).
 *
 * Porta mínima (`AuditPrisma`), não o `PrismaClient` inteiro — mesmo padrão de
 * `server/lib/billing/service.ts` (`BillingPrisma`): mantém isto testável sem banco (ver
 * `routers/__tests__/admin-audit.test.ts`) e sem acoplar este módulo a mais do que o único
 * método que ele usa. `ctx.prisma` (o client real de `@lotopro/db`) satisfaz a porta
 * estruturalmente — nenhum adapter dedicado é necessário aqui porque há um único método
 * envolvido (diferente de `billing/prisma-adapter.ts`, que adapta várias entidades).
 */
import type { Prisma } from '@lotopro/db'

export interface AuditLogRow {
  id: string
  actorId: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
  ip: string | null
  userAgent: string | null
  createdAt: Date
}

export interface AuditLogCreateData {
  /** `null` para ações de sistema sem ator humano (ex.: job automatizado). */
  actorId?: string | null
  /** Papel do ator NO MOMENTO da ação — snapshot, não referência dinâmica (o papel pode mudar depois). */
  actorRole?: string | null
  /** Convenção de nome: `"<entidade>.<evento>"` em snake/dot-case, ex.: `"user.plan_changed"`. */
  action: string
  /** Nome do model Prisma afetado, ex.: `"User"`, `"Subscription"`. */
  entityType: string
  entityId: string
  /** Estado anterior relevante (não a linha inteira) — só os campos que mudaram. */
  before?: unknown
  /** Estado novo relevante, e/ou metadados da ação (ex.: justificativa exigida em `users.setPlan`). */
  after?: unknown
  ip?: string | null
  userAgent?: string | null
}

export interface AuditPrisma {
  auditLog: {
    create(args: { data: AuditLogCreateData }): Promise<AuditLogRow>
  }
}

export async function writeAudit(prisma: AuditPrisma, input: AuditLogCreateData): Promise<AuditLogRow> {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      // `exactOptionalPropertyTypes` (tsconfig) proíbe atribuir `undefined` explícito a
      // uma chave opcional — mesmo padrão de espalhamento condicional de `bets.ts`/
      // `billing/prisma-adapter.ts`: omite a chave inteira quando o chamador não informou.
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.actorRole !== undefined ? { actorRole: input.actorRole } : {}),
      ...(input.before !== undefined ? { before: input.before as Prisma.InputJsonValue } : {}),
      ...(input.after !== undefined ? { after: input.after as Prisma.InputJsonValue } : {}),
      ...(input.ip !== undefined ? { ip: input.ip } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
    },
  })
}

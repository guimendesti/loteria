/**
 * RBAC do backoffice (docs/08 §D.1 — Papéis) e middleware tRPC reutilizável.
 *
 * Papéis (enum `UserRole` de `@lotopro/db`, já com os 4 papéis de backoffice):
 * `VIEWER` · `SUPPORT` · `FINANCE` · `ADMIN` (mais `CUSTOMER`, que nunca passa por aqui —
 * `(admin)/layout.tsx` já barra `CUSTOMER` antes de qualquer procedure ser chamada).
 *
 * ── DECISÃO DE MODELAGEM (pedida explicitamente pela tarefa) ──────────────────────────
 *
 * docs/08 §D.1 descreve os papéis com um "+" cumulativo (VIEWER → SUPPORT → FINANCE →
 * ADMIN), o que sugere uma escada linear onde FINANCE ⊇ SUPPORT. Isso não reflete a
 * realidade que o próprio texto descreve: SUPPORT lida com atendimento (detalhe de
 * usuário, reenvio de e-mail, ajuste manual de plano, reprocessar conferência) e FINANCE
 * lida com dinheiro (faturas, reembolsos, relatórios financeiros) — são especialidades
 * DIFERENTES, não graus do mesmo poder. Um analista financeiro não deveria conseguir
 * bloquear um usuário ou reprocessar uma conferência só porque "está acima" de SUPPORT
 * numa escada, e um agente de suporte não deveria emitir reembolso. Por isso este módulo
 * expõe DOIS mecanismos complementares, não um só:
 *
 * 1. **Rank grosso** (`ROLE_RANK`, `requireRole`, `adminProcedure(min)`) — resposta à
 *    pergunta "este ator tem pelo menos esta SENIORIDADE de backoffice?". `SUPPORT` e
 *    `FINANCE` dividem o MESMO rank (1, entre `VIEWER`=0 e `ADMIN`=2) DE PROPÓSITO: nem
 *    um nem outro "contém" o outro. Use isto como o `.use()` de base de toda procedure do
 *    backoffice — ele também garante sessão válida e papel de backoffice (nunca `CUSTOMER`).
 * 2. **Conjunto de permissões** (`AdminPermission`, `ROLE_PERMISSIONS`, `hasPermission`,
 *    `requirePermission`) — resposta à pergunta "este papel específico pode fazer ESTA
 *    ação?". É aqui que SUPPORT e FINANCE realmente divergem: `users:plan:write` e
 *    `users:block:write` só existem no conjunto do SUPPORT; FINANCE fica só com
 *    `users:detail` (précisa localizar o cliente para relacionar com faturas/reembolsos)
 *    e as permissões financeiras que o router `admin/financeiro` (outro agente/território)
 *    deve estender aqui quando existirem.
 *
 * Convenção usada em `routers/admin/*.ts`: toda procedure passa por `adminProcedure(min)`
 * (gate grosso, decide 401/403 cedo) e, quando a ação realmente distingue SUPPORT de
 * FINANCE, chama `requirePermission(ctx, '...')` dentro do corpo (gate fino). Procedures
 * só de leitura de métricas/listagens (BO-01..05, `users.list`) usam só o gate grosso com
 * `min: 'VIEWER'`, porque D.1 diz que VIEWER já enxerga "métricas e listagens".
 */
import { TRPCError } from '@trpc/server'
import { UserRole } from '@lotopro/db'
import { protectedProcedure } from '@/server/trpc'

/**
 * Sessão mínima exigida pelas funções abaixo — só o que é lido (`.user.role`), não o
 * `Context['session']` inteiro do Better Auth (que também carrega `session.{id,
 * createdAt, token, ...}`, metadados irrelevantes aqui). `Context['session']` real
 * (`{ session: {...}, user: {...role...} } | null`) satisfaz isto estruturalmente — TS só
 * exige os campos declarados, não bate exaustivamente — e os testes puros de
 * `admin-rbac.test.ts` não precisam fabricar metadados de sessão que não usam.
 */
interface SessionLike {
  session: { user: { role: string } } | null
}

export const ADMIN_ROLES = [UserRole.VIEWER, UserRole.SUPPORT, UserRole.FINANCE, UserRole.ADMIN] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

/**
 * Rank de senioridade — SÓ para o gate grosso. `SUPPORT` e `FINANCE` = 1 (mesmo nível,
 * papéis paralelos). Nunca inferir capacidade específica a partir daqui — ver docblock
 * do módulo.
 */
const ROLE_RANK: Record<AdminRole, number> = {
  [UserRole.VIEWER]: 0,
  [UserRole.SUPPORT]: 1,
  [UserRole.FINANCE]: 1,
  [UserRole.ADMIN]: 2,
}

/**
 * Lê e valida o papel de backoffice do ator na sessão. `UNAUTHORIZED` sem sessão
 * (nunca autenticado); `FORBIDDEN` com sessão mas papel fora de `ADMIN_ROLES` (ex.:
 * `CUSTOMER` — não deveria chegar aqui por causa do layout, mas a procedure não confia
 * só nisso, CLAUDE.md "Convenções": entitlements/autorização sempre no servidor).
 */
export function getAdminRole(ctx: SessionLike): AdminRole {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  const role = ctx.session.user.role
  if (!isAdminRole(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito ao backoffice.' })
  }
  return role
}

/** Gate grosso: papel de backoffice com rank ≥ `min`. Ver decisão de modelagem acima. */
export function requireRole(ctx: SessionLike, min: AdminRole): AdminRole {
  const role = getAdminRole(ctx)
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Esta ação exige o papel ${min} (ou superior); seu papel é ${role}.`,
    })
  }
  return role
}

// ─── Permissões finas (SUPPORT ≠ FINANCE) ──────────────────────────────────────────────

/**
 * Permissões usadas por `routers/admin/dashboard.ts` e `routers/admin/users.ts` (o
 * território desta tarefa). `admin/apostas.ts`, `admin/financeiro.ts`, `admin/config.ts`
 * e `admin/suporte.ts` (outro agente) devem ESTENDER este union type e os conjuntos
 * abaixo com as permissões deles (ex.: `'billing:refund'`, `'billing:invoice:write'`,
 * `'contests:reprocess'`, `'feature_flags:write'`) em vez de criar um sistema paralelo.
 */
export type AdminPermission =
  | 'metrics:read'
  | 'users:list'
  | 'users:detail'
  | 'users:plan:write'
  | 'users:trial:grant'
  | 'users:block:write'
  | 'users:role:write'
  | 'users:lgpd:export'
  | 'users:lgpd:anonymize'
  | 'audit:read'

const VIEWER_PERMISSIONS: readonly AdminPermission[] = ['metrics:read', 'users:list']

const SUPPORT_PERMISSIONS: readonly AdminPermission[] = [
  ...VIEWER_PERMISSIONS,
  'users:detail',
  'users:plan:write', // D.1 — "ajustar plano manualmente"
  'users:trial:grant', // D.1 — implícito em "ajustar plano manualmente" (conceder trial é um caso particular)
  'users:block:write', // D.1 — ação operacional de atendimento (ver users.ts sobre o que "bloquear" de fato faz hoje)
  'users:lgpd:export', // BO-14 — atender requisição LGPD é rotina de atendimento
  'audit:read',
]

const FINANCE_PERMISSIONS: readonly AdminPermission[] = [
  ...VIEWER_PERMISSIONS,
  // FINANCE precisa localizar o usuário para relacionar com faturas/reembolsos (BO-11),
  // mas NÃO ajusta plano, NÃO bloqueia, NÃO exporta dados LGPD — isso é atendimento (SUPPORT).
  'users:detail',
  'audit:read',
]

const ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  ...new Set<AdminPermission>([
    ...SUPPORT_PERMISSIONS,
    ...FINANCE_PERMISSIONS,
    'users:role:write', // D.1 — "gestão de... usuários admin", exclusivo de ADMIN
    'users:lgpd:anonymize', // BO-15 — irreversível, exclusivo de ADMIN
  ]),
]

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  [UserRole.VIEWER]: new Set(VIEWER_PERMISSIONS),
  [UserRole.SUPPORT]: new Set(SUPPORT_PERMISSIONS),
  [UserRole.FINANCE]: new Set(FINANCE_PERMISSIONS),
  [UserRole.ADMIN]: new Set(ADMIN_PERMISSIONS),
}

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}

/** Gate fino: papel de backoffice válido E com a permissão específica. */
export function requirePermission(ctx: SessionLike, permission: AdminPermission): AdminRole {
  const role = getAdminRole(ctx)
  if (!hasPermission(role, permission)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Seu papel (${role}) não tem a permissão "${permission}".`,
    })
  }
  return role
}

// ─── Procedure tRPC reutilizável ────────────────────────────────────────────────────────

/**
 * Base de toda procedure do backoffice. Aplica o gate grosso (`requireRole`) e expõe
 * `ctx.adminRole` (já validado) para o corpo da procedure — que deve chamar
 * `requirePermission(ctx, '...')` quando a ação distinguir SUPPORT de FINANCE (ver
 * decisão de modelagem no topo do arquivo).
 *
 * Uso: `adminProcedure('SUPPORT').input(...).mutation(...)`.
 */
export function adminProcedure(min: AdminRole) {
  return protectedProcedure.use(function requireAdminRole({ ctx, next }) {
    const adminRole = requireRole(ctx, min)
    return next({ ctx: { ...ctx, adminRole } })
  })
}

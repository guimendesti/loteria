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
 * Permissões usadas por `routers/admin/*.ts`. Todo router de backoffice ESTENDE este union
 * type e os conjuntos abaixo em vez de criar um sistema paralelo.
 *
 * ⚠️ REGRA DE SEGURANÇA (não afrouxar): `ROLE_RANK[SUPPORT] === ROLE_RANK[FINANCE]`, então
 * `adminProcedure('FINANCE')` SOZINHO deixa passar um ator SUPPORT (e vice-versa) — é o
 * comportamento pretendido do gate GROSSO (papéis paralelos, ver docblock do módulo). Toda
 * procedure cuja ação seja exclusiva de um dos dois papéis PRECISA, além do gate grosso,
 * chamar `requirePermission(ctx, '...')` no corpo. Sem isso, SUPPORT e FINANCE viram o
 * mesmo papel na prática.
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
  /** Atendimento (SUPPORT): caixa de mensagens e histórico de notificações de um usuário (BO-50/51). */
  | 'support:read'
  /** Atendimento (SUPPORT): apagar e refazer `BetCheck` de um concurso/aposta (BO-21) — destrutivo. */
  | 'checks:reprocess'
  /** Financeiro (FINANCE): assinaturas, faturas, MRR, log de webhooks (BO-30/31/34/36). */
  | 'billing:read'
  /** Financeiro (FINANCE): retry de fatura e replay de webhook (BO-32/36) — mexe em cobrança. */
  | 'billing:write'

const VIEWER_PERMISSIONS: readonly AdminPermission[] = ['metrics:read', 'users:list']

const SUPPORT_PERMISSIONS: readonly AdminPermission[] = [
  ...VIEWER_PERMISSIONS,
  'users:detail',
  'users:plan:write', // D.1 — "ajustar plano manualmente"
  'users:trial:grant', // D.1 — implícito em "ajustar plano manualmente" (conceder trial é um caso particular)
  'users:block:write', // D.1 — ação operacional de atendimento (ver users.ts sobre o que "bloquear" de fato faz hoje)
  'users:lgpd:export', // BO-14 — atender requisição LGPD é rotina de atendimento
  'support:read', // BO-50/51 — triagem de atendimento
  'checks:reprocess', // D.1 — "reprocessar conferência" está listado nas permissões de SUPPORT
  'audit:read',
]

const FINANCE_PERMISSIONS: readonly AdminPermission[] = [
  ...VIEWER_PERMISSIONS,
  // FINANCE precisa localizar o usuário para relacionar com faturas/reembolsos (BO-11),
  // mas NÃO ajusta plano, NÃO bloqueia, NÃO exporta dados LGPD, NÃO lê a caixa de suporte
  // e NÃO reprocessa conferência — isso é atendimento (SUPPORT).
  'users:detail',
  'billing:read', // BO-30/31/34/36
  'billing:write', // BO-32/36 — exclusivo de FINANCE: SUPPORT não mexe em cobrança
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

// ─── Navegação do backoffice ────────────────────────────────────────────────────────────

/**
 * Um item do menu do backoffice (`(admin)/components/AdminNav.tsx`) e o acesso mínimo para
 * enxergá-lo — achado de auditoria (severidade média): o menu mostrava TODAS as seções para
 * qualquer admin, inclusive as que o papel dele levaria 403 ao abrir (ex.: "Financeiro" para
 * SUPPORT, que não tem `billing:read`) — vaza a topologia do backoffice para quem não pode
 * usá-la. `minRole`/`permission` abaixo são exatamente o `min` de `adminProcedure` e a
 * `AdminPermission` que a query PRINCIPAL (a que carrega a seção ao abrir a página) já exige
 * no servidor — nunca uma regra nova, só espelhando o gate que já existe em cada router.
 *
 * `(admin)/layout.tsx` (server component, lê a sessão) filtra com `canAccessNavSection` e
 * passa só os itens permitidos para `AdminNav` — que é `'use client'` e NUNCA pode importar
 * este módulo em tempo de execução (ele carrega `@trpc/server`/`@/server/trpc`/Prisma,
 * inseguros no bundle do navegador); só o tipo `AdminNavSection`, via `import type`, é
 * seguro do lado do cliente (mesmo padrão já usado por `AdminRoleContext.tsx`).
 */
export interface AdminNavSection {
  href: string
  label: string
  /** Rank mínimo — o mesmo `min` que a query principal da seção passa para `adminProcedure`. */
  minRole: AdminRole
  /** Permissão fina adicional, quando a query principal também chama `requirePermission`. */
  permission?: AdminPermission
}

export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  // dashboard.{kpis,growth,funnel,systemHealth} — só adminProcedure('VIEWER'), sem gate fino.
  { href: '/admin', label: 'Dashboard', minRole: 'VIEWER', permission: 'metrics:read' },
  // users.list — só adminProcedure('VIEWER'), sem gate fino (D.1: VIEWER vê "listagens").
  { href: '/admin/usuarios', label: 'Usuários', minRole: 'VIEWER', permission: 'users:list' },
  // bets.list — só adminProcedure('VIEWER'), sem `AdminPermission` dedicada (só
  // `reprocessChecks`, um botão DENTRO da página, exige `checks:reprocess`).
  { href: '/admin/apostas', label: 'Apostas', minRole: 'VIEWER' },
  // finance.* — TODA procedure exige adminProcedure('FINANCE') + requirePermission(ctx,
  // 'billing:read'/'billing:write'), sem exceção — um SUPPORT ou VIEWER tomaria 403 na
  // primeira query da página (o exemplo concreto do achado de auditoria).
  { href: '/admin/financeiro', label: 'Financeiro', minRole: 'FINANCE', permission: 'billing:read' },
  // config.lotteries.list — só adminProcedure('VIEWER'), sem gate fino (leitura aberta;
  // `update`/`resync`/`fixContest` exigem ADMIN, mas isso é dentro da página, não no menu).
  { href: '/admin/config', label: 'Configurações', minRole: 'VIEWER' },
  // support.* — TODA procedure exige adminProcedure('SUPPORT') + requirePermission(ctx,
  // 'support:read'), sem exceção — um FINANCE ou VIEWER tomaria 403 na primeira query.
  { href: '/admin/suporte', label: 'Suporte', minRole: 'SUPPORT', permission: 'support:read' },
] as const

/**
 * `true` quando `role` passa no MESMO gate grosso+fino que a query principal da seção já
 * exige no servidor. Rank sozinho NÃO decide seções onde `minRole` é `SUPPORT`/`FINANCE`
 * (mesmo rank, papéis paralelos — ver docblock do módulo): por isso `permission`, quando
 * presente, é sempre checado também.
 */
export function canAccessNavSection(role: AdminRole, section: AdminNavSection): boolean {
  if (ROLE_RANK[role] < ROLE_RANK[section.minRole]) return false
  if (section.permission !== undefined && !hasPermission(role, section.permission)) return false
  return true
}

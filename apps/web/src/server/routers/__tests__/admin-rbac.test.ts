/**
 * Testes de `server/lib/admin/rbac.ts` — hierarquia (gate grosso, `requireRole`) e
 * conjunto de permissões (gate fino, `hasPermission`/`requirePermission`). Sem
 * Prisma/tRPC: as funções testadas só dependem de `{ session }`, então um objeto literal
 * já é o "duplo" inteiro — mesmo espírito de `billing-service.test.ts` (testar a lógica
 * pura, não a fiação do tRPC).
 *
 * O que este arquivo prova, em especial (é o núcleo da decisão de modelagem documentada
 * em `rbac.ts`): `SUPPORT` e `FINANCE` são PARALELOS, não uma escada linear.
 * `requireRole(ctx, 'SUPPORT')` aceita um ator `FINANCE` (mesmo rank, gate grosso) — mas
 * `requirePermission(ctx, 'users:plan:write')` RECUSA esse mesmo ator `FINANCE` (gate
 * fino, permissão exclusiva de SUPPORT). As duas verificações convivem de propósito.
 */
import { describe, expect, it } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  ADMIN_ROLES,
  getAdminRole,
  hasPermission,
  requirePermission,
  requireRole,
  type AdminRole,
} from '@/server/lib/admin/rbac'

function ctxFor(role: string | null): { session: { user: { id: string; role: string } } | null } {
  if (role === null) return { session: null }
  return { session: { user: { id: 'user-1', role } } }
}

describe('ADMIN_ROLES', () => {
  it('lista os 4 papéis de backoffice de docs/08 §D.1, sem CUSTOMER', () => {
    expect(ADMIN_ROLES).toEqual(['VIEWER', 'SUPPORT', 'FINANCE', 'ADMIN'])
  })
})

describe('getAdminRole', () => {
  it('UNAUTHORIZED sem sessão', () => {
    expect(() => getAdminRole(ctxFor(null))).toThrowError(TRPCError)
    try {
      getAdminRole(ctxFor(null))
    } catch (error) {
      expect((error as TRPCError).code).toBe('UNAUTHORIZED')
    }
  })

  it('FORBIDDEN com sessão mas papel fora do backoffice (CUSTOMER)', () => {
    try {
      getAdminRole(ctxFor('CUSTOMER'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('devolve o papel para qualquer um dos 4 papéis de backoffice', () => {
    for (const role of ADMIN_ROLES) {
      expect(getAdminRole(ctxFor(role))).toBe(role)
    }
  })
})

describe('requireRole — hierarquia (gate grosso)', () => {
  it('VIEWER passa em min:VIEWER mas não em min:SUPPORT/FINANCE/ADMIN', () => {
    expect(requireRole(ctxFor('VIEWER'), 'VIEWER')).toBe('VIEWER')
    expect(() => requireRole(ctxFor('VIEWER'), 'SUPPORT')).toThrowError(TRPCError)
    expect(() => requireRole(ctxFor('VIEWER'), 'FINANCE')).toThrowError(TRPCError)
    expect(() => requireRole(ctxFor('VIEWER'), 'ADMIN')).toThrowError(TRPCError)
  })

  it('SUPPORT passa em min:VIEWER e min:SUPPORT, mas não em min:ADMIN', () => {
    expect(requireRole(ctxFor('SUPPORT'), 'VIEWER')).toBe('SUPPORT')
    expect(requireRole(ctxFor('SUPPORT'), 'SUPPORT')).toBe('SUPPORT')
    expect(() => requireRole(ctxFor('SUPPORT'), 'ADMIN')).toThrowError(TRPCError)
  })

  it('SUPPORT e FINANCE dividem o mesmo rank — cada um passa em min do outro', () => {
    expect(requireRole(ctxFor('FINANCE'), 'SUPPORT')).toBe('FINANCE')
    expect(requireRole(ctxFor('SUPPORT'), 'FINANCE')).toBe('SUPPORT')
  })

  it('ADMIN passa em qualquer min', () => {
    for (const min of ADMIN_ROLES) {
      expect(requireRole(ctxFor('ADMIN'), min)).toBe('ADMIN')
    }
  })

  it('mensagem de erro cita o papel mínimo exigido e o papel do ator', () => {
    try {
      requireRole(ctxFor('VIEWER'), 'ADMIN')
      expect.unreachable()
    } catch (error) {
      expect((error as TRPCError).message).toContain('ADMIN')
      expect((error as TRPCError).message).toContain('VIEWER')
    }
  })
})

describe('hasPermission / requirePermission — conjunto de permissões (gate fino)', () => {
  it('VIEWER só lê métricas e listagens', () => {
    expect(hasPermission('VIEWER', 'metrics:read')).toBe(true)
    expect(hasPermission('VIEWER', 'users:list')).toBe(true)
    expect(hasPermission('VIEWER', 'users:detail')).toBe(false)
    expect(hasPermission('VIEWER', 'users:plan:write')).toBe(false)
  })

  it('SUPPORT tem as permissões de atendimento (detalhe, plano, trial, bloqueio, LGPD export)', () => {
    for (const permission of [
      'users:detail',
      'users:plan:write',
      'users:trial:grant',
      'users:block:write',
      'users:lgpd:export',
    ] as const) {
      expect(hasPermission('SUPPORT', permission)).toBe(true)
    }
  })

  it('FINANCE NÃO herda as permissões de atendimento do SUPPORT (papéis paralelos, não escada)', () => {
    expect(hasPermission('FINANCE', 'users:detail')).toBe(true) // precisa localizar o usuário p/ faturas
    expect(hasPermission('FINANCE', 'users:plan:write')).toBe(false)
    expect(hasPermission('FINANCE', 'users:trial:grant')).toBe(false)
    expect(hasPermission('FINANCE', 'users:block:write')).toBe(false)
    expect(hasPermission('FINANCE', 'users:lgpd:export')).toBe(false)
  })

  it('só ADMIN pode trocar papel ou anonimizar (LGPD)', () => {
    for (const role of ['VIEWER', 'SUPPORT', 'FINANCE'] as AdminRole[]) {
      expect(hasPermission(role, 'users:role:write')).toBe(false)
      expect(hasPermission(role, 'users:lgpd:anonymize')).toBe(false)
    }
    expect(hasPermission('ADMIN', 'users:role:write')).toBe(true)
    expect(hasPermission('ADMIN', 'users:lgpd:anonymize')).toBe(true)
  })

  it('ADMIN tem a união de tudo (SUPPORT ∪ FINANCE ∪ exclusivas)', () => {
    for (const permission of [
      'metrics:read',
      'users:list',
      'users:detail',
      'users:plan:write',
      'users:trial:grant',
      'users:block:write',
      'users:lgpd:export',
      'audit:read',
      'users:role:write',
      'users:lgpd:anonymize',
    ] as const) {
      expect(hasPermission('ADMIN', permission)).toBe(true)
    }
  })

  it('requirePermission lança FORBIDDEN quando o papel não tem a permissão', () => {
    expect(() => requirePermission(ctxFor('VIEWER'), 'users:detail')).toThrowError(TRPCError)
    try {
      requirePermission(ctxFor('FINANCE'), 'users:plan:write')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
      expect((error as TRPCError).message).toContain('users:plan:write')
    }
  })

  it('★ o núcleo da decisão: FINANCE passa no gate GROSSO de SUPPORT mas falha no gate FINO de SUPPORT', () => {
    const financeCtx = ctxFor('FINANCE')

    // Gate grosso (rank) — FINANCE e SUPPORT são o mesmo rank, então passa.
    expect(requireRole(financeCtx, 'SUPPORT')).toBe('FINANCE')

    // Gate fino (permissão) — mas FINANCE não tem a ação exclusiva de SUPPORT.
    expect(() => requirePermission(financeCtx, 'users:plan:write')).toThrowError(TRPCError)
  })

  it('requirePermission devolve o papel quando a permissão existe', () => {
    expect(requirePermission(ctxFor('SUPPORT'), 'users:plan:write')).toBe('SUPPORT')
    expect(requirePermission(ctxFor('ADMIN'), 'users:lgpd:anonymize')).toBe('ADMIN')
  })
})

/**
 * Regressão de segurança: como `ROLE_RANK[SUPPORT] === ROLE_RANK[FINANCE]`, o gate GROSSO
 * sozinho (`adminProcedure('FINANCE')` / `adminProcedure('SUPPORT')`) deixa os dois papéis
 * passarem um pelo território do outro. As permissões abaixo são o que de fato separa os dois
 * — se alguma delas voltar a ser concedida aos dois papéis, ou se um router de `admin/*`
 * deixar de chamar `requirePermission`, um agente de suporte volta a mexer em cobrança e um
 * analista financeiro volta a reprocessar conferência / ler a caixa de suporte.
 */
describe('separação SUPPORT × FINANCE nas permissões de território (regressão)', () => {
  it('financeiro (billing:read/write) é de FINANCE e ADMIN — nunca de SUPPORT ou VIEWER', () => {
    for (const permission of ['billing:read', 'billing:write'] as const) {
      expect(hasPermission('FINANCE', permission)).toBe(true)
      expect(hasPermission('ADMIN', permission)).toBe(true)
      expect(hasPermission('SUPPORT', permission)).toBe(false)
      expect(hasPermission('VIEWER', permission)).toBe(false)
    }
  })

  it('atendimento (support:read) e reprocessamento (checks:reprocess) são de SUPPORT e ADMIN — nunca de FINANCE ou VIEWER', () => {
    for (const permission of ['support:read', 'checks:reprocess'] as const) {
      expect(hasPermission('SUPPORT', permission)).toBe(true)
      expect(hasPermission('ADMIN', permission)).toBe(true)
      expect(hasPermission('FINANCE', permission)).toBe(false)
      expect(hasPermission('VIEWER', permission)).toBe(false)
    }
  })

  it('o gate grosso NÃO basta: FINANCE passa em requireRole("SUPPORT") mas falha em checks:reprocess', () => {
    const financeCtx = ctxFor('FINANCE')
    expect(requireRole(financeCtx, 'SUPPORT')).toBe('FINANCE')
    expect(() => requirePermission(financeCtx, 'checks:reprocess')).toThrowError(TRPCError)
  })

  it('o gate grosso NÃO basta: SUPPORT passa em requireRole("FINANCE") mas falha em billing:write', () => {
    const supportCtx = ctxFor('SUPPORT')
    expect(requireRole(supportCtx, 'FINANCE')).toBe('SUPPORT')
    expect(() => requirePermission(supportCtx, 'billing:write')).toThrowError(TRPCError)
  })
})

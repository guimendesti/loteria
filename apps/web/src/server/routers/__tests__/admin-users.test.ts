/**
 * Testes de `admin.users.toggleBlock` (BO-13) — bloqueio administrativo real.
 *
 * Mesmo padrão de `admin-config.test.ts`/`account.test.ts`: instância própria de
 * `initTRPC` (mesma config de `server/trpc.ts`) para `t.createCallerFactory` bater com o
 * `RootConfig`, e duplos mínimos de Prisma (só os métodos que cada teste realmente usa).
 *
 * O que este arquivo prova, especificamente:
 * - `toggleBlock` grava/limpa `User.blockedAt`/`blockedReason` de verdade (não mais
 *   `implemented: false` — a versão antiga só revogava sessão e nunca persistia nada).
 * - Idempotência nos dois sentidos: bloquear quem já está bloqueado preserva a data do
 *   PRIMEIRO bloqueio (não reseta o relógio); desbloquear quem já está desbloqueado não
 *   é erro.
 * - Guarda de auto-bloqueio (lockout), espelhando a de `anonymize` já existente.
 * - Sessões só são revogadas ao bloquear, nunca ao desbloquear.
 *
 * O gate "sessão bloqueada não passa em `protectedProcedure`/`adminProcedure`" é testado
 * à parte em `blocked-session-guard.test.ts` — este arquivo foca na mutation em si.
 */
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { adminUsersRouter } from '@/server/routers/admin/users'
import { toPaywallData, type Context } from '@/server/trpc'
import { BetValidationError, PaywallError } from '@/server/errors'

const testTRPC = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        betValidationErrors: error.cause instanceof BetValidationError ? error.cause.errors : null,
        paywall: error.cause instanceof PaywallError ? toPaywallData(error.cause.result) : null,
      },
    }
  },
})
const createCaller = testTRPC.createCallerFactory(adminUsersRouter)

const ADMIN_ID = 'admin-1'
const TARGET_USER_ID = 'user-target-1'

function buildContext(prismaStubs: Record<string, unknown>, actorRole: 'SUPPORT' | 'ADMIN' = 'ADMIN'): Context {
  return {
    prisma: prismaStubs as unknown as PrismaClient,
    session: {
      user: { id: ADMIN_ID, email: 'admin@example.com', name: 'Admin', role: actorRole },
      session: { id: 'session-1', token: 'tok', userId: ADMIN_ID },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('free')),
    ip: '203.0.113.9',
    userAgent: 'vitest',
  }
}

/** `user.update` calculado a partir de `data`, como o Postgres real faria. */
function buildStubs(initialBlockedAt: Date | null) {
  const findUnique = vi.fn().mockResolvedValue({ id: TARGET_USER_ID, blockedAt: initialBlockedAt })
  const update = vi.fn().mockImplementation(
    async ({ data }: { data: { blockedAt: Date | null; blockedReason: string | null } }) => ({
      id: TARGET_USER_ID,
      blockedAt: data.blockedAt,
      blockedReason: data.blockedReason,
    }),
  )
  const sessionDeleteMany = vi.fn().mockResolvedValue({ count: 2 })
  const auditCreate = vi.fn().mockResolvedValue({})

  return {
    stubs: {
      user: { findUnique, update },
      session: { deleteMany: sessionDeleteMany },
      auditLog: { create: auditCreate },
    },
    findUnique,
    update,
    sessionDeleteMany,
    auditCreate,
  }
}

describe('admin.users.toggleBlock — bloqueio administrativo real (BO-13)', () => {
  it('bloqueia: grava blockedAt/blockedReason, revoga sessões ativas, devolve o estado real (sem implemented:false)', async () => {
    const { stubs, update, sessionDeleteMany, auditCreate } = buildStubs(null)
    const caller = createCaller(buildContext(stubs))

    const result = await caller.toggleBlock({ userId: TARGET_USER_ID, blocked: true, reason: 'fraude confirmada' })

    expect(result).not.toHaveProperty('implemented')
    expect(result.blocked).toBe(true)
    expect(result.blockedAt).toBeInstanceOf(Date)
    expect(result.blockedReason).toBe('fraude confirmada')
    expect(result.sessionsRevoked).toBe(2)

    expect(update).toHaveBeenCalledWith({
      where: { id: TARGET_USER_ID },
      data: { blockedAt: expect.any(Date), blockedReason: 'fraude confirmada' },
      select: { id: true, blockedAt: true, blockedReason: true },
    })
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_USER_ID } })
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const auditData = auditCreate.mock.calls[0]?.[0]?.data as { action: string; ip: string; userAgent: string }
    expect(auditData.action).toBe('admin.user.blocked')
    expect(auditData.ip).toBe('203.0.113.9')
    expect(auditData.userAgent).toBe('vitest')
  })

  it('desbloqueia: limpa blockedAt/blockedReason e NÃO revoga sessão (nada para revogar)', async () => {
    const { stubs, update, sessionDeleteMany, auditCreate } = buildStubs(new Date('2026-08-01T00:00:00Z'))
    const caller = createCaller(buildContext(stubs))

    const result = await caller.toggleBlock({ userId: TARGET_USER_ID, blocked: false })

    expect(result.blocked).toBe(false)
    expect(result.blockedAt).toBeNull()
    expect(result.blockedReason).toBeNull()
    expect(update).toHaveBeenCalledWith({
      where: { id: TARGET_USER_ID },
      data: { blockedAt: null, blockedReason: null },
      select: { id: true, blockedAt: true, blockedReason: true },
    })
    expect(sessionDeleteMany).not.toHaveBeenCalled()

    const auditData = auditCreate.mock.calls[0]?.[0]?.data as { action: string }
    expect(auditData.action).toBe('admin.user.unblocked')
  })

  it('idempotente: bloquear quem já está bloqueado não lança erro e preserva a data do PRIMEIRO bloqueio', async () => {
    const firstBlockedAt = new Date('2026-07-15T12:00:00Z')
    const { stubs, update } = buildStubs(firstBlockedAt)
    const caller = createCaller(buildContext(stubs))

    const result = await caller.toggleBlock({ userId: TARGET_USER_ID, blocked: true, reason: 'novo motivo' })

    expect(result.blocked).toBe(true)
    // A data gravada é EXATAMENTE a original — não um `new Date()` desta chamada.
    expect(update).toHaveBeenCalledWith({
      where: { id: TARGET_USER_ID },
      data: { blockedAt: firstBlockedAt, blockedReason: 'novo motivo' },
      select: { id: true, blockedAt: true, blockedReason: true },
    })
  })

  it('idempotente: desbloquear quem já está desbloqueado não lança erro', async () => {
    const { stubs } = buildStubs(null)
    const caller = createCaller(buildContext(stubs))

    await expect(caller.toggleBlock({ userId: TARGET_USER_ID, blocked: false })).resolves.toMatchObject({
      blocked: false,
      blockedAt: null,
    })
  })

  it('recusa auto-bloqueio (lockout) — BAD_REQUEST, nunca chega a chamar o Prisma', async () => {
    const { stubs, findUnique, update } = buildStubs(null)
    const caller = createCaller(buildContext(stubs))

    await expect(
      caller.toggleBlock({ userId: ADMIN_ID, blocked: true, reason: 'teste' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(findUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('auto-DESBLOQUEIO não é bloqueado pela guarda (só o sentido perigoso é recusado)', async () => {
    const { stubs } = buildStubs(new Date('2026-07-01T00:00:00Z'))
    const caller = createCaller(buildContext(stubs))

    await expect(caller.toggleBlock({ userId: ADMIN_ID, blocked: false })).resolves.toMatchObject({
      blocked: false,
    })
  })

  it('404 quando o usuário não existe', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ user: { findUnique } }))

    await expect(
      caller.toggleBlock({ userId: 'inexistente', blocked: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('SUPPORT (não só ADMIN) pode bloquear — users:block:write é permissão de atendimento', async () => {
    const { stubs } = buildStubs(null)
    const caller = createCaller(buildContext(stubs, 'SUPPORT'))

    await expect(caller.toggleBlock({ userId: TARGET_USER_ID, blocked: true })).resolves.toMatchObject({
      blocked: true,
    })
  })

  it('VIEWER não tem permissão para bloquear — FORBIDDEN, nunca chega ao Prisma (gate grosso barra antes de qualquer query)', async () => {
    const { stubs, findUnique } = buildStubs(null)
    const viewerCtx = buildContext(stubs)
    ;(viewerCtx.session as unknown as { user: { role: string } }).user.role = 'VIEWER'
    const viewerCaller = createCaller(viewerCtx)

    await expect(viewerCaller.toggleBlock({ userId: TARGET_USER_ID, blocked: true })).rejects.toBeInstanceOf(
      TRPCError,
    )
    expect(findUnique).not.toHaveBeenCalled()
  })
})

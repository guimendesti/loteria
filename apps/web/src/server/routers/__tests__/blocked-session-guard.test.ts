/**
 * Testes de `protectedProcedure` (server/trpc.ts) — guarda de conta bloqueada (BO-13).
 *
 * Mesmo padrão de `account.test.ts`/`admin-config.test.ts`: instância própria de
 * `initTRPC` (mesma config de `server/trpc.ts`, replicada aqui porque `t` não é exportado)
 * para `t.createCallerFactory` bater com o `RootConfig` das procedures REAIS
 * (`protectedProcedure`/`adminProcedure`, importadas de verdade — nada reimplementado).
 *
 * Dois roteadores descartáveis, só para este arquivo, cada um com uma única procedure de
 * eco ("ping" → "pong"): isola a guarda de sessão bloqueada de qualquer lógica de negócio,
 * do mesmo jeito que `admin-rbac.test.ts` testa `requireRole`/`requirePermission` puros em
 * vez de rotear por um router de verdade.
 *
 * `adminProcedure(min)` é definido como `protectedProcedure.use(...)` (server/lib/admin/rbac.ts)
 * — o objetivo central deste arquivo é provar que, por causa dessa composição, o check de
 * bloqueio roda ANTES do gate de RBAC: um admin bloqueado toma FORBIDDEN pela mensagem de
 * CONTA BLOQUEADA, não pela de papel insuficiente, e nunca chega a ler `ctx.adminRole`.
 */
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { describe, expect, it } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { protectedProcedure, router, toPaywallData, type Context } from '@/server/trpc'
import { adminProcedure } from '@/server/lib/admin/rbac'
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

const pingRouter = router({ ping: protectedProcedure.query(() => 'pong') })
const adminPingRouter = router({ ping: adminProcedure('VIEWER').query(() => 'pong') })

const createPingCaller = testTRPC.createCallerFactory(pingRouter)
const createAdminPingCaller = testTRPC.createCallerFactory(adminPingRouter)

function buildContext(blockedAt: Date | null, role = 'CUSTOMER'): Context {
  return {
    prisma: {} as unknown as PrismaClient,
    session: {
      user: { id: 'user-1', email: 'user@example.com', name: 'Usuário', role, blockedAt },
      session: { id: 'session-1', token: 'tok', userId: 'user-1' },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('free')),
    ip: null,
    userAgent: null,
  }
}

describe('protectedProcedure — guarda de conta bloqueada (BO-13)', () => {
  it('sessão com blockedAt preenchido → FORBIDDEN', async () => {
    const caller = createPingCaller(buildContext(new Date()))
    await expect(caller.ping()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('mensagem em português, menciona "bloqueada" (sem detalhe de enumeração de contas)', async () => {
    const caller = createPingCaller(buildContext(new Date()))
    await expect(caller.ping()).rejects.toThrow(/bloqueada/i)
  })

  it('sessão sem bloqueio (blockedAt: null) passa normalmente', async () => {
    const caller = createPingCaller(buildContext(null))
    await expect(caller.ping()).resolves.toBe('pong')
  })

  it('sem sessão continua UNAUTHORIZED (comportamento pré-existente — a guarda nova não regride isto)', async () => {
    const ctx = buildContext(null)
    ;(ctx as unknown as { session: null }).session = null
    const caller = createPingCaller(ctx)
    await expect(caller.ping()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('adminProcedure — herda a mesma guarda (é `protectedProcedure.use(...)`, server/lib/admin/rbac.ts)', () => {
  it('admin bloqueado → FORBIDDEN mesmo com papel de backoffice válido (VIEWER)', async () => {
    const caller = createAdminPingCaller(buildContext(new Date(), 'VIEWER'))
    await expect(caller.ping()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('★ a mensagem é a de CONTA BLOQUEADA, não a de RBAC — prova que o check de protectedProcedure roda ANTES do gate de papel de adminProcedure', async () => {
    const caller = createAdminPingCaller(buildContext(new Date(), 'VIEWER'))
    await expect(caller.ping()).rejects.toThrow(/bloqueada/i)
  })

  it('admin desbloqueado com papel válido passa normalmente', async () => {
    const caller = createAdminPingCaller(buildContext(null, 'VIEWER'))
    await expect(caller.ping()).resolves.toBe('pong')
  })

  it('CUSTOMER (fora do backoffice) continua FORBIDDEN por RBAC mesmo sem bloqueio (regressão: a guarda nova não abre nem fecha nada no RBAC existente)', async () => {
    const caller = createAdminPingCaller(buildContext(null, 'CUSTOMER'))
    await expect(caller.ping()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

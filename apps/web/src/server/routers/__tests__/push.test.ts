/**
 * Testes do router `push` (P5, docs/08 SY-04) — foco no achado de auditoria (severidade
 * média) do `subscribe`: o upsert por `endpoint` pode REATRIBUIR a inscrição de um usuário
 * para outro (fluxo legítimo de dispositivo compartilhado — logout/login no mesmo
 * navegador), e isso precisa ficar registrado em `AuditLog`, nunca silencioso.
 *
 * Mesmo padrão de `account.test.ts`: instância própria de `initTRPC` (mesma config de
 * `server/trpc.ts` — transformer + errorFormatter) porque `t.createCallerFactory` exige que
 * o `RootConfig` bata exatamente, e `server/trpc.ts` não exporta seu `t`.
 */
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { pushRouter } from '@/server/routers/push'
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
const createCaller = testTRPC.createCallerFactory(pushRouter)

const SESSION_USER_ID = 'user-new'

function buildContext(prismaStubs: Record<string, unknown>, overrides: Partial<Context> = {}): Context {
  return {
    prisma: prismaStubs as unknown as PrismaClient,
    session: {
      user: { id: SESSION_USER_ID, email: 'user@example.com', name: 'Márcia', role: 'CUSTOMER' },
      session: { id: 'session-1', token: 'tok', userId: SESSION_USER_ID },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('free')),
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  }
}

describe('push.subscribe', () => {
  it('endpoint novo (sem dono anterior): cria a subscription e NÃO grava AuditLog', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const upsert = vi.fn().mockResolvedValue({ id: 'sub-1' })
    const auditCreate = vi.fn()
    const caller = createCaller(
      buildContext({
        pushSubscription: { findUnique, upsert },
        auditLog: { create: auditCreate },
      }),
    )

    const result = await caller.subscribe({
      endpoint: 'https://push.example.com/abc',
      p256dh: 'key-p256dh',
      auth: 'key-auth',
    })

    expect(result).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example.com/abc' },
        create: expect.objectContaining({ userId: SESSION_USER_ID }),
        update: expect.objectContaining({ userId: SESSION_USER_ID }),
      }),
    )
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('mesmo endpoint, mesmo dono (reenvio do browser): não é reatribuição, não grava AuditLog', async () => {
    const findUnique = vi.fn().mockResolvedValue({ userId: SESSION_USER_ID })
    const upsert = vi.fn().mockResolvedValue({ id: 'sub-1' })
    const auditCreate = vi.fn()
    const caller = createCaller(
      buildContext({
        pushSubscription: { findUnique, upsert },
        auditLog: { create: auditCreate },
      }),
    )

    await caller.subscribe({
      endpoint: 'https://push.example.com/abc',
      p256dh: 'key-p256dh',
      auth: 'key-auth',
    })

    expect(auditCreate).not.toHaveBeenCalled()
  })

  /**
   * ★ O caso central do achado de auditoria: endpoint já pertencia a OUTRO usuário
   * (dispositivo compartilhado — logout de A, login de B no mesmo navegador). A
   * reatribuição continua acontecendo (fluxo legítimo, nunca bloqueado), mas agora fica
   * registrada — com o dono ANTERIOR e o dono NOVO, mais IP/user-agent da requisição.
   */
  it('endpoint reatribuído de outro usuário: reatribui normalmente E grava AuditLog com before/after', async () => {
    const PREVIOUS_OWNER = 'user-old'
    const findUnique = vi.fn().mockResolvedValue({ userId: PREVIOUS_OWNER })
    const upsert = vi.fn().mockResolvedValue({ id: 'sub-shared-device' })
    const auditCreate = vi.fn().mockResolvedValue({})
    const caller = createCaller(
      buildContext({
        pushSubscription: { findUnique, upsert },
        auditLog: { create: auditCreate },
      }),
    )

    const result = await caller.subscribe({
      endpoint: 'https://push.example.com/shared-device',
      p256dh: 'new-p256dh',
      auth: 'new-auth',
    })

    expect(result).toEqual({ ok: true })
    // A reatribuição em si nunca é bloqueada — dispositivo compartilhado é fluxo legítimo.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ userId: SESSION_USER_ID, p256dh: 'new-p256dh', auth: 'new-auth' }),
      }),
    )

    expect(auditCreate).toHaveBeenCalledTimes(1)
    const call = auditCreate.mock.calls[0]?.[0] as {
      data: {
        action: string
        entityType: string
        entityId: string
        before: unknown
        after: unknown
        ip: string | null
        userAgent: string | null
      }
    }
    expect(call.data).toMatchObject({
      action: 'push.subscription_reassigned',
      entityType: 'PushSubscription',
      entityId: 'sub-shared-device',
      before: { userId: PREVIOUS_OWNER },
      after: { userId: SESSION_USER_ID },
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    })
  })

  it('reatribuição SEMPRE atualiza p256dh/auth junto com o novo userId — nunca mistura chaves antigas com dono novo', async () => {
    const findUnique = vi.fn().mockResolvedValue({ userId: 'user-old' })
    const upsert = vi.fn().mockResolvedValue({ id: 'sub-1' })
    const caller = createCaller(
      buildContext({
        pushSubscription: { findUnique, upsert },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }),
    )

    await caller.subscribe({
      endpoint: 'https://push.example.com/shared-device',
      p256dh: 'fresh-p256dh',
      auth: 'fresh-auth',
    })

    const updateArg = (upsert.mock.calls[0]?.[0] as { update: { userId: string; p256dh: string; auth: string } })
      .update
    expect(updateArg).toEqual({ userId: SESSION_USER_ID, p256dh: 'fresh-p256dh', auth: 'fresh-auth' })
  })
})

describe('push.unsubscribe', () => {
  it('deleteMany filtra por endpoint E userId — nunca apaga subscription de outro usuário', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 })
    const caller = createCaller(buildContext({ pushSubscription: { deleteMany } }))

    const result = await caller.unsubscribe({ endpoint: 'https://push.example.com/abc' })

    expect(result).toEqual({ ok: true })
    expect(deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example.com/abc', userId: SESSION_USER_ID },
    })
  })
})

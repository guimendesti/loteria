/**
 * Testes do router `account` (docs/08 §C.8): cripto da chave Pix (CL-102), guarda de
 * plano nas preferências de notificação (CL-103), seções do export (CL-108) e
 * anonimização na exclusão de conta (CL-109).
 *
 * Mesmo padrão de `entitlements.test.ts`: fakes mínimos de Prisma (só os métodos
 * realmente chamados por cada teste), tipados via `as unknown as PrismaClient`.
 *
 * As procedures são chamadas com `.createCallerFactory` — mas `@trpc/server` 11.18
 * (versão de fato instalada — `pnpm why @trpc/server`) não exporta essa função na raiz do
 * pacote, só via `t.createCallerFactory` (`t` = `initTRPC.context<...>().create()`).
 * `server/trpc.ts` não exporta seu `t` (só `router`, `protectedProcedure` etc.) e está
 * fora do território desta tarefa, então esta suíte cria sua PRÓPRIA instância `initTRPC`
 * — mas `t.createCallerFactory` só aceita um router cujo `RootConfig` (transformer +
 * forma do `errorFormatter`) bate EXATAMENTE com o do `t` que o chama (checado em tempo
 * de compilação). Por isso replicamos aqui a MESMA config de `server/trpc.ts`
 * (`transformer: superjson` + o mesmo `errorFormatter`, reimportando os mesmos helpers —
 * `toPaywallData`, `BetValidationError`, `PaywallError` — em vez de reescrever a lógica),
 * o que faz o `RootConfig` inferido bater e preserva a tipagem completa do caller
 * (autocomplete e checagem de input/output nas chamadas abaixo). Mesmo mecanismo que o
 * handler HTTP usa por baixo, sem precisar montar um servidor nem registrar o router em
 * `_app.ts`.
 */
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEntitlements } from '@lotopro/core'
import type { PrismaClient } from '@lotopro/db'
import { accountRouter, DELETE_ACCOUNT_CONFIRMATION_PHRASE } from '@/server/routers/account'
import { decryptSecret, encryptSecret } from '@/server/lib/crypto'
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
const createCaller = testTRPC.createCallerFactory(accountRouter)

const SESSION_USER_ID = 'user-1'

/** Contexto mínimo: só os métodos de Prisma que o teste realmente usa entram em `prismaStubs`. */
function buildContext(prismaStubs: Record<string, unknown>): Context {
  return {
    prisma: prismaStubs as unknown as PrismaClient,
    session: {
      user: { id: SESSION_USER_ID, email: 'user@example.com', name: 'Márcia' },
      session: { id: 'session-1', token: 'tok', userId: SESSION_USER_ID },
    } as unknown as Context['session'],
    getEntitlements: () => Promise.resolve(getEntitlements('premium')),
  }
}

beforeEach(() => {
  // 32 bytes fixos em base64 — determinístico entre execuções, só para o teste.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

// ─── Cripto da chave Pix (server/lib/crypto.ts) ──────────────────────────────────────

describe('encryptSecret / decryptSecret (AES-256-GCM)', () => {
  it('round-trip: decryptSecret(encryptSecret(x)) === x', () => {
    const plaintext = '12345678901'
    const encrypted = encryptSecret(plaintext)

    expect(encrypted).not.toBe(plaintext)
    expect(encrypted).not.toContain(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it('IV aleatório por chamada — o mesmo texto cifra para payloads diferentes', () => {
    const a = encryptSecret('chave-pix@example.com')
    const b = encryptSecret('chave-pix@example.com')

    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('chave-pix@example.com')
    expect(decryptSecret(b)).toBe('chave-pix@example.com')
  })

  it('lança se ENCRYPTION_KEY não estiver configurada (nunca grava em claro por fallback silencioso)', () => {
    const original = process.env.ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY

    expect(() => encryptSecret('x')).toThrow(/ENCRYPTION_KEY/)

    process.env.ENCRYPTION_KEY = original
  })

  it('lança se o payload cifrado for adulterado (tag de autenticação GCM não bate)', () => {
    const encrypted = encryptSecret('valor-secreto')
    const tampered = `${encrypted.slice(0, -4)}${encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`

    expect(() => decryptSecret(tampered)).toThrow()
  })
})

// ─── account.pixKey (CL-102) ──────────────────────────────────────────────────────────

describe('account.pixKey', () => {
  it('set cifra o valor e NUNCA devolve a chave em claro — só mascarada', async () => {
    const update = vi.fn().mockResolvedValue({})
    const caller = createCaller(buildContext({ user: { update } }))

    const result = await caller.pixKey.set({ type: 'EMAIL', value: 'organizador@example.com' })

    expect(result.masked).not.toContain('organizador@example.com')
    expect(result.masked).toMatch(/@example\.com$/)
    expect(JSON.stringify(result)).not.toContain('organizador@example.com')

    const savedData = (update.mock.calls[0]?.[0] as { data: { pixKeyEncrypted: string; pixKeyType: string } })
      .data
    expect(savedData.pixKeyEncrypted).not.toContain('organizador@example.com')
    expect(decryptSecret(savedData.pixKeyEncrypted)).toBe('organizador@example.com')
    expect(savedData.pixKeyType).toBe('EMAIL')
  })

  it('get decifra no servidor mas devolve só a máscara', async () => {
    const encrypted = encryptSecret('11122233344')
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ pixKeyEncrypted: encrypted, pixKeyType: 'CPF' })
    const caller = createCaller(buildContext({ user: { findUniqueOrThrow } }))

    const result = await caller.pixKey.get()

    expect(result).toEqual({ configured: true, type: 'CPF', masked: '•••••••3344' })
    expect(JSON.stringify(result)).not.toContain('11122233344')
  })

  it('get sem chave configurada devolve configured:false, sem tentar decifrar nada', async () => {
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ pixKeyEncrypted: null, pixKeyType: null })
    const caller = createCaller(buildContext({ user: { findUniqueOrThrow } }))

    const result = await caller.pixKey.get()

    expect(result).toEqual({ configured: false, type: null, masked: null })
  })

  it('set rejeita CPF com quantidade errada de dígitos, sem chegar a chamar o Prisma', async () => {
    const update = vi.fn()
    const caller = createCaller(buildContext({ user: { update } }))

    await expect(caller.pixKey.set({ type: 'CPF', value: '123' })).rejects.toBeInstanceOf(TRPCError)
    expect(update).not.toHaveBeenCalled()
  })

  it('remove limpa a chave e o tipo', async () => {
    const update = vi.fn().mockResolvedValue({})
    const caller = createCaller(buildContext({ user: { update } }))

    const result = await caller.pixKey.remove()

    expect(result).toEqual({ configured: false, type: null, masked: null })
    expect(update).toHaveBeenCalledWith({
      where: { id: SESSION_USER_ID },
      data: { pixKeyEncrypted: null, pixKeyType: null },
    })
  })
})

// ─── account.notificationPreferences (CL-103) — guarda de plano ─────────────────────

describe('account.notificationPreferences.update — guarda de plano no servidor', () => {
  const baseInput = {
    emailEnabled: true,
    pushEnabled: true,
    whatsappEnabled: true,
    onlyWhenPrized: false,
    accumulatedThresholdCents: null,
    cutoffReminder: true,
    marketingOptIn: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  } as const

  it('bloqueia WhatsApp fora do plano Pro (G10), mesmo que o cliente mande whatsappEnabled:true', async () => {
    const upsert = vi.fn()
    const ctx = buildContext({ notificationPreference: { upsert } })
    ctx.getEntitlements = () => Promise.resolve(getEntitlements('free'))
    const caller = createCaller(ctx)

    await expect(caller.notificationPreferences.update(baseInput)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('permite WhatsApp no plano Pro e grava as preferências', async () => {
    const upsert = vi.fn().mockResolvedValue({ ...baseInput, id: 'pref-1', userId: SESSION_USER_ID })
    const ctx = buildContext({ notificationPreference: { upsert } })
    ctx.getEntitlements = () => Promise.resolve(getEntitlements('pro'))
    const caller = createCaller(ctx)

    const result = await caller.notificationPreferences.update(baseInput)

    expect(result.whatsappEnabled).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('get sem preferências salvas ainda devolve os defaults do schema (sem criar linha)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null)
    const caller = createCaller(buildContext({ notificationPreference: { findUnique } }))

    const result = await caller.notificationPreferences.get()

    expect(result).toEqual({
      emailEnabled: true,
      pushEnabled: true,
      whatsappEnabled: false,
      onlyWhenPrized: false,
      accumulatedThresholdCents: null,
      cutoffReminder: true,
      marketingOptIn: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    })
  })
})

// ─── account.exportData (CL-108) ─────────────────────────────────────────────────────

describe('account.exportData — LGPD, portabilidade de dados', () => {
  function buildExportContext(overrides: {
    pool?: unknown[]
    poolMember?: unknown[]
    subscription?: unknown
  }) {
    return buildContext({
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: SESSION_USER_ID }) },
      bet: { findMany: vi.fn().mockResolvedValue([{ id: 'bet-1' }]) },
      betCheck: { findMany: vi.fn().mockResolvedValue([{ id: 'check-1' }]) },
      pool: { findMany: vi.fn().mockResolvedValue(overrides.pool ?? []) },
      poolMember: { findMany: vi.fn().mockResolvedValue(overrides.poolMember ?? []) },
      subscription: { findUnique: vi.fn().mockResolvedValue(overrides.subscription ?? null) },
    })
  }

  it('retorna as 5 seções esperadas: perfil, apostas, conferencias, boloes, faturas', async () => {
    const caller = createCaller(
      buildExportContext({
        pool: [{ id: 'pool-1' }],
        poolMember: [{ id: 'member-1' }],
        subscription: { invoices: [{ id: 'inv-1' }] },
      }),
    )

    const result = await caller.exportData()

    expect(result).toHaveProperty('geradoEm')
    expect(result.geradoEm).toBeInstanceOf(Date)
    expect(result.perfil).toEqual({ id: SESSION_USER_ID })
    expect(result.apostas).toEqual([{ id: 'bet-1' }])
    expect(result.conferencias).toEqual([{ id: 'check-1' }])
    expect(result.boloes).toEqual({ organizador: [{ id: 'pool-1' }], participante: [{ id: 'member-1' }] })
    expect(result.faturas).toEqual([{ id: 'inv-1' }])
  })

  it('faturas vazio quando o usuário nunca assinou (sem Subscription)', async () => {
    const caller = createCaller(buildExportContext({}))

    const result = await caller.exportData()

    expect(result.faturas).toEqual([])
  })

  it('nunca expõe PII de outros usuários: bolões que o usuário organiza não selecionam nome/telefone/id de outros membros', async () => {
    const findManyPool = vi.fn().mockResolvedValue([])
    const ctx = buildExportContext({})
    ;(ctx.prisma as unknown as { pool: { findMany: typeof findManyPool } }).pool = { findMany: findManyPool }
    const caller = createCaller(ctx)

    await caller.exportData()

    const call = findManyPool.mock.calls[0]?.[0] as {
      select: { members: { select: Record<string, unknown> } }
    }
    const membersSelect = call.select.members.select
    expect(membersSelect).not.toHaveProperty('userId')
    expect(membersSelect).not.toHaveProperty('guestName')
    expect(membersSelect).not.toHaveProperty('guestPhone')
  })

  it('nunca expõe PII de outros usuários: bolões em que o usuário é membro só trazem a própria participação (filtra por dono != usuário)', async () => {
    const findManyPoolMember = vi.fn().mockResolvedValue([])
    const ctx = buildExportContext({})
    ;(ctx.prisma as unknown as { poolMember: { findMany: typeof findManyPoolMember } }).poolMember = {
      findMany: findManyPoolMember,
    }
    const caller = createCaller(ctx)

    await caller.exportData()

    expect(findManyPoolMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: SESSION_USER_ID, pool: { ownerId: { not: SESSION_USER_ID } } },
      }),
    )
  })
})

// ─── account.deleteAccount (CL-109) — anonimização, LGPD ────────────────────────────

describe('account.deleteAccount — anonimiza sem deletar linhas (LGPD)', () => {
  it('exige a frase de confirmação exata', async () => {
    const caller = createCaller(buildContext({}))

    await expect(caller.deleteAccount({ confirmation: 'frase errada' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('rejeita se a conta já foi excluída antes (deletedAt já setado)', async () => {
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ deletedAt: new Date('2026-01-01T00:00:00Z') })
    const caller = createCaller(buildContext({ user: { findUniqueOrThrow } }))

    await expect(
      caller.deleteAccount({ confirmation: DELETE_ACCOUNT_CONFIRMATION_PHRASE }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('anonimiza PII (e-mail/nome/telefone/avatar/chave Pix), carimba deletedAt e SÓ ISSO — nunca deleta a linha do usuário', async () => {
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ deletedAt: null })
    const userUpdate = vi.fn().mockReturnValue('USER_UPDATE_OP')
    const prefUpdateMany = vi.fn().mockReturnValue('PREF_UPDATE_OP')
    const accountDeleteMany = vi.fn().mockReturnValue('ACCOUNT_DELETE_OP')
    const sessionDeleteMany = vi.fn().mockReturnValue('SESSION_DELETE_OP')
    const transaction = vi.fn(async (ops: unknown[]) => ops)

    const caller = createCaller(
      buildContext({
        user: { findUniqueOrThrow, update: userUpdate },
        notificationPreference: { updateMany: prefUpdateMany },
        account: { deleteMany: accountDeleteMany },
        session: { deleteMany: sessionDeleteMany },
        $transaction: transaction,
      }),
    )

    const result = await caller.deleteAccount({ confirmation: DELETE_ACCOUNT_CONFIRMATION_PHRASE })

    expect(result.anonymizedEmail).toBe(`deleted+${SESSION_USER_ID}@lotopro.invalid`)

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_USER_ID },
      data: {
        email: `deleted+${SESSION_USER_ID}@lotopro.invalid`,
        name: 'Usuário removido',
        phone: null,
        avatarUrl: null,
        image: null,
        pixKeyEncrypted: null,
        pixKeyType: null,
        deletedAt: result.deletedAt,
      },
    })
    expect(prefUpdateMany).toHaveBeenCalledWith({
      where: { userId: SESSION_USER_ID },
      data: { marketingOptIn: false },
    })

    // "encerra sessões" (CL-109): credencial/OAuth (Account) e sessões ativas (Session)
    // são apagadas — nenhuma chamada a Bet/BetCheck/Pool/PoolMember/Invoice acontece
    // (o fake de Prisma nem define esses métodos: se o código tentasse tocar neles, a
    // chamada quebraria e este teste falharia).
    expect(accountDeleteMany).toHaveBeenCalledWith({ where: { userId: SESSION_USER_ID } })
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: SESSION_USER_ID } })

    // As 4 operações são atômicas: uma única chamada a `$transaction` com as 4 juntas.
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0]?.[0]).toEqual([
      'USER_UPDATE_OP',
      'PREF_UPDATE_OP',
      'ACCOUNT_DELETE_OP',
      'SESSION_DELETE_OP',
    ])
  })
})

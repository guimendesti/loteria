/**
 * Testes de `rejectBlockedUserSession` (lib/auth.ts) — guarda usada em
 * `databaseHooks.session.create.before` do Better Auth (BO-13): impede que uma conta
 * bloqueada (`User.blockedAt` preenchido) ganhe uma sessão NOVA, ou seja, impede o LOGIN
 * em si (e-mail/senha ou Google) — diferente de `protectedProcedure`
 * (server/trpc.ts), que barra uma sessão que JÁ existe.
 *
 * Testada isolada da fiação do Better Auth/Postgres reais, mesmo espírito de
 * `server/lib/admin/audit.ts` (`AuditPrisma`) e `admin/bets.ts` (`AdminReprocessPrisma`):
 * a função recebe uma porta mínima de Prisma (`BlockGuardPrisma`, só `user.findUnique`) e
 * um duplo em memória basta.
 */
import { APIError } from 'better-auth'
import { describe, expect, it, vi } from 'vitest'
import { rejectBlockedUserSession, type BlockGuardPrisma } from '@/lib/auth'

function fakePrisma(blockedAt: Date | null | undefined): BlockGuardPrisma {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(blockedAt === undefined ? null : { blockedAt }),
    },
  }
}

describe('rejectBlockedUserSession', () => {
  it('resolve sem lançar quando a conta não está bloqueada (blockedAt: null)', async () => {
    await expect(rejectBlockedUserSession(fakePrisma(null), { userId: 'user-1' })).resolves.toBeUndefined()
  })

  it('lança APIError(FORBIDDEN) quando a conta está bloqueada (blockedAt preenchido)', async () => {
    const prisma = fakePrisma(new Date('2026-08-01T00:00:00Z'))

    await expect(rejectBlockedUserSession(prisma, { userId: 'user-1' })).rejects.toBeInstanceOf(APIError)

    try {
      await rejectBlockedUserSession(prisma, { userId: 'user-1' })
      expect.unreachable()
    } catch (error) {
      const apiError = error as APIError
      expect(apiError.status).toBe('FORBIDDEN')
      expect(apiError.body?.message).toMatch(/login/i)
    }
  })

  it('a mensagem NÃO revela que a causa é "bloqueado" — defesa contra enumeração de contas no endpoint de login', async () => {
    const prisma = fakePrisma(new Date())

    try {
      await rejectBlockedUserSession(prisma, { userId: 'user-1' })
      expect.unreachable()
    } catch (error) {
      const apiError = error as APIError
      expect(apiError.body?.message?.toLowerCase()).not.toContain('bloque')
    }
  })

  it('consulta o Prisma pelo userId da SESSÃO sendo criada, não um id fixo', async () => {
    const findUnique = vi.fn().mockResolvedValue({ blockedAt: null })
    const prisma: BlockGuardPrisma = { user: { findUnique } }

    await rejectBlockedUserSession(prisma, { userId: 'user-42' })

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-42' }, select: { blockedAt: true } })
  })

  it('trata usuário inexistente (findUnique devolve null) como não-bloqueado — não é papel deste guard validar existência', async () => {
    await expect(rejectBlockedUserSession(fakePrisma(undefined), { userId: 'fantasma' })).resolves.toBeUndefined()
  })
})

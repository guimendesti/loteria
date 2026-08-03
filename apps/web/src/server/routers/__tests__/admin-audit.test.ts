/**
 * Testes de `server/lib/admin/audit.ts` — `writeAudit` grava os campos certos em
 * `AuditLog`, sem Prisma de verdade (duplo em memória para a porta `AuditPrisma`, mesmo
 * padrão de `billing-service.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { writeAudit, type AuditLogCreateData, type AuditLogRow, type AuditPrisma } from '@/server/lib/admin/audit'

function createFakeAuditPrisma(): { prisma: AuditPrisma; rows: AuditLogRow[] } {
  const rows: AuditLogRow[] = []
  let sequence = 0

  const prisma: AuditPrisma = {
    auditLog: {
      create: async ({ data }: { data: AuditLogCreateData }) => {
        sequence += 1
        const row: AuditLogRow = {
          id: `audit-${sequence}`,
          actorId: data.actorId ?? null,
          actorRole: data.actorRole ?? null,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          before: data.before ?? null,
          after: data.after ?? null,
          ip: data.ip ?? null,
          userAgent: data.userAgent ?? null,
          createdAt: new Date('2026-08-02T15:00:00Z'),
        }
        rows.push(row)
        return row
      },
    },
  }

  return { prisma, rows }
}

describe('writeAudit', () => {
  it('grava os campos obrigatórios (ator, ação, entidade)', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    const result = await writeAudit(prisma, {
      actorId: 'admin-1',
      actorRole: 'SUPPORT',
      action: 'admin.user.plan_changed',
      entityType: 'User',
      entityId: 'user-42',
    })

    expect(rows).toHaveLength(1)
    expect(result).toMatchObject({
      actorId: 'admin-1',
      actorRole: 'SUPPORT',
      action: 'admin.user.plan_changed',
      entityType: 'User',
      entityId: 'user-42',
    })
  })

  it('carrega before/after como JSON — usado para o antes/depois da ação e metadados (ex.: justificativa)', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    await writeAudit(prisma, {
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      action: 'admin.user.role_changed',
      entityType: 'User',
      entityId: 'user-42',
      before: { role: 'VIEWER' },
      after: { role: 'SUPPORT', reason: 'Promovido para o time de atendimento.' },
    })

    expect(rows[0]?.before).toEqual({ role: 'VIEWER' })
    expect(rows[0]?.after).toEqual({ role: 'SUPPORT', reason: 'Promovido para o time de atendimento.' })
  })

  it('aceita actorId/actorRole nulos (ação de sistema, sem ator humano)', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    await writeAudit(prisma, {
      actorId: null,
      actorRole: null,
      action: 'system.cleanup',
      entityType: 'Notification',
      entityId: 'notif-1',
    })

    expect(rows[0]?.actorId).toBeNull()
    expect(rows[0]?.actorRole).toBeNull()
  })

  it('não grava before/after/ip/userAgent quando o chamador não informa (fica null, não undefined explícito)', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    await writeAudit(prisma, {
      actorId: 'admin-1',
      actorRole: 'FINANCE',
      action: 'admin.user.data_exported',
      entityType: 'User',
      entityId: 'user-7',
    })

    expect(rows[0]?.before).toBeNull()
    expect(rows[0]?.after).toBeNull()
    expect(rows[0]?.ip).toBeNull()
    expect(rows[0]?.userAgent).toBeNull()
  })

  it('grava ip/userAgent quando informados', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    await writeAudit(prisma, {
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      action: 'admin.user.anonymized',
      entityType: 'User',
      entityId: 'user-7',
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    })

    expect(rows[0]).toMatchObject({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0' })
  })

  it('trunca userAgent em 256 caracteres — um header forjado/gigante nunca estoura a coluna', async () => {
    const { prisma, rows } = createFakeAuditPrisma()
    const giant = 'A'.repeat(1000)

    await writeAudit(prisma, {
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      action: 'admin.user.anonymized',
      entityType: 'User',
      entityId: 'user-7',
      userAgent: giant,
    })

    expect(rows[0]?.userAgent).toHaveLength(256)
    expect(rows[0]?.userAgent).toBe('A'.repeat(256))
  })

  it('cada chamada gera uma linha nova (nunca faz upsert/atualiza uma existente)', async () => {
    const { prisma, rows } = createFakeAuditPrisma()

    await writeAudit(prisma, { actorId: 'a', actorRole: 'ADMIN', action: 'x', entityType: 'User', entityId: '1' })
    await writeAudit(prisma, { actorId: 'a', actorRole: 'ADMIN', action: 'y', entityType: 'User', entityId: '1' })

    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).not.toBe(rows[1]?.id)
  })
})

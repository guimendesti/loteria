/**
 * Router `admin.support` — docs/08 §D.7 (BO-50 caixa de mensagens, BO-51 histórico de
 * notificações de um usuário).
 *
 * ⚠️ DECISÃO DOCUMENTADA — BO-50 pede uma "caixa de mensagens de contato", mas NÃO existe
 * tabela de tickets/mensagens de contato no schema (`packages/db/prisma/schema.prisma`): a
 * página pública `/contato` (docs/08 LP-14) usa `mailto:`, então nenhum formulário grava
 * nada no banco hoje. `messages.list` é um substituto: junta (a) `Notification` com
 * `status = FAILED` (canais que o sistema tentou entregar e não conseguiu — o tipo de coisa
 * que vira reclamação de "não recebi") com (b) os `AuditLog` mais recentes (ações
 * administrativas recentes, para dar contexto de "o que mudou por aqui"). Isso NÃO substitui
 * uma tabela de tickets de verdade — é uma aproximação para o time de suporte ter algo para
 * triagem enquanto BO-50 não ganha uma tabela dedicada (`ContactMessage`/`Ticket`, fora do
 * território desta tarefa: schema.prisma é `packages/*`, território de outra onda).
 */
import { z } from 'zod'
import { NotificationStatus, UserRole } from '@lotopro/db'
import { router } from '@/server/trpc'
import { adminProcedure } from '@/server/lib/admin/rbac'

const messagesListInput = z.object({
  notificationsLimit: z.number().int().min(1).max(100).default(30),
  auditLimit: z.number().int().min(1).max(100).default(30),
})

const userNotificationsInput = z.object({
  userId: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30),
})

export const adminSupportRouter = router({
  /**
   * BO-50 — "caixa de suporte" aproximada (ver cabeçalho): notificações que falharam +
   * eventos recentes de auditoria. Sem paginação por cursor (dois feeds heterogêneos) —
   * só os N mais recentes de cada, o suficiente para triagem.
   */
  messages: router({
    list: adminProcedure(UserRole.SUPPORT).input(messagesListInput).query(async ({ ctx, input }) => {
      const [failedNotifications, recentAuditEvents] = await Promise.all([
        ctx.prisma.notification.findMany({
          where: { status: NotificationStatus.FAILED },
          orderBy: { createdAt: 'desc' },
          take: input.notificationsLimit,
        }),
        ctx.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: input.auditLimit,
        }),
      ])

      return { failedNotifications, recentAuditEvents }
    }),
  }),

  /** BO-51 — histórico de notificações de UM usuário, para depurar "não recebi". */
  userNotifications: adminProcedure(UserRole.SUPPORT).input(userNotificationsInput).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.notification.findMany({
      where: { userId: input.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    })

    let nextCursor: string | undefined
    if (rows.length > input.limit) nextCursor = rows.pop()?.id

    return { items: rows, nextCursor }
  }),
})

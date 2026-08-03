/**
 * Router `push` — assinatura de Web Push do navegador (P5, docs/08 SY-04 / docs/09 §9.6).
 *
 * Sem isso, `PushSubscription` (packages/db) nunca é populada e o canal PUSH de
 * `apps/worker/jobs/notify.ts` nunca tem destinatário (`pushSubscription.findMany` sempre
 * devolve `[]`) — este router é o único jeito de o navegador registrar um endpoint. O
 * cliente (`components/PushOptIn.tsx` + `components/use-push-subscription.ts`) chama
 * `publicKey` para montar a `applicationServerKey`, depois `subscribe` com o resultado de
 * `pushManager.subscribe()`.
 *
 * Não registrado em `_app.ts` (território de outro agente nesta onda) — ver a linha exata
 * de registro no relatório desta tarefa.
 */
import { z } from 'zod'
import { protectedProcedure, publicProcedure, router } from '@/server/trpc'
import { writeAudit } from '@/server/lib/admin/audit'

const subscribeInput = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  /** `navigator.userAgent` do dispositivo — só para depuração/suporte, nunca obrigatório. */
  userAgent: z.string().max(500).optional(),
})

const unsubscribeInput = z.object({
  endpoint: z.string().url(),
})

export const pushRouter = router({
  /**
   * Chave pública VAPID (`VAPID_PUBLIC_KEY`, já existe em produção — ver
   * `apps/worker/src/config.ts`, mesma env, par da chave privada usada por `WebPushSender`).
   * `publicProcedure`: a chave PÚBLICA do VAPID não é segredo (é, por definição, a metade
   * pública do par) — expô-la sem sessão simplifica o cliente (não precisa esperar auth
   * resolver antes de montar `applicationServerKey`). `null` quando a env não está
   * configurada (dev sem VAPID) — o cliente trata isso escondendo o botão de opt-in.
   */
  publicKey: publicProcedure.query(() => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null }
  }),

  /**
   * Upsert por `endpoint` (`@unique` no schema — packages/db/prisma/schema.prisma). O
   * mesmo endpoint pode ser reenviado pelo browser (ex.: o usuário reabre o app com uma
   * subscription já ativa) — upsert evita duplicar linha e realinha `userId` para a sessão
   * atual (relevante se o endpoint sobreviveu a um logout/login de outra conta no mesmo
   * navegador/perfil).
   *
   * ⚠️ TRADEOFF DELIBERADO (achado de auditoria, severidade média): reatribuir `userId` por
   * `endpoint` é INTENCIONAL — é o único jeito de suportar dispositivo compartilhado
   * (logout de A, login de B, no MESMO navegador: o endpoint do Service Worker é o mesmo,
   * só quem está logado mudou). Bloquear a reatribuição quebraria esse fluxo legítimo. O
   * problema não era a troca em si, era ela ser SILENCIOSA — sem rastro de quem "roubou" a
   * inscrição de quem. Agora toda reatribuição real (endpoint já pertencia a OUTRO usuário)
   * gera uma linha em `AuditLog`. `update` abaixo sempre grava `p256dh`/`auth` do input
   * JUNTO com o novo `userId` (nunca em chamadas separadas) — as chaves de criptografia do
   * Web Push nunca ficam "órfãs", misturando o dono novo com o par de chaves antigo.
   */
  subscribe: protectedProcedure.input(subscribeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id

    const existing = await ctx.prisma.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
      select: { userId: true },
    })

    const subscription = await ctx.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      },
      update: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      },
    })

    if (existing && existing.userId !== userId) {
      await writeAudit(ctx.prisma, {
        actorId: userId,
        actorRole: ctx.session.user.role,
        action: 'push.subscription_reassigned',
        entityType: 'PushSubscription',
        entityId: subscription.id,
        before: { userId: existing.userId },
        after: { userId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      })
    }

    return { ok: true } as const
  }),

  /**
   * `deleteMany` (não `delete`): idempotente — chamar duas vezes (ex.: o usuário clica
   * "desativar" e a chamada anterior já tinha ido, ou `apps/worker/jobs/notify.ts` já
   * apagou a mesma linha por subscription morta, P4a) não lança. Filtra por `userId`
   * também: nunca apaga a subscription de outro usuário, mesmo que o cliente mande um
   * `endpoint` que não é seu.
   */
  unsubscribe: protectedProcedure.input(unsubscribeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    await ctx.prisma.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId } })
    return { ok: true } as const
  }),
})

export type PushRouter = typeof pushRouter

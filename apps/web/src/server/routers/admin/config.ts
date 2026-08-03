/**
 * Router `admin.config` — docs/08 §D.6 (BO-40 CRUD leitura/campos seguros de modalidade,
 * BO-41 backfill/re-sync, BO-42 correção manual de concurso).
 *
 * `lotteries.update` só aceita os campos "de operação" (`isActive`, `displayOrder`,
 * `colorToken`) — universo, picks, formato, faixas de preço/premiação são DADO DO CORE
 * (`packages/core/src/lottery/configs.ts`, CLAUDE.md §6: "modalidade é dado", mas o dado
 * canônico hoje é o catálogo estático do core, não a tabela `lotteries`; ver nota em
 * `lotteries.list`). Editar isso pela UI do backoffice ainda não é um caminho seguro —
 * mudar `picksMin`/`universeMax` sem revisar `packages/core` e as migrações associadas
 * quebraria validação, precificação e conferência silenciosamente.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import Redis from 'ioredis'
import { Queue } from 'bullmq'
import { getLotteryConfig, type LotterySlug } from '@lotopro/core'
import { Prisma, UserRole } from '@lotopro/db'
import { router } from '@/server/trpc'
import { lotterySlugSchema } from '@/server/lib/lottery-schema'
import { adminProcedure } from '@/server/lib/admin/rbac'
import { writeAudit } from '@/server/lib/admin/audit'
import {
  createAdminReprocessPrismaAdapter,
  reprocessContestScope,
  type ContestRow,
} from '@/server/routers/admin/bets'

// ─── BO-41 — enfileira re-sync no BullMQ do worker ─────────────────────────────────────────
//
// `apps/web` e `apps/worker` são processos SEPARADOS (docs/06 §6.6) — não dá para chamar o
// job do sync diretamente. A via ESCOLHIDA aqui é enfileirar na MESMA fila BullMQ que o
// worker já consome (`sync-results`, ver `apps/worker/src/queues.ts` `QUEUE_NAMES.SYNC_RESULTS`
// e `syncResultsJobSchema`) — o nome da fila e o formato do payload são duplicados aqui
// porque `apps/worker` não é um pacote importável (é outro app, mesma restrição documentada
// em `admin/bets.ts`). Alternativa descartada: gravar só uma "flag" (ex.: em `FeatureFlag`)
// — funcionaria como registro de intenção, mas exigiria o worker fazer POLLING de uma tabela
// que hoje ninguém lê, ou seja, na prática não dispararia nada; enfileirar de verdade é o
// único caminho que o worker atual já sabe consumir.
const SYNC_RESULTS_QUEUE_NAME = 'sync-results'

interface SyncResultsJobPayload {
  triggeredAt: string
  reason: 'schedule' | 'manual'
  lotterySlugs?: string[]
}

// Mesmo padrão do singleton de `prisma` (packages/db/src/index.ts): campo em `globalThis`
// tipado como `T | undefined` (NÃO uma propriedade opcional `?:` — `exactOptionalPropertyTypes`
// proíbe atribuir `undefined` explícito a chaves opcionais, e `??=` simplificado esbarra nisso).
const globalForResyncQueue = globalThis as unknown as {
  lotoproResyncQueue: Queue<SyncResultsJobPayload> | undefined
}

/**
 * Conexão/fila são criadas uma vez por processo. Sem cache de Promise (diferente do padrão
 * `entitlementsPromise` de `server/trpc.ts`): esta função é chamada raramente (ação manual de
 * admin, não hot path), então o pior caso de duas chamadas concorrentes na primeira invocação
 * — duas conexões Redis abertas — é aceitável em troca de não lidar com cache de promise
 * rejeitada (env ausente) atravessando `exactOptionalPropertyTypes`.
 */
async function getResyncQueue(): Promise<Queue<SyncResultsJobPayload>> {
  if (globalForResyncQueue.lotoproResyncQueue) return globalForResyncQueue.lotoproResyncQueue

  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'REDIS_URL não configurado neste ambiente — não é possível enfileirar o re-sync.',
    })
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
  await connection.connect()
  const queue = new Queue<SyncResultsJobPayload>(SYNC_RESULTS_QUEUE_NAME, { connection })
  globalForResyncQueue.lotoproResyncQueue = queue
  return queue
}

async function enqueueSyncResults(lotterySlug: string): Promise<string | undefined> {
  const queue = await getResyncQueue()
  const job = await queue.add(SYNC_RESULTS_QUEUE_NAME, {
    triggeredAt: new Date().toISOString(),
    reason: 'manual',
    lotterySlugs: [lotterySlug],
  } satisfies SyncResultsJobPayload)
  return job.id
}

// ─── Router ────────────────────────────────────────────────────────────────────────────

const lotteriesUpdateInput = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  colorToken: z.string().min(1).optional(),
})

const resyncInput = z.object({ lotterySlug: lotterySlugSchema })

const fixContestInput = z.object({
  contestId: z.string().min(1),
  numbers: z.array(z.number().int()).min(1),
  numbersDrawOrder: z.array(z.number().int()).optional(),
  secondaryNumbers: z.array(z.number().int()).optional(),
})

const contestSelectForReprocess = {
  id: true,
  number: true,
  drawDate: true,
  numbers: true,
  numbersDrawOrder: true,
  secondaryNumbers: true,
  extraResult: true,
  isAccumulated: true,
  collectedCents: true,
  accumulatedNextCents: true,
  estimatedNextCents: true,
  rawPayload: true,
  prizes: { select: { tier: true, label: true, winnersCount: true, prizeCents: true } },
} satisfies Prisma.ContestSelect

export const adminConfigRouter = router({
  lotteries: router({
    /**
     * BO-40 — leitura completa (inclui universo/picks/faixas de preço e premiação, todos
     * READ-ONLY aqui — fonte é `packages/core/src/lottery/configs.ts`, não esta listagem).
     */
    list: adminProcedure(UserRole.VIEWER).query(async ({ ctx }) => {
      const rows = await ctx.prisma.lottery.findMany({ orderBy: { displayOrder: 'asc' } })
      return rows.map((row) => {
        const coreConfig = (() => {
          try {
            return getLotteryConfig(row.slug as LotterySlug)
          } catch {
            return null
          }
        })()
        return { ...row, coreConfig }
      })
    }),

    /** BO-40 — só os campos "de operação" (docs no cabeçalho do arquivo). ADMIN apenas. */
    update: adminProcedure(UserRole.ADMIN).input(lotteriesUpdateInput).mutation(async ({ ctx, input }) => {
      const actor = ctx.session.user
      const existing = await ctx.prisma.lottery.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Modalidade não encontrada.' })

      const data: Prisma.LotteryUpdateInput = {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.colorToken !== undefined ? { colorToken: input.colorToken } : {}),
      }

      const updated = await ctx.prisma.lottery.update({ where: { id: input.id }, data })

      await writeAudit(ctx.prisma, {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'admin.lottery.updated',
        entityType: 'Lottery',
        entityId: existing.id,
        before: { isActive: existing.isActive, displayOrder: existing.displayOrder, colorToken: existing.colorToken },
        after: { isActive: updated.isActive, displayOrder: updated.displayOrder, colorToken: updated.colorToken },
      })

      return updated
    }),
  }),

  /** BO-41 — dispara re-sync de uma modalidade (enfileira na fila `sync-results` do worker). */
  resync: adminProcedure(UserRole.ADMIN).input(resyncInput).mutation(async ({ ctx, input }) => {
    const actor = ctx.session.user
    const lottery = await ctx.prisma.lottery.findUnique({
      where: { slug: input.lotterySlug },
      select: { id: true },
    })
    if (!lottery) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Modalidade "${input.lotterySlug}" não encontrada.` })
    }

    const jobId = await enqueueSyncResults(input.lotterySlug)

    await writeAudit(ctx.prisma, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin.lottery.resync_requested',
      entityType: 'Lottery',
      entityId: lottery.id,
      after: { lotterySlug: input.lotterySlug, jobId: jobId ?? null },
    })

    return { queued: true as const, lotterySlug: input.lotterySlug, jobId }
  }),

  /**
   * BO-42 — correção manual de dezenas de um concurso. Grava `AuditLog` (obrigatório) e, na
   * sequência, JÁ DISPARA o reprocessamento (`reprocessContestScope`, o mesmo helper de
   * `admin.bets.reprocessChecks`) — a UI deve avisar isso claramente antes de confirmar
   * (dezenas erradas geram `BetCheck` errados; a correção só faz sentido reconferindo).
   */
  fixContest: adminProcedure(UserRole.ADMIN).input(fixContestInput).mutation(async ({ ctx, input }) => {
    const actor = ctx.session.user
    const existing = await ctx.prisma.contest.findUnique({
      where: { id: input.contestId },
      select: { ...contestSelectForReprocess, lotteryId: true, lottery: { select: { slug: true } } },
    })
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Concurso não encontrado.' })

    const updated = await ctx.prisma.contest.update({
      where: { id: existing.id },
      data: {
        numbers: input.numbers,
        ...(input.numbersDrawOrder !== undefined ? { numbersDrawOrder: input.numbersDrawOrder } : {}),
        ...(input.secondaryNumbers !== undefined ? { secondaryNumbers: input.secondaryNumbers } : {}),
      },
      select: contestSelectForReprocess,
    })

    await writeAudit(ctx.prisma, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin.contest.fixed',
      entityType: 'Contest',
      entityId: existing.id,
      before: {
        numbers: existing.numbers,
        numbersDrawOrder: existing.numbersDrawOrder,
        secondaryNumbers: existing.secondaryNumbers,
      },
      after: {
        numbers: updated.numbers,
        numbersDrawOrder: updated.numbersDrawOrder,
        secondaryNumbers: updated.secondaryNumbers,
      },
    })

    const config = getLotteryConfig(existing.lottery.slug as LotterySlug)
    const prisma = createAdminReprocessPrismaAdapter(ctx.prisma)
    const contestRow: ContestRow = updated
    const reprocessed = await reprocessContestScope(prisma, existing.lotteryId, contestRow, config)

    return { contest: updated, reprocessed }
  }),
})

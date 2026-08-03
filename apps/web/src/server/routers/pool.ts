/**
 * Router `pool` — Bolão Manager (Onda 8, `docs/contracts/onda8-bolao.md` — **o contrato**;
 * qualquer divergência entre este arquivo e aquele documento é bug deste arquivo).
 *
 * ⛔ Regra jurídica que atravessa tudo (CLAUDE.md §1, docs/03): o LotoPro NUNCA custodia
 * dinheiro de bolão. Todo Pix é P2P — participante → organizador (cota, `payments.pixPayload`)
 * e organizador → participante (rateio, `payout.*`) — direto entre pessoas físicas. Não existe
 * saldo, carteira, split nem "receber pelo LotoPro" em nenhum procedure abaixo.
 * `confirmPayment`/`payments.declare` são DECLARAÇÃO HUMANA, nunca conciliação bancária.
 *
 * ── Funções puras assumidas de `@lotopro/core` (agente A, em paralelo — mesmo contrato) ──
 * `packages/core` é território exclusivo do agente A nesta onda; este router importa e
 * confia nas assinaturas abaixo. Se divergirem de verdade, o typecheck falha só nesses
 * pontos — ver relatório da tarefa.
 *
 *   computeShareMath(totalCostCents: bigint, totalShares: number): ShareMath
 *   canAcceptShares(taken: number, requested: number, total: number): boolean
 *   buildPixPayload(input: PixPayloadInput): PixPayload
 *   computePayout(totalPrizeCents: bigint, members: PayoutMember[], totalShares: number): PayoutResult
 *
 * (as três primeiras foram confirmadas em `packages/core/src/pool/{shares,pix}.ts` durante
 * esta tarefa — sinais de que o agente A também terminou; `computePayout` já existia antes.)
 *
 * ── Padrão de código ──────────────────────────────────────────────────────────────────
 * Mesmo estilo de `server/routers/bets.ts`/`account.ts`: Zod nas entradas, `TRPCError` com
 * mensagem em PT-BR, `ctx.session.user.id` como ator, autorização explícita em TODO
 * procedure (nunca confiar na UI — CLAUDE.md §"Convenções").
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  canAcceptShares,
  canAddPoolParticipant,
  canCreatePool,
  computePayout,
  computeShareMath,
  buildPixPayload,
} from '@lotopro/core'
import { MemberStatus, PaymentConfirmation, PayoutStatus, Prisma, PoolStatus } from '@lotopro/db'
import { guardOrThrow, protectedProcedure, publicProcedure, router } from '@/server/trpc'
import { decryptSecret } from '@/server/lib/crypto'
import { resolveEntitlements } from '@/server/lib/entitlements'
import { lotterySlugSchema } from '@/server/lib/lottery-schema'
import { sharesRatioDecimalString } from '@/server/lib/pool/decimal'
import { generateUniqueInviteCode, INVITE_CODE_TTL_DAYS } from '@/server/lib/pool/invite-code'
import { buildPixTxid, DEFAULT_MERCHANT_CITY, maskOwnerPixKey, toPixKeyKind } from '@/server/lib/pool/pix'
import {
  assertCanConfirmPayment,
  assertCanDeclarePayment,
  assertCanMarkPayoutPaid,
  assertValidPoolTransition,
} from '@/server/lib/pool/state-machine'

const MS_PER_DAY = 24 * 60 * 60 * 1000
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

/** "Ativo" para bolão = nem CLOSED, nem CANCELED, nem SETTLED — mesma definição já
 * assumida por `account.ts` (`usage.get`, CL-104) na ausência deste router até agora. */
const ACTIVE_POOL_STATUSES: readonly PoolStatus[] = [PoolStatus.DRAFT, PoolStatus.OPEN, PoolStatus.BET_PLACED]

/** Ainda não confirmado pelo dono — conta para `pendingPayments` (PoolCard/PoolDetail). */
const PENDING_PAYMENT_STATUSES: readonly MemberStatus[] = [
  MemberStatus.INVITED,
  MemberStatus.JOINED,
  MemberStatus.PAID,
]

function assertValidPoolContestRange(contestFrom: number, contestTo: number): void {
  if (contestTo < contestFrom) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'O concurso final deve ser maior ou igual ao concurso inicial.',
    })
  }
}

const poolIdInput = z.object({ poolId: z.string().min(1) })
const memberIdInput = z.object({ memberId: z.string().min(1) })

// ─────────────────────────────────────────────────────────────────────────────
// pool.create / list / detail / updateStatus / attachReceipt
// ─────────────────────────────────────────────────────────────────────────────

const createInput = z.object({
  lotterySlug: lotterySlugSchema,
  name: z.string().trim().min(1, 'Informe o nome do bolão.').max(120, 'Nome muito longo.'),
  description: z.string().trim().max(1000).optional(),
  contestFrom: z.number().int().positive(),
  contestTo: z.number().int().positive(),
  totalShares: z.number().int().positive().max(1000, 'Máximo de 1000 cotas por bolão.'),
  totalCostCents: z.bigint().positive(),
  rulesAccepted: z
    .boolean()
    .refine((value) => value === true, {
      message: 'É preciso aceitar os termos de responsabilidade do organizador.',
    }),
})

const listInput = z.object({
  scope: z.enum(['organizing', 'participating', 'all']),
  status: z.nativeEnum(PoolStatus).optional(),
})

const detailInput = poolIdInput

const updateStatusInput = z.object({ poolId: z.string().min(1), status: z.nativeEnum(PoolStatus) })

const attachReceiptInput = z.object({
  poolId: z.string().min(1),
  receiptUrl: z.string().trim().min(1, 'Informe a URL do comprovante.').max(2000),
})

type PoolRole = 'OWNER' | 'MEMBER'

/** Soma de `shares` dos membros ainda "na jogada" (tudo que não é REMOVED). */
async function sumSharesTaken(
  prisma: Pick<Prisma.TransactionClient, 'poolMember'>,
  poolId: string,
): Promise<number> {
  const agg = await prisma.poolMember.aggregate({
    where: { poolId, status: { not: MemberStatus.REMOVED } },
    _sum: { shares: true },
  })
  return agg._sum.shares ?? 0
}

export const poolRouter = router({
  /** `pool.create` — qualquer autenticado. Snapshot da chave Pix do dono no momento da
   * criação (schema: "ownerPixKeyType/Enc — snapshot no momento da criação"). */
  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertValidPoolContestRange(input.contestFrom, input.contestTo)

    const lottery = await ctx.prisma.lottery.findUnique({
      where: { slug: input.lotterySlug },
      select: { id: true },
    })
    if (!lottery) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Modalidade "${input.lotterySlug}" não encontrada.` })
    }

    const ent = await ctx.getEntitlements()
    const activePools = await ctx.prisma.pool.count({
      where: { ownerId: ctx.session.user.id, status: { in: [...ACTIVE_POOL_STATUSES] } },
    })
    guardOrThrow(canCreatePool(ent, activePools))

    const share = computeShareMath(input.totalCostCents, input.totalShares)

    const owner = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { pixKeyEncrypted: true, pixKeyType: true },
    })

    const inviteCode = await generateUniqueInviteCode(async (code) => {
      const existing = await ctx.prisma.pool.findUnique({ where: { inviteCode: code }, select: { id: true } })
      return existing !== null
    })

    const now = new Date()

    const data: Prisma.PoolUncheckedCreateInput = {
      tenantId: ctx.session.user.tenantId,
      ownerId: ctx.session.user.id,
      lotteryId: lottery.id,
      name: input.name,
      contestFrom: input.contestFrom,
      contestTo: input.contestTo,
      totalShares: input.totalShares,
      shareValueCents: share.shareValueCents,
      totalCostCents: input.totalCostCents,
      inviteCode,
      inviteExpiresAt: addDays(now, INVITE_CODE_TTL_DAYS),
      status: PoolStatus.DRAFT,
      rulesAcceptedAt: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(owner.pixKeyType && owner.pixKeyEncrypted
        ? { ownerPixKeyType: owner.pixKeyType, ownerPixKeyEnc: owner.pixKeyEncrypted }
        : {}),
    }

    const pool = await ctx.prisma.pool.create({ data, select: { id: true } })

    return { poolId: pool.id, inviteCode, share }
  }),

  /** `pool.list` — cards de "meus bolões" (organizo/participo/todos). */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const ownerWhere: Prisma.PoolWhereInput = { ownerId: userId }
    const memberWhere: Prisma.PoolWhereInput = {
      members: { some: { userId, status: { not: MemberStatus.REMOVED } } },
    }

    const scopeWhere: Prisma.PoolWhereInput =
      input.scope === 'organizing' ? ownerWhere : input.scope === 'participating' ? memberWhere : { OR: [ownerWhere, memberWhere] }

    const pools = await ctx.prisma.pool.findMany({
      where: { ...scopeWhere, ...(input.status ? { status: input.status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { lottery: { select: { slug: true, name: true } } },
    })

    if (pools.length === 0) return []

    const poolIds = pools.map((pool) => pool.id)
    const sharesTakenRows = await ctx.prisma.poolMember.groupBy({
      by: ['poolId'],
      where: { poolId: { in: poolIds }, status: { not: MemberStatus.REMOVED } },
      _sum: { shares: true },
    })
    const sharesTakenByPool = new Map(sharesTakenRows.map((row) => [row.poolId, row._sum.shares ?? 0]))

    const ownedPoolIds = pools.filter((pool) => pool.ownerId === userId).map((pool) => pool.id)
    const pendingRows =
      ownedPoolIds.length > 0
        ? await ctx.prisma.poolMember.groupBy({
            by: ['poolId'],
            where: {
              poolId: { in: ownedPoolIds },
              status: { in: [...PENDING_PAYMENT_STATUSES] },
            },
            _count: { _all: true },
          })
        : []
    const pendingByPool = new Map(pendingRows.map((row) => [row.poolId, row._count._all]))

    return pools.map((pool) => {
      const role: PoolRole = pool.ownerId === userId ? 'OWNER' : 'MEMBER'
      return {
        id: pool.id,
        name: pool.name,
        status: pool.status,
        lottery: { slug: pool.lottery.slug, name: pool.lottery.name },
        contestFrom: pool.contestFrom,
        contestTo: pool.contestTo,
        totalShares: pool.totalShares,
        sharesTaken: sharesTakenByPool.get(pool.id) ?? 0,
        shareValueCents: pool.shareValueCents,
        role,
        pendingPayments: role === 'OWNER' ? pendingByPool.get(pool.id) ?? 0 : null,
      }
    })
  }),

  /** `pool.detail` — dono ou membro (não-removido). `inviteCode` só sai para o dono. */
  detail: protectedProcedure.input(detailInput).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const pool = await ctx.prisma.pool.findUnique({
      where: { id: input.poolId },
      include: {
        lottery: { select: { slug: true, name: true } },
        members: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { name: true } },
            payments: {
              where: { confirmedBy: PaymentConfirmation.MEMBER_DECLARED },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { confirmedAt: true, proofUrl: true },
            },
          },
        },
        bets: { select: { id: true, contestFrom: true, numbers: true } },
      },
    })

    if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })

    const isOwner = pool.ownerId === userId
    const isMember = pool.members.some((member) => member.userId === userId && member.status !== MemberStatus.REMOVED)
    if (!isOwner && !isMember) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não participa deste bolão.' })
    }

    const activeMembers = pool.members.filter((member) => member.status !== MemberStatus.REMOVED)
    const sharesTaken = activeMembers.reduce((sum, member) => sum + member.shares, 0)
    const pendingPayments = isOwner
      ? activeMembers.filter((member) => PENDING_PAYMENT_STATUSES.includes(member.status)).length
      : null

    const share = computeShareMath(pool.totalCostCents, pool.totalShares)
    const role: PoolRole = isOwner ? 'OWNER' : 'MEMBER'

    return {
      id: pool.id,
      name: pool.name,
      status: pool.status,
      lottery: { slug: pool.lottery.slug, name: pool.lottery.name },
      contestFrom: pool.contestFrom,
      contestTo: pool.contestTo,
      totalShares: pool.totalShares,
      sharesTaken,
      shareValueCents: pool.shareValueCents,
      role,
      pendingPayments,
      description: pool.description,
      // ⚠️ invariante 5 do contrato: NUNCA vaza para quem não é dono.
      inviteCode: isOwner ? pool.inviteCode : null,
      inviteExpiresAt: pool.inviteExpiresAt,
      receiptUrl: pool.receiptUrl,
      ownerPixKeyMasked:
        pool.ownerPixKeyType && pool.ownerPixKeyEnc
          ? maskOwnerPixKey(pool.ownerPixKeyType, decryptSecret(pool.ownerPixKeyEnc))
          : null,
      members: pool.members.map((member) => ({
        id: member.id,
        displayName: member.user?.name ?? member.guestName,
        userId: member.userId,
        shares: member.shares,
        amountCents: member.amountCents,
        status: member.status,
        paymentDeclaredAt: member.payments[0]?.confirmedAt ?? null,
        proofUrl: member.payments[0]?.proofUrl ?? null,
      })),
      share,
      bets: pool.bets.map((bet) => ({ id: bet.id, contestNumber: bet.contestFrom, numbers: bet.numbers })),
    }
  }),

  /** `pool.updateStatus` — dono. Máquina de estados (`server/lib/pool/state-machine.ts`). */
  updateStatus: protectedProcedure.input(updateStatusInput).mutation(async ({ ctx, input }) => {
    const pool = await ctx.prisma.pool.findUnique({
      where: { id: input.poolId },
      select: { ownerId: true, status: true, receiptUrl: true },
    })
    if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })
    if (pool.ownerId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode mudar o status.' })
    }

    assertValidPoolTransition(pool.status, input.status, { hasReceiptUrl: pool.receiptUrl !== null })

    const updated = await ctx.prisma.pool.update({
      where: { id: input.poolId },
      data: {
        status: input.status,
        ...(input.status === PoolStatus.CLOSED ? { closedAt: new Date() } : {}),
      },
      select: { status: true },
    })

    return { status: updated.status }
  }),

  /** `pool.attachReceipt` — dono. Não muda status sozinho; `updateStatus(BET_PLACED)` depois checa a presença disto. */
  attachReceipt: protectedProcedure.input(attachReceiptInput).mutation(async ({ ctx, input }) => {
    const pool = await ctx.prisma.pool.findUnique({ where: { id: input.poolId }, select: { ownerId: true } })
    if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })
    if (pool.ownerId !== ctx.session.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode anexar o comprovante.' })
    }

    await ctx.prisma.pool.update({
      where: { id: input.poolId },
      data: { receiptUrl: input.receiptUrl, receiptUploadedAt: new Date() },
    })

    return { ok: true as const }
  }),

  // ───────────────────────────────────────────────────────────────────────────
  // pool.members.*
  // ───────────────────────────────────────────────────────────────────────────

  members: router({
    /** `pool.members.addGuest` — dono. Recontagem de cotas DENTRO da transação (invariante 3). */
    addGuest: protectedProcedure
      .input(
        z.object({
          poolId: z.string().min(1),
          guestName: z.string().trim().min(1, 'Informe o nome do convidado.').max(120),
          guestPhone: z.string().trim().max(20).optional(),
          shares: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const pool = await ctx.prisma.pool.findUnique({
          where: { id: input.poolId },
          select: { ownerId: true, status: true, totalShares: true, shareValueCents: true },
        })
        if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })
        if (pool.ownerId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode adicionar participantes.' })
        }
        if (pool.status !== PoolStatus.OPEN) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'O bolão só aceita novos participantes enquanto estiver "aberto".',
          })
        }

        const ent = await ctx.getEntitlements()

        const memberId = await ctx.prisma.$transaction(async (tx) => {
          const [sharesTaken, participantsCount] = await Promise.all([
            sumSharesTaken(tx, input.poolId),
            tx.poolMember.count({ where: { poolId: input.poolId, status: { not: MemberStatus.REMOVED } } }),
          ])

          if (!canAcceptShares(sharesTaken, input.shares, pool.totalShares)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Só restam ${Math.max(0, pool.totalShares - sharesTaken)} cota(s) disponível(is) neste bolão.`,
            })
          }

          // "current" = participantes já no bolão, incluindo o organizador (docs/05 §5.4, G3/G9).
          guardOrThrow(canAddPoolParticipant(ent, participantsCount + 1))

          const created = await tx.poolMember.create({
            data: {
              poolId: input.poolId,
              guestName: input.guestName,
              shares: input.shares,
              amountCents: BigInt(input.shares) * pool.shareValueCents,
              status: MemberStatus.JOINED,
              joinedAt: new Date(),
              ...(input.guestPhone !== undefined ? { guestPhone: input.guestPhone } : {}),
            },
            select: { id: true },
          })
          return created.id
        })

        return { memberId }
      }),

    /** `pool.members.remove` — dono. Libera as cotas do participante (some da recontagem). */
    remove: protectedProcedure.input(memberIdInput).mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.poolMember.findUnique({
        where: { id: input.memberId },
        select: { status: true, pool: { select: { ownerId: true } } },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Participante não encontrado.' })
      if (member.pool.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode remover participantes.' })
      }
      if (member.status === MemberStatus.REMOVED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este participante já foi removido.' })
      }

      await ctx.prisma.poolMember.update({ where: { id: input.memberId }, data: { status: MemberStatus.REMOVED } })
      return { ok: true as const }
    }),

    /** `pool.members.confirmPayment` — SÓ o dono (nunca o próprio membro confirmando a si mesmo). */
    confirmPayment: protectedProcedure.input(memberIdInput).mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.poolMember.findUnique({
        where: { id: input.memberId },
        select: { id: true, status: true, amountCents: true, pool: { select: { ownerId: true } } },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Participante não encontrado.' })
      if (member.pool.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode confirmar pagamentos.' })
      }

      assertCanConfirmPayment(member.status)

      const [, updatedMember] = await ctx.prisma.$transaction([
        ctx.prisma.poolPayment.create({
          data: {
            poolMemberId: member.id,
            amountCents: member.amountCents,
            confirmedBy: PaymentConfirmation.OWNER_MANUAL,
            confirmedAt: new Date(),
          },
        }),
        ctx.prisma.poolMember.update({
          where: { id: member.id },
          data: { status: MemberStatus.CONFIRMED },
          select: { status: true },
        }),
      ])

      return { status: updatedMember.status }
    }),
  }),

  // ───────────────────────────────────────────────────────────────────────────
  // pool.payments.*
  // ───────────────────────────────────────────────────────────────────────────

  payments: router({
    /** `pool.payments.declare` — só o próprio participante (nunca o dono declarando por ele). */
    declare: protectedProcedure
      .input(z.object({ memberId: z.string().min(1), proofUrl: z.string().trim().min(1).max(2000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const member = await ctx.prisma.poolMember.findUnique({
          where: { id: input.memberId },
          select: { id: true, userId: true, status: true, amountCents: true },
        })
        if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Participante não encontrado.' })
        if (member.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o próprio participante pode declarar este pagamento.' })
        }

        assertCanDeclarePayment(member.status)

        const [, updatedMember] = await ctx.prisma.$transaction([
          ctx.prisma.poolPayment.create({
            data: {
              poolMemberId: member.id,
              amountCents: member.amountCents,
              confirmedBy: PaymentConfirmation.MEMBER_DECLARED,
              confirmedAt: new Date(),
              ...(input.proofUrl !== undefined ? { proofUrl: input.proofUrl } : {}),
            },
          }),
          ctx.prisma.poolMember.update({
            where: { id: member.id },
            data: { status: MemberStatus.PAID },
            select: { status: true },
          }),
        ])

        return { status: updatedMember.status }
      }),

    /** `pool.payments.pixPayload` — dono ou o próprio membro. Gera o EMV no servidor; só ele sai. */
    pixPayload: protectedProcedure.input(memberIdInput).query(async ({ ctx, input }) => {
      const member = await ctx.prisma.poolMember.findUnique({
        where: { id: input.memberId },
        select: {
          id: true,
          userId: true,
          amountCents: true,
          pool: {
            select: {
              id: true,
              ownerId: true,
              ownerPixKeyType: true,
              ownerPixKeyEnc: true,
              owner: { select: { name: true } },
            },
          },
        },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Participante não encontrado.' })

      const actorId = ctx.session.user.id
      const isOwner = member.pool.ownerId === actorId
      const isSelf = member.userId === actorId
      if (!isOwner && !isSelf) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem acesso a este pagamento.' })
      }

      if (!member.pool.ownerPixKeyType || !member.pool.ownerPixKeyEnc) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'O organizador ainda não configurou uma chave Pix para este bolão.',
        })
      }

      const key = decryptSecret(member.pool.ownerPixKeyEnc)

      try {
        return buildPixPayload({
          key,
          keyKind: toPixKeyKind(member.pool.ownerPixKeyType),
          merchantName: member.pool.owner.name.slice(0, 25),
          merchantCity: DEFAULT_MERCHANT_CITY,
          amountCents: member.amountCents,
          txid: buildPixTxid(member.pool.id, member.id),
        })
      } catch (error) {
        // `buildPixPayload` (`@lotopro/core`) lança `Error` simples em chave Pix
        // inválida para o `keyKind` (nunca ecoa a chave) — traduz para o formato de
        // erro do resto do router (`TRPCError` + mensagem PT-BR já vem pronta do core).
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Não foi possível gerar o Pix deste bolão.',
          cause: error,
        })
      }
    }),
  }),

  // ───────────────────────────────────────────────────────────────────────────
  // pool.joinPreview / pool.join
  // ───────────────────────────────────────────────────────────────────────────

  /** `pool.joinPreview` — PÚBLICO. Código inexistente → NOT_FOUND genérico (nunca confirma existência). */
  joinPreview: publicProcedure
    .input(z.object({ inviteCode: z.string().trim().min(1) }))
    .query(async ({ ctx, input }) => {
      const pool = await ctx.prisma.pool.findUnique({
        where: { inviteCode: input.inviteCode },
        select: {
          name: true,
          status: true,
          totalShares: true,
          shareValueCents: true,
          contestFrom: true,
          contestTo: true,
          inviteExpiresAt: true,
          owner: { select: { name: true } },
          lottery: { select: { slug: true, name: true } },
        },
      })
      if (!pool) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Convite não encontrado.' })
      }

      const sharesAgg = await ctx.prisma.poolMember.aggregate({
        where: { pool: { inviteCode: input.inviteCode }, status: { not: MemberStatus.REMOVED } },
        _sum: { shares: true },
      })
      const sharesTaken = sharesAgg._sum.shares ?? 0

      return {
        poolName: pool.name,
        ownerName: pool.owner.name,
        lottery: { slug: pool.lottery.slug, name: pool.lottery.name },
        contestFrom: pool.contestFrom,
        contestTo: pool.contestTo,
        shareValueCents: pool.shareValueCents,
        sharesAvailable: Math.max(0, pool.totalShares - sharesTaken),
        status: pool.status,
        expired: pool.inviteExpiresAt !== null && pool.inviteExpiresAt.getTime() <= Date.now(),
      }
    }),

  /** `pool.join` — autenticado. Recontagem de cotas DENTRO da transação (invariante 3). */
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string().trim().min(1), shares: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const pool = await ctx.prisma.pool.findUnique({
        where: { inviteCode: input.inviteCode },
        select: {
          id: true,
          ownerId: true,
          status: true,
          totalShares: true,
          shareValueCents: true,
          inviteExpiresAt: true,
        },
      })
      if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Convite não encontrado.' })
      if (pool.inviteExpiresAt !== null && pool.inviteExpiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este convite expirou.' })
      }
      if (pool.status !== PoolStatus.OPEN) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'O bolão só aceita novos participantes enquanto estiver "aberto".',
        })
      }
      if (pool.ownerId === userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Você é o organizador deste bolão — use pool.members.addGuest para registrar participantes.',
        })
      }

      const ownerEnt = await resolveEntitlements(ctx.prisma, pool.ownerId)

      const memberId = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.poolMember.findUnique({ where: { poolId_userId: { poolId: pool.id, userId } } })
        if (existing && existing.status !== MemberStatus.REMOVED) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Você já participa deste bolão.' })
        }

        const [sharesTaken, participantsCount] = await Promise.all([
          sumSharesTaken(tx, pool.id),
          tx.poolMember.count({ where: { poolId: pool.id, status: { not: MemberStatus.REMOVED } } }),
        ])

        if (!canAcceptShares(sharesTaken, input.shares, pool.totalShares)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Só restam ${Math.max(0, pool.totalShares - sharesTaken)} cota(s) disponível(is) neste bolão.`,
          })
        }

        guardOrThrow(canAddPoolParticipant(ownerEnt, participantsCount + 1))

        const amountCents = BigInt(input.shares) * pool.shareValueCents
        const now = new Date()

        if (existing) {
          const updated = await tx.poolMember.update({
            where: { id: existing.id },
            data: { shares: input.shares, amountCents, status: MemberStatus.JOINED, joinedAt: now },
            select: { id: true },
          })
          return updated.id
        }

        const created = await tx.poolMember.create({
          data: {
            poolId: pool.id,
            userId,
            shares: input.shares,
            amountCents,
            status: MemberStatus.JOINED,
            joinedAt: now,
          },
          select: { id: true },
        })
        return created.id
      })

      return { poolId: pool.id, memberId }
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // pool.payout.*
  // ───────────────────────────────────────────────────────────────────────────

  payout: router({
    /** `pool.payout.compute` — dono. Upsert idempotente em `PoolPayout` (invariante 6). */
    compute: protectedProcedure
      .input(z.object({ poolId: z.string().min(1), contestId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const pool = await ctx.prisma.pool.findUnique({
          where: { id: input.poolId },
          select: { id: true, ownerId: true, totalShares: true },
        })
        if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })
        if (pool.ownerId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode calcular o rateio.' })
        }

        const contest = await ctx.prisma.contest.findUnique({ where: { id: input.contestId }, select: { id: true } })
        if (!contest) throw new TRPCError({ code: 'NOT_FOUND', message: 'Concurso não encontrado.' })

        const [members, prizeAgg] = await Promise.all([
          ctx.prisma.poolMember.findMany({
            where: { poolId: pool.id, status: { not: MemberStatus.REMOVED } },
            select: { id: true, shares: true },
          }),
          ctx.prisma.betCheck.aggregate({
            where: { contestId: input.contestId, bet: { poolId: pool.id } },
            _sum: { prizeCents: true },
          }),
        ])

        const grossPrizeCents = prizeAgg._sum.prizeCents ?? 0n
        const result = computePayout(
          grossPrizeCents,
          members.map((member) => ({ memberId: member.id, shares: member.shares })),
          pool.totalShares,
        )

        if (result.shares.length > 0) {
          const existing = await ctx.prisma.poolPayout.findMany({
            where: { poolMemberId: { in: result.shares.map((share) => share.memberId) }, contestId: input.contestId },
            select: { poolMemberId: true },
          })
          const existingIds = new Set(existing.map((row) => row.poolMemberId))

          await ctx.prisma.$transaction(
            result.shares.map((share) => {
              const sharesRatio = sharesRatioDecimalString(share.shares, pool.totalShares)
              // Recalcular NUNCA duplica nem infla: `update` preserva `status`/`paidAt` já
              // existentes (não reseta um `markPaid` anterior); só `create` começa em PENDING.
              if (existingIds.has(share.memberId)) {
                return ctx.prisma.poolPayout.update({
                  where: { poolMemberId_contestId: { poolMemberId: share.memberId, contestId: input.contestId } },
                  data: { grossPrizeCents, sharesRatio, amountCents: share.amountCents },
                })
              }
              return ctx.prisma.poolPayout.create({
                data: {
                  poolId: pool.id,
                  poolMemberId: share.memberId,
                  contestId: input.contestId,
                  grossPrizeCents,
                  sharesRatio,
                  amountCents: share.amountCents,
                  status: PayoutStatus.PENDING,
                },
              })
            }),
          )
        }

        return result
      }),

    /** `pool.payout.list` — dono ou membro. Roster completo (todo mundo vê o rateio de todo mundo). */
    list: protectedProcedure.input(poolIdInput).query(async ({ ctx, input }) => {
      const pool = await ctx.prisma.pool.findUnique({
        where: { id: input.poolId },
        select: { ownerId: true, members: { select: { userId: true, status: true } } },
      })
      if (!pool) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bolão não encontrado.' })

      const actorId = ctx.session.user.id
      const isOwner = pool.ownerId === actorId
      const isMember = pool.members.some((member) => member.userId === actorId && member.status !== MemberStatus.REMOVED)
      if (!isOwner && !isMember) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não participa deste bolão.' })
      }

      const payouts = await ctx.prisma.poolPayout.findMany({
        where: { poolId: input.poolId },
        orderBy: { createdAt: 'desc' },
        include: { poolMember: { include: { user: { select: { name: true } } } } },
      })
      if (payouts.length === 0) return []

      const contestIds = [...new Set(payouts.map((payout) => payout.contestId))]
      const contests = await ctx.prisma.contest.findMany({
        where: { id: { in: contestIds } },
        select: { id: true, number: true },
      })
      const contestNumberById = new Map(contests.map((contest) => [contest.id, contest.number]))

      return payouts.map((payout) => ({
        id: payout.id,
        memberName: payout.poolMember.user?.name ?? payout.poolMember.guestName ?? 'Participante',
        contestNumber: contestNumberById.get(payout.contestId) ?? 0,
        sharesRatio: payout.sharesRatio.toString(),
        amountCents: payout.amountCents,
        status: payout.status,
      }))
    }),

    /** `pool.payout.markPaid` — dono. `PENDING -> DECLARED_PAID` (organizador declara que já fez o Pix). */
    markPaid: protectedProcedure
      .input(z.object({ payoutId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const payout = await ctx.prisma.poolPayout.findUnique({
          where: { id: input.payoutId },
          select: { status: true, pool: { select: { ownerId: true } } },
        })
        if (!payout) throw new TRPCError({ code: 'NOT_FOUND', message: 'Rateio não encontrado.' })
        if (payout.pool.ownerId !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Só o organizador do bolão pode marcar o rateio como pago.' })
        }

        assertCanMarkPayoutPaid(payout.status)

        const updated = await ctx.prisma.poolPayout.update({
          where: { id: input.payoutId },
          data: { status: PayoutStatus.DECLARED_PAID, paidAt: new Date() },
          select: { status: true },
        })

        return { status: updated.status }
      }),
  }),
})

export type PoolRouter = typeof poolRouter

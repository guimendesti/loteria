/**
 * Onda 8 (Bolão Manager) — `pool-notify`: traduz eventos de domínio do bolão em jobs `notify`
 * (fila existente, `jobs/notify.ts`) para os destinatários certos. Este job NUNCA envia
 * e-mail/push diretamente — só decide QUEM recebe O QUÊ e enfileira em `notify`, que já
 * resolve `NotificationPreference` (canal, horário de silêncio, `onlyWhenPrized`) e a
 * deduplicação por `Notification.dedupeKey` (P4, `jobs/notify.ts`). "Não crie um segundo
 * caminho de envio" (pedido no escopo) é o motivo desta separação: `pool-notify` é só
 * ORQUESTRAÇÃO (evento → destinatário → payload), `notify` continua sendo o único lugar que
 * fala com Resend/WebPush.
 *
 * ── Quem enfileira eventos aqui (fora do território desta tarefa) ─────────────────────────
 *
 * `apps/web/src/server/routers/pool.ts` ainda não existe nesta onda (território de outro
 * agente, em paralelo — ver `docs/contracts/onda8-bolao.md`). O padrão já usado no repo para
 * `apps/web` enfileirar num job do `apps/worker` é abrir sua PRÓPRIA `Queue` BullMQ apontando
 * para o MESMO nome de fila (`apps/web/src/server/routers/admin/config.ts`
 * `enqueueSyncResults`, mesma decisão documentada lá: "não dá pra chamar o job diretamente,
 * processos separados"). O contrato exato (nome da fila, payload por evento) está registrado
 * em `apps/web/src/server/routers/_pool-notify-register.md` para quem ligar o lado produtor.
 *
 * ── Os 5 eventos (pedidos no escopo) ───────────────────────────────────────────────────────
 *
 *  1. `member.joined`      — novo participante entrou → avisa o ORGANIZADOR.
 *  2. `payment.declared`   — participante declarou pagamento → avisa o ORGANIZADOR.
 *  3. `payment.confirmed`  — organizador confirmou o pagamento → avisa o PARTICIPANTE.
 *  4. `receipt.attached`   — organizador anexou o comprovante da aposta → avisa TODOS os
 *     membros (broadcast).
 *  5. `payout.computed`    — rateio calculado (bolão premiado) → avisa TODOS os membros
 *     premiados com o valor devido a CADA UM (`PoolPayout.amountCents`, um evento por membro).
 *
 * Participante SEM conta (`PoolMember.userId === null`, convidado por `addGuest`) não tem
 * `User`/`NotificationPreference`/e-mail no sistema — eventos 3–5, quando o destinatário é um
 * convidado, são pulados (contabilizados em `skipped`, nunca lançam). `member.joined` e
 * `payment.declared` sempre notificam o ORGANIZADOR (sempre um `User` de verdade — dono de
 * bolão exige conta), então não têm esse caso.
 *
 * ── Idempotência (pedida no escopo: "reenvio do mesmo evento não pode duplicar e-mail") ────
 *
 * Duas camadas, de propósito:
 *  1. **BullMQ `jobId`** — `enqueue()` (abaixo) chama `notifyQueue.add('notify', data, {
 *     jobId })` com uma chave NATURAL do evento (`pool-notify:<type>:<userId>:<escopo>`).
 *     BullMQ trata `add` com um `jobId` já existente (job não concluído/removido) como no-op —
 *     reenfileirar o MESMO evento (ex.: o produtor reprocessando por causa de um retry de
 *     mutation) não duplica o job na fila.
 *  2. **`Notification.dedupeKey`** (coluna UNIQUE, `jobs/notify.ts`) — a rede de segurança
 *     "de verdade": mesmo se dois jobs `notify` distintos chegarem a rodar para o mesmo
 *     evento (ex.: o job da fila `pool-notify` já saiu, um novo `jobId` diferente por algum
 *     motivo), o `findFirst` por `dedupeKey` ANTES de enviar impede o e-mail duplicado. A
 *     chave de `buildDedupeKey` (`jobs/notify.ts`) só considerava `lotterySlug`/
 *     `contestNumber` antes desta tarefa — eventos de bolão não têm essa noção, então
 *     `buildDedupeKey` ganhou um terceiro campo genérico opcional, `payload.dedupeScope`
 *     (mudança aditiva: nenhum `type` existente seta esse campo, então o `dedupeKey` de
 *     `bet.*`/`contest.*`/`billing.*` não muda um caractere). Todo evento aqui embute um
 *     `dedupeScope` com a chave natural do evento (`member:<id>`, `payment-declared:<id>`,
 *     `payment-confirmed:<id>`, `receipt:<poolId>:<attachedAt>`, `payout:<id>`).
 */
import { z } from 'zod'
import type { NotifyJobData } from '../queues'
import { centsToBRL } from '../lib/money'
import type { Logger } from '../lib/logger'

// ─── Payload (contrato do produtor — ver `_pool-notify-register.md`) ──────────────────────

export const poolNotifyJobSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('member.joined'),
    poolId: z.string().min(1),
    poolMemberId: z.string().min(1),
  }),
  z.object({
    event: z.literal('payment.declared'),
    poolId: z.string().min(1),
    poolMemberId: z.string().min(1),
    poolPaymentId: z.string().min(1),
  }),
  z.object({
    event: z.literal('payment.confirmed'),
    poolId: z.string().min(1),
    poolMemberId: z.string().min(1),
    poolPaymentId: z.string().min(1),
  }),
  z.object({
    event: z.literal('receipt.attached'),
    poolId: z.string().min(1),
    /** ISO — embutido no `dedupeScope` (um reattach de verdade vira uma notificação nova). */
    attachedAt: z.string().datetime(),
  }),
  z.object({
    event: z.literal('payout.computed'),
    poolId: z.string().min(1),
    contestId: z.string().min(1),
  }),
])
export type PoolNotifyJobData = z.infer<typeof poolNotifyJobSchema>

// ─── Interface mínima de Prisma ────────────────────────────────────────────────────────────

export interface PoolNotifyPoolRow {
  id: string
  ownerId: string
  name: string
}

export interface PoolNotifyMemberRow {
  id: string
  poolId: string
  /** `null` = convidado sem conta (`PoolMember.userId`) — não recebe notificação. */
  userId: string | null
  guestName: string | null
  /** `User.name` quando `userId` existe; `null` para convidado. */
  userName: string | null
  shares: number
}

export interface PoolNotifyPaymentRow {
  id: string
  poolMemberId: string
  amountCents: bigint
}

export interface PoolNotifyPayoutRow {
  id: string
  poolMemberId: string
  /** `PoolMember.userId` do membro dono deste payout — `null` = convidado, pulado. */
  memberUserId: string | null
  amountCents: bigint
  contestNumber: number
}

export interface PoolNotifyPrisma {
  pool: {
    findUnique(args: { where: { id: string } }): Promise<PoolNotifyPoolRow | null>
  }
  poolMember: {
    findUnique(args: { where: { id: string } }): Promise<PoolNotifyMemberRow | null>
    /** Membros do pool que ainda contam como participantes (exclui `REMOVED`), para broadcast. */
    findManyNotifiable(args: { where: { poolId: string } }): Promise<PoolNotifyMemberRow[]>
  }
  poolPayment: {
    findUnique(args: { where: { id: string } }): Promise<PoolNotifyPaymentRow | null>
  }
  poolPayout: {
    findManyForContest(args: { where: { poolId: string; contestId: string } }): Promise<PoolNotifyPayoutRow[]>
  }
}

export interface PoolNotifyQueue {
  add(name: string, data: NotifyJobData, opts?: { jobId?: string }): Promise<unknown>
}

export interface PoolNotifyDeps {
  prisma: PoolNotifyPrisma
  notifyQueue: PoolNotifyQueue
  logger?: Logger
}

export interface PoolNotifyResult {
  event: PoolNotifyJobData['event']
  /** Quantos jobs `notify` foram enfileirados (1 por destinatário). */
  notified: number
  /** Destinatários pulados: convidado sem conta, ou pool/membro/pagamento não encontrado. */
  skipped: number
}

// ─── Nome de exibição do membro (User.name > guestName > fallback) ────────────────────────

function resolveDisplayName(member: Pick<PoolNotifyMemberRow, 'userName' | 'guestName'>): string {
  return member.userName ?? member.guestName ?? 'Um participante'
}

// ─── Construção do NotifyJobData por evento (texto: doc/09 §9.6 "Bolão — ...") ────────────

function memberJoinedNotify(pool: PoolNotifyPoolRow, member: PoolNotifyMemberRow): NotifyJobData {
  const memberName = resolveDisplayName(member)
  return {
    userId: pool.ownerId,
    type: 'pool.member_joined',
    title: `${memberName} entrou no bolão "${pool.name}"`,
    body: `${member.shares} cota${member.shares === 1 ? '' : 's'} · aguardando pagamento.`,
    payload: {
      poolId: pool.id,
      poolName: pool.name,
      poolMemberId: member.id,
      memberName,
      shares: member.shares,
      dedupeScope: `member:${member.id}`,
    },
  }
}

function paymentDeclaredNotify(
  pool: PoolNotifyPoolRow,
  member: PoolNotifyMemberRow,
  payment: PoolNotifyPaymentRow,
): NotifyJobData {
  const memberName = resolveDisplayName(member)
  return {
    userId: pool.ownerId,
    type: 'pool.payment_declared',
    title: `${memberName} declarou pagamento no bolão "${pool.name}"`,
    body: 'Confirme o recebimento para liberar a cota.',
    payload: {
      poolId: pool.id,
      poolName: pool.name,
      poolMemberId: member.id,
      poolPaymentId: payment.id,
      memberName,
      amountCents: payment.amountCents.toString(),
      dedupeScope: `payment-declared:${payment.id}`,
    },
  }
}

function paymentConfirmedNotify(
  pool: PoolNotifyPoolRow,
  member: PoolNotifyMemberRow,
  payment: PoolNotifyPaymentRow,
  memberUserId: string,
): NotifyJobData {
  return {
    userId: memberUserId,
    type: 'pool.payment_confirmed',
    title: `Pagamento confirmado no bolão "${pool.name}"`,
    body: 'Você já está garantido nessa aposta.',
    payload: {
      poolId: pool.id,
      poolName: pool.name,
      poolMemberId: member.id,
      poolPaymentId: payment.id,
      amountCents: payment.amountCents.toString(),
      dedupeScope: `payment-confirmed:${payment.id}`,
    },
  }
}

function receiptAttachedNotify(pool: PoolNotifyPoolRow, memberUserId: string, attachedAt: string): NotifyJobData {
  return {
    userId: memberUserId,
    type: 'pool.receipt_attached',
    title: `Bolão "${pool.name}" apostado ✅`,
    body: 'O comprovante já está disponível para todos.',
    payload: {
      poolId: pool.id,
      poolName: pool.name,
      dedupeScope: `receipt:${pool.id}:${attachedAt}`,
    },
  }
}

/**
 * ⛔ Nunca inclui a chave Pix nem o `inviteCode` (pedido no escopo) — só `contestNumber` e o
 * valor já devido a ESTE membro (`payout.amountCents`), nunca o total do bolão de outro membro.
 */
function payoutReadyNotify(pool: PoolNotifyPoolRow, payout: PoolNotifyPayoutRow, memberUserId: string): NotifyJobData {
  const memberShareText = centsToBRL(payout.amountCents)
  return {
    userId: memberUserId,
    type: 'pool.prized',
    title: `🎉 O bolão "${pool.name}" foi premiado!`,
    body: `Sua parte: ${memberShareText}. Veja o rateio.`,
    payload: {
      poolId: pool.id,
      poolName: pool.name,
      contestNumber: payout.contestNumber,
      amountCents: payout.amountCents.toString(),
      dedupeScope: `payout:${payout.id}`,
    },
  }
}

// ─── Job ────────────────────────────────────────────────────────────────────────────────

export function createPoolNotifyJob(deps: PoolNotifyDeps) {
  const logger = deps.logger

  /** `jobId` estável = mesma dedupe layer 1 (ver cabeçalho do arquivo). */
  async function enqueue(data: NotifyJobData): Promise<void> {
    const scope = typeof data.payload?.['dedupeScope'] === 'string' ? (data.payload['dedupeScope'] as string) : 'none'
    const jobId = `pool-notify:${data.type}:${data.userId}:${scope}`
    await deps.notifyQueue.add('notify', data, { jobId })
  }

  return async function poolNotify(raw: PoolNotifyJobData): Promise<PoolNotifyResult> {
    const data = poolNotifyJobSchema.parse(raw)
    let notified = 0
    let skipped = 0

    switch (data.event) {
      case 'member.joined': {
        const [pool, member] = await Promise.all([
          deps.prisma.pool.findUnique({ where: { id: data.poolId } }),
          deps.prisma.poolMember.findUnique({ where: { id: data.poolMemberId } }),
        ])
        if (!pool || !member) {
          logger?.warn('pool-notify.member-joined.missing', { poolId: data.poolId, poolMemberId: data.poolMemberId })
          skipped += 1
          break
        }
        await enqueue(memberJoinedNotify(pool, member))
        notified += 1
        break
      }

      case 'payment.declared': {
        const [pool, member, payment] = await Promise.all([
          deps.prisma.pool.findUnique({ where: { id: data.poolId } }),
          deps.prisma.poolMember.findUnique({ where: { id: data.poolMemberId } }),
          deps.prisma.poolPayment.findUnique({ where: { id: data.poolPaymentId } }),
        ])
        if (!pool || !member || !payment) {
          logger?.warn('pool-notify.payment-declared.missing', {
            poolId: data.poolId,
            poolMemberId: data.poolMemberId,
            poolPaymentId: data.poolPaymentId,
          })
          skipped += 1
          break
        }
        await enqueue(paymentDeclaredNotify(pool, member, payment))
        notified += 1
        break
      }

      case 'payment.confirmed': {
        const [pool, member, payment] = await Promise.all([
          deps.prisma.pool.findUnique({ where: { id: data.poolId } }),
          deps.prisma.poolMember.findUnique({ where: { id: data.poolMemberId } }),
          deps.prisma.poolPayment.findUnique({ where: { id: data.poolPaymentId } }),
        ])
        if (!pool || !member || !payment) {
          logger?.warn('pool-notify.payment-confirmed.missing', {
            poolId: data.poolId,
            poolMemberId: data.poolMemberId,
            poolPaymentId: data.poolPaymentId,
          })
          skipped += 1
          break
        }
        if (member.userId === null) {
          logger?.info('pool-notify.payment-confirmed.guest-skip', { poolMemberId: member.id })
          skipped += 1
          break
        }
        await enqueue(paymentConfirmedNotify(pool, member, payment, member.userId))
        notified += 1
        break
      }

      case 'receipt.attached': {
        const pool = await deps.prisma.pool.findUnique({ where: { id: data.poolId } })
        if (!pool) {
          logger?.warn('pool-notify.receipt-attached.missing-pool', { poolId: data.poolId })
          skipped += 1
          break
        }
        const members = await deps.prisma.poolMember.findManyNotifiable({ where: { poolId: data.poolId } })
        for (const member of members) {
          if (member.userId === null) {
            skipped += 1
            continue
          }
          await enqueue(receiptAttachedNotify(pool, member.userId, data.attachedAt))
          notified += 1
        }
        break
      }

      case 'payout.computed': {
        const pool = await deps.prisma.pool.findUnique({ where: { id: data.poolId } })
        if (!pool) {
          logger?.warn('pool-notify.payout-computed.missing-pool', { poolId: data.poolId })
          skipped += 1
          break
        }
        const payouts = await deps.prisma.poolPayout.findManyForContest({
          where: { poolId: data.poolId, contestId: data.contestId },
        })
        for (const payout of payouts) {
          if (payout.memberUserId === null) {
            skipped += 1
            continue
          }
          await enqueue(payoutReadyNotify(pool, payout, payout.memberUserId))
          notified += 1
        }
        break
      }
    }

    logger?.info('pool-notify.done', { event: data.event, notified, skipped })
    return { event: data.event, notified, skipped }
  }
}

/**
 * Máquinas de estado do bolão (docs/contracts/onda8-bolao.md, "Máquina de estados do
 * bolão") e dos status auxiliares de pagamento (`PoolMember.status`, `PoolPayout.status`)
 * que o router `pool` precisa impor no servidor — nunca confiar que o cliente só oferece
 * os botões válidos na tela.
 *
 * Tudo aqui é puro (sem Prisma, sem `ctx`) para ser testável isoladamente, no mesmo
 * espírito de `server/lib/bet-cost.ts`/`server/lib/wallet-period.ts`.
 *
 * "Nunca pular estado" (CLAUDE.md/contrato): cada transição listada abaixo é UM passo do
 * diagrama. Qualquer outro par (origem, destino) — inclusive repetir o mesmo estado — é
 * ilegal e lança `TRPCError('BAD_REQUEST')` com mensagem em PT-BR explicando o motivo.
 */
import { TRPCError } from '@trpc/server'
import { MemberStatus, PayoutStatus, PoolStatus } from '@lotopro/db'

// ─── Pool.status ─────────────────────────────────────────────────────────────

const POOL_TRANSITIONS: Record<PoolStatus, readonly PoolStatus[]> = {
  [PoolStatus.DRAFT]: [PoolStatus.OPEN, PoolStatus.CANCELED],
  [PoolStatus.OPEN]: [PoolStatus.CLOSED, PoolStatus.CANCELED],
  [PoolStatus.CLOSED]: [PoolStatus.BET_PLACED, PoolStatus.CANCELED],
  [PoolStatus.BET_PLACED]: [PoolStatus.SETTLED, PoolStatus.CANCELED],
  [PoolStatus.SETTLED]: [],
  [PoolStatus.CANCELED]: [],
}

const POOL_STATUS_LABEL: Record<PoolStatus, string> = {
  [PoolStatus.DRAFT]: 'rascunho',
  [PoolStatus.OPEN]: 'aberto',
  [PoolStatus.CLOSED]: 'fechado',
  [PoolStatus.BET_PLACED]: 'aposta registrada',
  [PoolStatus.SETTLED]: 'liquidado',
  [PoolStatus.CANCELED]: 'cancelado',
}

/**
 * Valida `current -> target`. `hasReceiptUrl` só é consultado quando `target === BET_PLACED`
 * (docs/contracts/onda8-bolao.md: "BET_PLACED exige receiptUrl... Transição bloqueada sem ele.").
 * `receiptUrl` é anexado antes, por `pool.attachReceipt` — esta função só verifica a
 * PRESENÇA, nunca recebe/valida a URL em si.
 */
export function assertValidPoolTransition(
  current: PoolStatus,
  target: PoolStatus,
  opts: { hasReceiptUrl: boolean },
): void {
  const allowed = POOL_TRANSITIONS[current]
  if (!allowed.includes(target)) {
    const allowedLabel =
      allowed.length > 0 ? allowed.map((status) => POOL_STATUS_LABEL[status]).join(', ') : 'nenhuma — estado final'
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        `Não é possível mudar o bolão de "${POOL_STATUS_LABEL[current]}" para ` +
        `"${POOL_STATUS_LABEL[target]}". A partir de "${POOL_STATUS_LABEL[current]}" só se vai para: ${allowedLabel}.`,
    })
  }

  if (target === PoolStatus.BET_PLACED && !opts.hasReceiptUrl) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Anexe o comprovante oficial da aposta (pool.attachReceipt) antes de marcar o bolão ' +
        'como "aposta registrada" — BET_PLACED exige receiptUrl.',
    })
  }
}

// ─── PoolMember.status (declaração/confirmação de pagamento) ────────────────

/**
 * Estados a partir dos quais um pagamento ainda pode ser declarado/confirmado.
 * `CONFIRMED` e `REMOVED` são terminais para este fluxo: um pagamento já confirmado pelo
 * organizador não "desconfirma", e um participante removido não paga mais nada.
 */
const PAYMENT_ACTIONABLE_FROM: readonly MemberStatus[] = [
  MemberStatus.INVITED,
  MemberStatus.JOINED,
  MemberStatus.PAID,
]

/** O próprio participante declara que pagou (`pool.payments.declare`). */
export function assertCanDeclarePayment(current: MemberStatus): void {
  if (!PAYMENT_ACTIONABLE_FROM.includes(current)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        current === MemberStatus.CONFIRMED
          ? 'Este pagamento já foi confirmado pelo organizador; não é possível declarar de novo.'
          : 'Não é possível declarar pagamento de um participante removido do bolão.',
    })
  }
}

/** O organizador confirma manualmente o pagamento (`pool.members.confirmPayment`). */
export function assertCanConfirmPayment(current: MemberStatus): void {
  if (!PAYMENT_ACTIONABLE_FROM.includes(current)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        current === MemberStatus.CONFIRMED
          ? 'Este pagamento já foi confirmado.'
          : 'Não é possível confirmar pagamento de um participante removido do bolão.',
    })
  }
}

/** Estados a partir dos quais o PRÓPRIO membro ainda pode sair sozinho (`pool.leave`,
 * Addendum v2 §4). Mais restritivo que `PAYMENT_ACTIONABLE_FROM`: uma vez que o pagamento
 * foi DECLARADO (`PAID`) ou CONFIRMADO, dinheiro pode já ter circulado via Pix P2P — o
 * LotoPro não tem como desfazer isso, então a partir daí só o organizador resolve. */
const LEAVE_ALLOWED_FROM: readonly MemberStatus[] = [MemberStatus.INVITED, MemberStatus.JOINED]

/** O próprio participante sai do bolão (`pool.leave`). Chamador já deve ter excluído
 * `MemberStatus.REMOVED` antes (equivale a "não é membro", mensagem própria no router). */
export function assertCanLeavePool(current: MemberStatus): void {
  if (!LEAVE_ALLOWED_FROM.includes(current)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Não é possível sair do bolão depois de declarar ou ter o pagamento confirmado — fale ' +
        'com o organizador (não dá pra desfazer um Pix que já ocorreu).',
    })
  }
}

/** Estados de `Pool.status` a partir dos quais `members.remove` já não pode mais mexer no
 * roster (achado de auditoria J-5). A partir de `BET_PLACED` a aposta já foi comprada com
 * base nesse roster/rateio de cotas — remover alguém depois disso não desfaz o jogo já
 * feito, só corrompe a contabilidade (a linha vira órfã, sem aparecer no rateio nem no
 * histórico de quem realmente jogou). `SETTLED` é ainda mais tarde (já pode ter rateio
 * calculado apontando pra essa pessoa). */
const MEMBER_REMOVAL_BLOCKED_POOL_STATUSES: readonly PoolStatus[] = [PoolStatus.BET_PLACED, PoolStatus.SETTLED]

/**
 * O organizador remove um participante (`pool.members.remove`). Diferente de `pool.leave`
 * (que é o PRÓPRIO membro saindo — trava em `PAID`, porque o Pix da COTA dele pode já ter
 * saído), aqui é o organizador removendo OUTRA pessoa unilateralmente. Sem trava nenhuma,
 * dava pra remover alguém já `CONFIRMED` — inclusive depois de premiado — fazendo a pessoa
 * sumir do rateio e perder acesso ao bolão sem nenhum motivo formal registrado. Bloqueia:
 * (a) participante com pagamento já `CONFIRMED` — ele tem direito ao rateio se o bolão
 *     premiar; "remover" nesse ponto não é mais gestão de convite, é apagar uma dívida;
 * (b) qualquer participante depois que o bolão passou de `CLOSED` (`BET_PLACED`/`SETTLED`)
 *     — a aposta já foi feita com base nesse roster.
 */
export function assertCanRemoveMember(memberStatus: MemberStatus, poolStatus: PoolStatus): void {
  if (memberStatus === MemberStatus.CONFIRMED) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Não é possível remover um participante com pagamento já CONFIRMADO — ele tem direito ao ' +
        'rateio se o bolão for premiado. Se ele realmente está saindo, resolva o repasse combinado ' +
        'fora do app antes (ou cancele o bolão, se for o caso).',
    })
  }

  if (MEMBER_REMOVAL_BLOCKED_POOL_STATUSES.includes(poolStatus)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Não é possível remover participantes depois que a aposta foi registrada — o roster deste ' +
        'ponto em diante é o que define quem tem direito ao rateio. Fale diretamente com a pessoa ' +
        'se for preciso resolver algo fora do app.',
    })
  }
}

// ─── PoolPayout.status ────────────────────────────────────────────────────────

/**
 * `pool.payout.markPaid` é a única mutation de status de rateio deste router — move
 * `PENDING -> DECLARED_PAID` (o organizador declara que já fez o Pix do rateio para o
 * participante). `CONFIRMED` (o participante confirmando o recebimento) não tem
 * procedure própria no contrato desta onda; fica como pendência para uma onda futura.
 */
export function assertCanMarkPayoutPaid(current: PayoutStatus): void {
  if (current !== PayoutStatus.PENDING) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        current === PayoutStatus.DECLARED_PAID
          ? 'Este rateio já foi marcado como pago.'
          : 'Este rateio já está confirmado; não é possível alterar.',
    })
  }
}

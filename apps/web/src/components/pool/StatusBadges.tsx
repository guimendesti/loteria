/**
 * Pills de status — bolão, participante e rateio. Mesma cara dos badges de
 * conferência já usados em BetCard (`bg-<cor>/10 text-<cor>`, docs/09 §9.2).
 */
import type { MemberStatus, PayoutStatus, PoolStatus } from './types'

const POOL_STATUS: Record<PoolStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Rascunho', className: 'bg-ink-50 text-ink-600' },
  OPEN: { label: 'Aberto', className: 'bg-success/10 text-success' },
  CLOSED: { label: 'Fechado', className: 'bg-warning/10 text-warning' },
  BET_PLACED: { label: 'Aposta registrada', className: 'bg-info/10 text-info' },
  SETTLED: { label: 'Encerrado', className: 'bg-brand-100 text-brand-700' },
  CANCELED: { label: 'Cancelado', className: 'bg-danger/10 text-danger' },
}

export function PoolStatusBadge({ status }: { status: PoolStatus }) {
  const info = POOL_STATUS[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${info.className}`}>
      {info.label}
    </span>
  )
}

const MEMBER_STATUS: Record<MemberStatus, { label: string; className: string }> = {
  INVITED: { label: 'Convidado', className: 'bg-ink-50 text-ink-600' },
  JOINED: { label: 'Aguardando pagamento', className: 'bg-info/10 text-info' },
  PAID: { label: 'Pagamento declarado', className: 'bg-warning/10 text-warning' },
  CONFIRMED: { label: 'Pago', className: 'bg-success/10 text-success' },
  REMOVED: { label: 'Removido', className: 'bg-ink-50 text-ink-400' },
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const info = MEMBER_STATUS[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${info.className}`}>
      {info.label}
    </span>
  )
}

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-warning/10 text-warning' },
  DECLARED_PAID: { label: 'Pago (declarado)', className: 'bg-info/10 text-info' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-success/10 text-success' },
}

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const info = PAYOUT_STATUS[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${info.className}`}>
      {info.label}
    </span>
  )
}

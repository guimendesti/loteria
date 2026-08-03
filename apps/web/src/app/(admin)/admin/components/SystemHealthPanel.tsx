import { formatDateTime, formatMinutesAgo } from '../../components/format'

type TrafficLightStatus = 'green' | 'yellow' | 'red'

export interface LotteryHealth {
  lotterySlug: string
  lotteryName: string
  lastContestNumber: number | null
  lastContestCreatedAt: Date | string | null
  minutesSinceLastSync: number | null
  status: TrafficLightStatus
}

export interface SystemHealthData {
  lotteries: LotteryHealth[]
  betChecks24h: number
  failedNotifications24h: number
  notificationsStatus: TrafficLightStatus
  overdueInvoices: number
  invoicesStatus: TrafficLightStatus
  overallStatus: TrafficLightStatus
}

const STATUS_LABEL: Record<TrafficLightStatus, string> = {
  green: 'Normal',
  yellow: 'Atenção',
  red: 'Crítico',
}

const STATUS_DOT_CLASS: Record<TrafficLightStatus, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-danger',
}

/**
 * Semáforo — NUNCA só a cor do ponto: sempre acompanhado do texto `STATUS_LABEL`
 * (docs/09 §9.7, "acerto/erro indicado por ícone + cor + texto, nunca só cor").
 */
function StatusDot({ status }: { status: TrafficLightStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[status]}`} />
      <span className="text-sm font-medium text-ink-900">{STATUS_LABEL[status]}</span>
    </span>
  )
}

/**
 * BO-04 (crítico) — saúde do sistema. Ver `server/routers/admin/dashboard.ts` para a
 * heurística documentada do semáforo por modalidade (aproximação a partir de
 * `Lottery.drawSchedule`, não a lógica real de sincronização do worker).
 */
export function SystemHealthPanel({ data }: { data: SystemHealthData }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Status geral</p>
        <StatusDot status={data.overallStatus} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-ink-400">
              <th className="pb-2 font-normal">Modalidade</th>
              <th className="pb-2 font-normal">Último concurso</th>
              <th className="pb-2 font-normal">Última sincronização</th>
              <th className="pb-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.lotteries.map((lottery) => (
              <tr key={lottery.lotterySlug} className="border-t border-ink-200">
                <td className="py-2 text-ink-900">{lottery.lotteryName}</td>
                <td className="py-2 text-ink-600">
                  {lottery.lastContestNumber !== null ? `#${lottery.lastContestNumber}` : '—'}
                </td>
                <td className="py-2 text-ink-600">
                  {formatMinutesAgo(lottery.minutesSinceLastSync)}
                  {lottery.lastContestCreatedAt ? (
                    <span className="ml-1 text-ink-400">({formatDateTime(lottery.lastContestCreatedAt)})</span>
                  ) : null}
                </td>
                <td className="py-2">
                  <StatusDot status={lottery.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
          <p className="text-xs text-ink-600">Conferências (24h)</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{data.betChecks24h.toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-600">Notificações falhadas (24h)</p>
            <StatusDot status={data.notificationsStatus} />
          </div>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">
            {data.failedNotifications24h.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-600">Faturas pendentes vencidas</p>
            <StatusDot status={data.invoicesStatus} />
          </div>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">
            {data.overdueInvoices.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  )
}

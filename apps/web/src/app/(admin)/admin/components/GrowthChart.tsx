import { formatMonthLabel } from '../../components/format'

export interface GrowthChartDatum {
  /** "YYYY-MM" (America/Sao_Paulo) — `server/lib/wallet-period.ts` (`monthKey`). */
  month: string
  newUsers: number
  newSubscribers: number
}

export interface GrowthChartProps {
  data: GrowthChartDatum[]
}

/**
 * BO-02 — crescimento de usuários/assinantes. `Recharts` não está instalado nesta base
 * (mesma pendência documentada em `(app)/app/carteira/components/MonthlyChart.tsx`, que
 * este componente espelha): barras em CSS puro + tabela alternativa em `<details>` para
 * leitores de tela (docs/09 §9.3 C8).
 */
export function GrowthChart({ data }: GrowthChartProps) {
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.newUsers, d.newSubscribers)))
  const hasAnyData = data.some((d) => d.newUsers > 0 || d.newSubscribers > 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-info" />
          Novos cadastros
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
          Novos assinantes
        </span>
      </div>

      {hasAnyData ? (
        <div className="mt-3 overflow-x-auto">
          <div aria-hidden="true" className="flex min-w-[560px] items-end gap-2 border-b border-ink-200">
            {data.map((d) => {
              const usersHeightPct = (d.newUsers / maxValue) * 100
              const subscribersHeightPct = (d.newSubscribers / maxValue) * 100
              const label = formatMonthLabel(d.month)
              return (
                <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div
                      title={`${label} · Cadastros: ${d.newUsers}`}
                      className="w-3 rounded-t-sm bg-info sm:w-4"
                      style={{ height: `${usersHeightPct}%`, minHeight: d.newUsers > 0 ? 2 : 0 }}
                    />
                    <div
                      title={`${label} · Assinantes: ${d.newSubscribers}`}
                      className="w-3 rounded-t-sm bg-success sm:w-4"
                      style={{ height: `${subscribersHeightPct}%`, minHeight: d.newSubscribers > 0 ? 2 : 0 }}
                    />
                  </div>
                  <span className="text-[11px] text-ink-400">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-600">Sem cadastros ou assinaturas novas nesses meses.</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-brand-500 hover:text-brand-700">
          Ver dados em tabela
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-400">
                <th className="pb-1 font-normal">Mês</th>
                <th className="pb-1 text-right font-normal">Cadastros</th>
                <th className="pb-1 text-right font-normal">Assinantes</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-ink-200">
                  <td className="py-1 text-ink-900">{formatMonthLabel(d.month)}</td>
                  <td className="py-1 text-right text-ink-900">{d.newUsers}</td>
                  <td className="py-1 text-right text-ink-900">{d.newSubscribers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

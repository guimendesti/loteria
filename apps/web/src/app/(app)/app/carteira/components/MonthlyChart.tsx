import { formatCents } from '../../components/format-cents'

export interface MonthlyChartDatum {
  /** "YYYY-MM" (America/Sao_Paulo) — ver `server/lib/wallet-period.ts`. */
  month: string
  spentCents: bigint
  prizeCents: bigint
}

export interface MonthlyChartProps {
  data: MonthlyChartDatum[]
}

const monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

/** "2026-08" → "ago/26". Meio-dia UTC evita a data "vazar" pro dia anterior ao formatar. */
function formatMonthLabel(month: string): string {
  const parts = month.split('-')
  const year = Number(parts[0])
  const monthNumber = Number(parts[1] ?? '1')
  const date = new Date(Date.UTC(year, monthNumber - 1, 1, 12))
  return monthLabelFormatter.format(date).replace('.', '')
}

/**
 * C8 (docs/09-design-system-e-ux.md §9.3) — evolução mensal (CL-93).
 * `Recharts` não está instalado nesta base (`apps/web/package.json` não lista
 * a dependência) — pendência anotada no router `wallet` (`monthly`). Este
 * componente desenha as barras em CSS puro e expõe os mesmos dados numa
 * tabela dentro de `<details>`, exatamente como o C8 já prevê para leitores
 * de tela ("legenda textual acessível + tabela de dados alternativa").
 *
 * As barras (`aria-hidden`) são só reforço visual: a fonte de verdade
 * acessível é a legenda (texto, não só cor) + a tabela sempre presente no DOM.
 */
export function MonthlyChart({ data }: MonthlyChartProps) {
  const maxCents = data.reduce((max, d) => {
    const higher = d.spentCents > d.prizeCents ? d.spentCents : d.prizeCents
    return higher > max ? higher : max
  }, 0n)
  const maxValue = Math.max(1, Number(maxCents)) // evita divisão por zero quando a série inteira é 0
  const hasAnyData = data.some((d) => d.spentCents > 0n || d.prizeCents > 0n)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-ink-600">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-info" />
            Gasto
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
            Prêmio
          </span>
        </div>
        {hasAnyData ? <span className="text-xs text-ink-400">Escala até {formatCents(maxCents)}</span> : null}
      </div>

      {hasAnyData ? (
        <div className="mt-3 overflow-x-auto">
          <div aria-hidden="true" className="flex min-w-[560px] items-end gap-2 border-b border-ink-200">
            {data.map((d) => {
              const spentHeightPct = (Number(d.spentCents) / maxValue) * 100
              const prizeHeightPct = (Number(d.prizeCents) / maxValue) * 100
              const label = formatMonthLabel(d.month)
              return (
                <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div
                      title={`${label} · Gasto: ${formatCents(d.spentCents)}`}
                      className="w-3 rounded-t-sm bg-info sm:w-4"
                      style={{ height: `${spentHeightPct}%`, minHeight: d.spentCents > 0n ? 2 : 0 }}
                    />
                    <div
                      title={`${label} · Prêmio: ${formatCents(d.prizeCents)}`}
                      className="w-3 rounded-t-sm bg-success sm:w-4"
                      style={{ height: `${prizeHeightPct}%`, minHeight: d.prizeCents > 0n ? 2 : 0 }}
                    />
                  </div>
                  <span className="text-[11px] text-ink-400">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-600">Sem gasto ou prêmio registrado nesses meses.</p>
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
                <th className="pb-1 text-right font-normal">Gasto</th>
                <th className="pb-1 text-right font-normal">Prêmio</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-ink-200">
                  <td className="py-1 text-ink-900">{formatMonthLabel(d.month)}</td>
                  <td className="py-1 text-right text-ink-900">{formatCents(d.spentCents)}</td>
                  <td className="py-1 text-right text-ink-900">{formatCents(d.prizeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

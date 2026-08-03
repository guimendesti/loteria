import { formatPct } from '../../components/format'

export interface FunnelStep {
  key: string
  label: string
  count: number
  pctOfSignups: number
}

export interface FunnelChartProps {
  steps: FunnelStep[]
}

/**
 * BO-03 — funil cadastro → 1º jogo → 1ª conferência → assinante. Barras horizontais em
 * CSS puro (mesmo motivo de `GrowthChart`/`MonthlyChart`: sem Recharts instalado) — cada
 * barra já mostra o número absoluto E o percentual sobre o total de cadastros como TEXTO
 * (não só a largura da barra — docs/09 §9.7, "nunca usar cor/tamanho como único portador
 * de informação").
 */
export function FunnelChart({ steps }: FunnelChartProps) {
  const maxCount = Math.max(1, ...steps.map((step) => step.count))

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, index) => {
        const widthPct = (step.count / maxCount) * 100
        const previous = index > 0 ? steps[index - 1] : undefined
        const dropFromPrevious =
          previous && previous.count > 0 ? 100 - (step.count / previous.count) * 100 : null

        return (
          <div key={step.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink-900">{step.label}</span>
              <span className="text-ink-600">
                {step.count.toLocaleString('pt-BR')} · {formatPct(step.pctOfSignups)} do total
              </span>
            </div>
            <div className="mt-1 h-3 w-full rounded-full bg-ink-100" role="img" aria-label={`${step.label}: ${step.count} (${formatPct(step.pctOfSignups)} do total de cadastros)`}>
              <div
                className="h-3 rounded-full bg-brand-500"
                style={{ width: `${Math.max(widthPct, step.count > 0 ? 2 : 0)}%` }}
              />
            </div>
            {dropFromPrevious !== null && dropFromPrevious > 0 ? (
              <p className="mt-1 text-xs text-ink-400">
                −{formatPct(dropFromPrevious)} em relação à etapa anterior
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

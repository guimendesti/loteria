import type { LotteryConfig } from '@lotopro/core'

/**
 * Próxima data/hora de sorteio a partir de `config.drawSchedule` (docs/08
 * CL-01 — contagem regressiva do dashboard). Cálculo simples client-side:
 * varre os próximos 14 dias e casa com as entradas de
 * `drawSchedule.entries`.
 *
 * Pendência conhecida (ver relatório): usa o relógio/timezone local do
 * navegador, não força America/Sao_Paulo como o resto do domínio — aceitável
 * para uma contagem regressiva de painel, não para cálculo de corte de
 * apostas (isso é responsabilidade do servidor).
 */
export function nextDrawDateTime(config: LotteryConfig, from: Date = new Date()): Date | null {
  const entries = config.drawSchedule.entries
  if (entries.length === 0) return null

  let best: Date | null = null
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset)
    for (const entry of entries) {
      if (day.getDay() !== entry.day) continue
      const [hours, minutes] = entry.time.split(':').map(Number)
      const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours ?? 0, minutes ?? 0, 0, 0)
      if (candidate.getTime() <= from.getTime()) continue
      if (!best || candidate < best) best = candidate
    }
  }
  return best
}

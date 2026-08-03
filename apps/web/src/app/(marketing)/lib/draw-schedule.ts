/**
 * Descrição textual de `LotteryConfig.drawSchedule` (packages/core) em português —
 * usado nas páginas de resultados (LP-07) para dizer "quando sai o próximo sorteio"
 * sem depender de countdown client-side (hora do browser — problema conhecido,
 * ver ORQUESTRACAO.md P10, fora do território desta tarefa).
 */
import type { DrawSchedule } from '@lotopro/core'

const WEEKDAY_PLURAL = [
  'domingos',
  'segundas-feiras',
  'terças-feiras',
  'quartas-feiras',
  'quintas-feiras',
  'sextas-feiras',
  'sábados',
] as const

/** Agrupa por horário (entries com o mesmo `time` viram uma frase só: "terças e quintas às 20h"). */
export function describeDrawSchedule(schedule: DrawSchedule): string {
  const byTime = new Map<string, number[]>()
  for (const entry of schedule.entries) {
    const days = byTime.get(entry.time) ?? []
    days.push(entry.day)
    byTime.set(entry.time, days)
  }

  const parts: string[] = []
  for (const [time, days] of byTime) {
    const sortedDays = [...days].sort((a, b) => a - b)
    const dayNames = sortedDays.map((day) => WEEKDAY_PLURAL[day] ?? 'dias variáveis')
    const joined =
      dayNames.length <= 1
        ? (dayNames[0] ?? 'dias variáveis')
        : `${dayNames.slice(0, -1).join(', ')} e ${dayNames[dayNames.length - 1]}`
    parts.push(`${joined} às ${time}`)
  }

  return parts.length > 0 ? parts.join(' · ') : 'Agenda a confirmar'
}

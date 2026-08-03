/**
 * `Contest.extraResult` é `Json` (packages/db/prisma/schema.prisma) — narrowing
 * seguro para o shape tipado `ExtraResult` do core (trevos/mês/time). Mesma
 * ideia de `server/lib/bet-json.ts` (que trata `ExtraPicks` de `Bet`), mas
 * local a `resultados/` porque o shape é outro (`ExtraResult.teamName` vs.
 * `ExtraPicks.teamId`) e este agente não edita `server/lib` fora do que já
 * criou para o router `wallet`.
 */
import type { ExtraResult } from '@lotopro/core'

export function parseExtraResult(json: unknown): ExtraResult | null {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) return null
  const record = json as Record<string, unknown>

  if (record.kind === 'CLOVER' && Array.isArray(record.clovers)) {
    const clovers = record.clovers.filter((n): n is number => typeof n === 'number')
    return { kind: 'CLOVER', clovers }
  }
  if (record.kind === 'MONTH' && typeof record.month === 'number') {
    return { kind: 'MONTH', month: record.month }
  }
  if (record.kind === 'TEAM' && typeof record.teamName === 'string') {
    return { kind: 'TEAM', teamName: record.teamName }
  }
  return null
}

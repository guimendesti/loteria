/**
 * (De)serialização dos campos `Json` de `Bet`/`BetCheck` (packages/db/prisma/schema.prisma)
 * de/para os tipos tipados do core (`ExtraPicks`, `TierCount`).
 *
 * `BetCheck.tierCounts` guarda `prizeCents` como STRING dentro do JSON (JSON não
 * representa `bigint` — ver comentário no schema). Convertendo para `bigint` aqui,
 * o superjson (registrado em `server/trpc.ts`) cuida de serializar corretamente
 * de volta para o cliente, em qualquer profundidade da árvore de resposta.
 */
import type { Prisma } from '@lotopro/db'
import type { ExtraPicks, TierCount } from '@lotopro/core'

export function parseExtraPicks(json: Prisma.JsonValue | null | undefined): ExtraPicks | undefined {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) {
    return undefined
  }
  return json as unknown as ExtraPicks
}

export function parseColumns(json: Prisma.JsonValue | null | undefined): number[][] | undefined {
  if (!Array.isArray(json)) return undefined
  return json as unknown as number[][]
}

export function parseTierCounts(json: Prisma.JsonValue | null | undefined): TierCount[] {
  if (!Array.isArray(json)) return []
  const result: TierCount[] = []
  for (const entry of json) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const { tier, count, prizeCents } = record
    if (typeof tier !== 'number' || typeof count !== 'number') continue
    result.push({
      tier,
      count,
      prizeCents: typeof prizeCents === 'string' ? BigInt(prizeCents) : 0n,
    })
  }
  return result
}

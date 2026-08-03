/**
 * DTO serializável de um concurso para o conferidor público — a fronteira
 * Server → Client Component do Next.js não aceita `bigint`/`Date` diretamente
 * como prop (payload React "Flight"), então `page.tsx` converte
 * `CheckerContestRow` (Prisma, com `bigint`/`Date`) para este formato antes de
 * passar para `PublicChecker` ('use client').
 */
export interface CheckerPrizeDTO {
  tier: number
  label: string
  winnersCount: number
  /** `bigint` serializado — reconstruído com `BigInt(...)` no client. */
  prizeCentsStr: string
}

export interface CheckerContestDTO {
  id: string
  number: number
  /** `YYYY-MM-DD` local em America/Sao_Paulo — contrato de `ContestResult.drawDate` (core). */
  drawDateIso: string
  /** `DD/MM/AAAA` — só para exibição no <select>. */
  drawDateBR: string
  numbers: number[]
  numbersDrawOrder: number[]
  secondaryNumbers: number[]
  prizes: CheckerPrizeDTO[]
}

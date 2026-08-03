/**
 * `PoolPayout.sharesRatio` é `Decimal @db.Decimal(10, 8)` no schema — precisa entrar no
 * Prisma como `string` (ou `Prisma.Decimal`), NUNCA `number` (CLAUDE.md §5 / contrato,
 * invariante 7: perde precisão). Esta função só formata o texto; o dinheiro de verdade
 * (`amountCents`) já vem calculado em `bigint` por `computePayout` (`@lotopro/core`) —
 * `sharesRatio` aqui é puramente informativo (auditoria/exibição), não é usado para
 * nenhuma conta.
 */
export function sharesRatioDecimalString(shares: number, totalShares: number): string {
  if (!Number.isInteger(shares) || shares < 0) {
    throw new Error(`sharesRatioDecimalString: shares deve ser inteiro >= 0; veio ${shares}.`)
  }
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error(`sharesRatioDecimalString: totalShares deve ser inteiro positivo; veio ${totalShares}.`)
  }

  // 8 casas decimais (mesma escala do campo) via aritmética inteira — trunca (floor),
  // nunca arredonda por cima (não pode sugerir mais cota do que a pessoa realmente tem).
  const SCALE = 100_000_000n
  const scaled = (BigInt(shares) * SCALE) / BigInt(totalShares)
  const whole = scaled / SCALE
  const frac = (scaled % SCALE).toString().padStart(8, '0')
  return `${whole}.${frac}`
}

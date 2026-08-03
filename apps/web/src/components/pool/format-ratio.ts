/**
 * `PayoutRow.sharesRatio` chega do servidor como STRING (Decimal(10,8) do
 * Prisma — docs/contracts/onda8-bolao.md). É usado aqui só para exibição
 * (percentual de cotas no rateio). O valor que importa de verdade é sempre
 * `amountCents` (bigint), já calculado e arredondado no servidor — nunca usar
 * este percentual para recalcular dinheiro no cliente.
 */
export function formatShareRatioPercent(sharesRatio: string): string {
  const value = Number(sharesRatio)
  if (!Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(2).replace('.', ',')}%`
}

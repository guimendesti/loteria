/**
 * Formata centavos como moeda BRL. Dinheiro é sempre `bigint` no domínio
 * (CLAUDE.md §5) — a conversão para `number` acontece só aqui, na borda de
 * apresentação, nunca no caminho de cálculo.
 */
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCents(cents: bigint | number): string {
  const value = typeof cents === 'bigint' ? Number(cents) : cents
  return currencyFormatter.format(value / 100)
}

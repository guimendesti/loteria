/**
 * Dinheiro é sempre `bigint` de centavos (CLAUDE.md regra 5). Este helper só formata para
 * texto de notificação — nunca faz aritmética em `number`/float.
 */
export function centsToBRL(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const reais = abs / 100n
  const centavos = abs % 100n
  return `${negative ? '-' : ''}R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`
}

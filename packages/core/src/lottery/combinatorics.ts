/**
 * Combinatória exata em BigInt.
 *
 * Usada pelo motor de preços: uma aposta múltipla custa o preço da aposta simples
 * multiplicado pela quantidade de apostas simples que ela contém — C(picks, picksMin).
 * Nunca usar `number` aqui: C(20,6) já passa de 38 mil e C(50,25) estoura o Number.MAX_SAFE_INTEGER.
 */

/**
 * Coeficiente binomial C(n, k) em BigInt, sem overflow e sem divisão inexata.
 *
 * Retorna 0n para entradas inválidas (n/k não inteiros, negativos ou k > n),
 * de modo que o chamador nunca receba `NaN` nem um preço "quase certo".
 */
export function combinations(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k)) return 0n
  if (n < 0 || k < 0 || k > n) return 0n

  // C(n,k) === C(n, n-k) — itera pelo menor dos dois para reduzir o número de passos.
  const steps = Math.min(k, n - k)
  let result = 1n
  for (let i = 1; i <= steps; i++) {
    // Invariante: após o passo i, result === C(n - steps + i, i).
    // A divisão é sempre exata porque C(m, i) é inteiro.
    result = (result * BigInt(n - steps + i)) / BigInt(i)
  }
  return result
}

/** Produto de uma lista de tamanhos, em BigInt. Base do preço de Super Sete e Loteca. */
export function productOf(sizes: readonly number[]): bigint {
  let acc = 1n
  for (const size of sizes) {
    if (!Number.isInteger(size) || size < 0) return 0n
    acc *= BigInt(size)
  }
  return acc
}

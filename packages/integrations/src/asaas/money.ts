/**
 * Conversão de dinheiro na borda do Asaas.
 *
 * CLAUDE.md regra 5: **dentro do sistema, dinheiro é `bigint` de centavos, nunca float**.
 * O Asaas, porém, fala reais decimais (`"value": 24.9`). Esta é a única fronteira onde a
 * conversão acontece — nada além deste módulo (e dos schemas que o usam) vê `number` de
 * dinheiro.
 *
 * ── Centavos → reais (escrita) ────────────────────────────────────────────────
 * `Number(valueCents) / 100`.
 *
 * Por que é exato para os nossos valores:
 * 1. `Number(bigint)` é exato para |c| ≤ 2^53−1 = `Number.MAX_SAFE_INTEGER` (todo inteiro
 *    nessa faixa é representável em double). Fora dela, arredondaria — por isso
 *    `centsToReais` **lança** `RangeError` acima do limite, em vez de mentir.
 * 2. `c / 100` devolve o double mais próximo do racional c/100 (IEEE-754: divisão é
 *    corretamente arredondada). Esse double pode não ser c/100 exato — 24.9 não existe em
 *    binário —, mas é o **mesmo** double que o literal `24.9` produz.
 * 3. `JSON.stringify` emite a menor representação decimal que faz round-trip para aquele
 *    double. Como o decimal de 2 casas c/100 faz round-trip (por 2), a menor tem no máximo
 *    o mesmo número de dígitos: `2490n → 24.9`, `10000n → 1`, `2499n → 24.99`. Nunca
 *    `24.900000000000002`.
 * Resultado: o JSON enviado ao Asaas carrega exatamente os centavos que pedimos.
 * (A propriedade 3 degrada para magnitudes perto de 2^53, onde o ULP do double passa de
 * 0,01 — irrelevante aqui: seria uma assinatura de ~R$ 90 bilhões.)
 *
 * ── Reais → centavos (leitura) ────────────────────────────────────────────────
 * Reusa `moneyToCents` de `../caixa/parse` (exportado pelo pacote): manipulação de string
 * decimal em `BigInt`, com `String(value)` (round-trip mais curto do double) como ponte.
 * `Math.round(v * 100)` erraria casos como `1.005`.
 */

import { moneyToCents } from '../caixa/parse'

/** Maior valor em centavos convertível para `number` sem perda: R$ 90.071.992.547.409,91. */
export const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Centavos (`bigint`) → reais decimais (`number`), como o Asaas espera no corpo JSON.
 *
 * @throws {RangeError} se negativo ou acima de `MAX_SAFE_CENTS`.
 */
export function centsToReais(valueCents: bigint): number {
  if (valueCents < 0n) {
    throw new RangeError(`valor monetário negativo não é aceito pelo Asaas: ${valueCents}`)
  }
  if (valueCents > MAX_SAFE_CENTS) {
    throw new RangeError(
      `valor em centavos acima do limite exato de conversão (${MAX_SAFE_CENTS}): ${valueCents}`,
    )
  }
  return Number(valueCents) / 100
}

/**
 * Reais decimais devolvidos pelo Asaas → centavos (`bigint`).
 *
 * @throws {Error} se o valor não for um decimal monetário válido (propagado de
 * `moneyToCents`; nos schemas Zod deste módulo isso vira issue de validação e, no fim,
 * `AsaasApiError`).
 */
export function reaisToCents(value: number): bigint {
  const cents = moneyToCents(value)
  if (cents === null) throw new TypeError(`valor monetário ausente: ${String(value)}`)
  return cents
}

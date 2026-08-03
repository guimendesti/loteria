import { describe, expect, it } from 'vitest'
import { centsToReais, reaisToCents, MAX_SAFE_CENTS } from '../../src/asaas/money'

describe('centsToReais — centavos (bigint) → reais (number)', () => {
  it('converte os valores de tabela do produto (docs/05 §5.5)', () => {
    expect(centsToReais(2490n)).toBe(24.9) // Premium mensal
    expect(centsToReais(2366n)).toBe(23.66) // Premium mensal com 5% off do Pix
    expect(centsToReais(24900n)).toBe(249) // Premium anual
    expect(centsToReais(4990n)).toBe(49.9)
  })

  it('lida com as bordas: 0, 1 centavo, valores redondos', () => {
    expect(centsToReais(0n)).toBe(0)
    expect(centsToReais(1n)).toBe(0.01)
    expect(centsToReais(10n)).toBe(0.1)
    expect(centsToReais(100n)).toBe(1)
    expect(centsToReais(99n)).toBe(0.99)
  })

  /**
   * O que de fato importa: o JSON que sai daqui tem que carregar exatamente os centavos
   * pedidos — nunca `24.900000000000002`.
   */
  it('serializa em JSON com no máximo 2 casas e sem lixo binário', () => {
    for (let cents = 0n; cents <= 5_000n; cents += 1n) {
      const json = JSON.stringify(centsToReais(cents))
      expect(json).toMatch(/^\d+(\.\d{1,2})?$/)
      expect(Math.round(Number(json) * 100)).toBe(Number(cents))
    }
  })

  it('rejeita negativo e valor acima do limite exato de conversão', () => {
    expect(() => centsToReais(-1n)).toThrow(RangeError)
    expect(() => centsToReais(MAX_SAFE_CENTS + 1n)).toThrow(RangeError)
    expect(() => centsToReais(MAX_SAFE_CENTS)).not.toThrow()
  })
})

describe('reaisToCents — reais (number) → centavos (bigint)', () => {
  it('converte os valores devolvidos pelo Asaas', () => {
    expect(reaisToCents(24.9)).toBe(2490n)
    expect(reaisToCents(23.66)).toBe(2366n)
    expect(reaisToCents(249)).toBe(24900n)
    expect(reaisToCents(0)).toBe(0n)
    expect(reaisToCents(0.01)).toBe(1n)
  })

  /**
   * Prova de que a técnica de string decimal (herdada de `caixa/parse.ts`) é usada:
   * `Math.round(1.005 * 100)` dá 100 em IEEE-754. A conversão correta do literal decimal
   * `1.005` é 101 centavos (meio-para-cima na 3ª casa).
   */
  it('não usa aritmética de float (CLAUDE.md regra 5)', () => {
    expect(Math.round(1.005 * 100)).toBe(100) // o jeito errado
    expect(reaisToCents(1.005)).toBe(101n) // o jeito certo
    expect(reaisToCents(1234.565)).toBe(123457n)
    expect(reaisToCents(0.1 + 0.2)).toBe(30n)
  })

  it('faz round-trip com centsToReais', () => {
    const values = [0n, 1n, 7n, 99n, 100n, 2366n, 2490n, 24900n, 123456789n]
    for (const cents of values) {
      expect(reaisToCents(centsToReais(cents))).toBe(cents)
    }
  })
})

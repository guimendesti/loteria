import { describe, expect, it } from 'vitest'
import { canAcceptShares, computeShareMath } from '../shares'

/** PRNG determinístico (mulberry32) — mesma semente, mesma bateria de casos, sempre. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('computeShareMath — casos manuais', () => {
  it('divisão exata: cota sem sobra', () => {
    const math = computeShareMath(900n, 3)
    expect(math.shareValueCents).toBe(300n)
    expect(math.surplusCents).toBe(0n)
    expect(math.totalCostCents).toBe(900n)
    expect(math.totalShares).toBe(3)
  })

  it('divisão não exata: cota arredonda para CIMA, nunca falta dinheiro', () => {
    const math = computeShareMath(1000n, 3)
    // 1000/3 = 333.33..., a cota tem que cobrir o custo inteiro.
    expect(math.shareValueCents).toBe(334n)
    expect(math.shareValueCents * 3n).toBeGreaterThanOrEqual(1000n)
    expect(math.surplusCents).toBe(2n) // 334*3 - 1000
  })

  it('custo e cota de 1 centavo', () => {
    const math = computeShareMath(1n, 1)
    expect(math.shareValueCents).toBe(1n)
    expect(math.surplusCents).toBe(0n)
  })

  it('bolão grande: R$ 1.234,56 em 7 cotas', () => {
    const math = computeShareMath(123_456n, 7)
    // ceil(123456/7) = ceil(17636.57) = 17637
    expect(math.shareValueCents).toBe(17_637n)
    expect(math.shareValueCents * 7n).toBeGreaterThanOrEqual(123_456n)
    expect(math.surplusCents).toBe(17_637n * 7n - 123_456n)
  })

  it('caso patológico documentado: cotas >> custo faz surplus > shareValue', () => {
    // 1 centavo de custo dividido em 100 cotas: cada cota ainda custa 1 centavo
    // (não dá pra cobrar fração de centavo), então sobra praticamente tudo.
    // Isto prova que "surplus < shareValue" NÃO é uma lei universal — só vale no
    // domínio realista em que o custo por cota é maior que o número de cotas.
    // As invariantes que SEMPRE valem, para qualquer entrada válida, são:
    //   shareValue × totalShares >= totalCostCents
    //   surplusCents === shareValue × totalShares − totalCostCents  (por definição)
    //   0 <= surplusCents < totalShares                              (resto do ceil-div)
    const math = computeShareMath(1n, 100)
    expect(math.shareValueCents).toBe(1n)
    expect(math.surplusCents).toBe(99n)
    expect(math.surplusCents).toBeGreaterThan(math.shareValueCents)
    expect(math.surplusCents).toBeLessThan(BigInt(math.totalShares))
  })
})

describe('computeShareMath — entradas inválidas', () => {
  it('rejeita totalShares <= 0', () => {
    expect(() => computeShareMath(1000n, 0)).toThrow(/totalShares/)
    expect(() => computeShareMath(1000n, -5)).toThrow(/totalShares/)
  })

  it('rejeita totalShares não inteiro', () => {
    expect(() => computeShareMath(1000n, 2.5)).toThrow(/totalShares/)
  })

  it('rejeita totalCostCents <= 0n', () => {
    expect(() => computeShareMath(0n, 5)).toThrow(/totalCostCents/)
    expect(() => computeShareMath(-100n, 5)).toThrow(/totalCostCents/)
  })
})

describe('computeShareMath — invariantes universais (1000 casos pseudo-aleatórios)', () => {
  it('shareValue × shares >= custo, e surplus é o resto exato do ceil-div (< totalShares)', () => {
    const random = mulberry32(0x1234abcd)

    for (let i = 0; i < 1000; i++) {
      const totalShares = 1 + Math.floor(random() * 500)
      // Custo de 1 centavo a ~R$ 10 milhões, sempre bigint.
      const totalCostCents = BigInt(1 + Math.floor(random() * 1_000_000_000))

      const math = computeShareMath(totalCostCents, totalShares)

      expect(math.shareValueCents * BigInt(totalShares)).toBeGreaterThanOrEqual(totalCostCents)
      expect(math.surplusCents).toBe(math.shareValueCents * BigInt(totalShares) - totalCostCents)
      expect(math.surplusCents >= 0n).toBe(true)
      expect(math.surplusCents < BigInt(totalShares)).toBe(true)
    }
  })

  it('domínio realista de bolão (custo >> nº de cotas): surplus < shareValue também vale', () => {
    const random = mulberry32(0x9e3779b9)

    for (let i = 0; i < 1000; i++) {
      const totalShares = 1 + Math.floor(random() * 60) // bolões raramente passam de 60 cotas
      // Custo mínimo bem acima de totalShares² (60² = 3600) para o custo por cota
      // nunca cair abaixo de 1 real — cenário realista de aposta em loteria.
      const totalCostCents = BigInt(50_000 + Math.floor(random() * 500_000_000))

      const math = computeShareMath(totalCostCents, totalShares)
      expect(math.surplusCents).toBeLessThan(math.shareValueCents)
    }
  })
})

describe('canAcceptShares', () => {
  it('aceita quando cabe exatamente no total', () => {
    expect(canAcceptShares(2, 3, 5)).toBe(true)
    expect(canAcceptShares(0, 5, 5)).toBe(true)
  })

  it('rejeita quando estoura o total', () => {
    expect(canAcceptShares(3, 3, 5)).toBe(false)
    expect(canAcceptShares(5, 1, 5)).toBe(false)
  })

  it('rejeita requested <= 0', () => {
    expect(canAcceptShares(0, 0, 5)).toBe(false)
    expect(canAcceptShares(0, -1, 5)).toBe(false)
  })

  it('rejeita taken negativo ou total <= 0', () => {
    expect(canAcceptShares(-1, 1, 5)).toBe(false)
    expect(canAcceptShares(0, 1, 0)).toBe(false)
  })

  it('rejeita valores não inteiros', () => {
    expect(canAcceptShares(1.5, 1, 5)).toBe(false)
    expect(canAcceptShares(1, 1.5, 5)).toBe(false)
    expect(canAcceptShares(1, 1, 5.5)).toBe(false)
  })
})

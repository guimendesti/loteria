import { describe, expect, it } from 'vitest'
import {
  betMultiplier,
  combinations,
  getLotteryConfig,
  priceBet,
  productOf,
  resolvePrice,
  type BetInput,
} from '../src/index'
import { range } from './helpers'

describe('combinatória', () => {
  it('casos de borda', () => {
    expect(combinations(6, 6)).toBe(1n)
    expect(combinations(5, 0)).toBe(1n)
    expect(combinations(3, 5)).toBe(0n)
    expect(combinations(-1, 2)).toBe(0n)
    expect(combinations(5, -1)).toBe(0n)
    expect(combinations(2.5, 1)).toBe(0n)
  })

  it('valores conhecidos', () => {
    expect(combinations(7, 6)).toBe(7n)
    expect(combinations(15, 6)).toBe(5005n)
    expect(combinations(20, 6)).toBe(38760n)
    expect(combinations(17, 15)).toBe(136n)
  })

  it('é exata acima do Number.MAX_SAFE_INTEGER', () => {
    // C(100,50) = 100891344545564193334812497256 — impossível em float.
    expect(combinations(100, 50)).toBe(100891344545564193334812497256n)
    expect(combinations(60, 30)).toBe(118264581564861424n)
  })

  it('produto de colunas', () => {
    expect(productOf([1, 1, 1, 1, 1, 1, 1])).toBe(1n)
    expect(productOf([3, 2, 1, 1, 1, 1, 1])).toBe(6n)
    expect(productOf([])).toBe(1n)
    expect(productOf([2, -1])).toBe(0n)
  })
})

describe('preço — Mega-Sena (tabela 2026)', () => {
  const config = getLotteryConfig('megasena')
  const bet = (n: number): BetInput => ({ lottery: 'megasena', numbers: range(n) })

  it('6 dezenas = R$ 6,00', () => {
    expect(priceBet(config, bet(6))).toBe(600n)
  })

  it('7 dezenas = R$ 42,00 (C(7,6) = 7)', () => {
    expect(priceBet(config, bet(7))).toBe(4200n)
  })

  it('15 dezenas = R$ 30.030,00 (C(15,6) = 5005)', () => {
    expect(priceBet(config, bet(15))).toBe(3003000n)
  })

  it('20 dezenas (máximo) = C(20,6) × 600', () => {
    expect(priceBet(config, bet(20))).toBe(38760n * 600n)
  })

  it('o breakdown expõe faixa e multiplicador', () => {
    const resolved = resolvePrice(config, bet(7))
    expect(resolved?.multiplier).toBe(7n)
    expect(resolved?.tier.picks).toBe(7)
    expect(resolved?.priceCents).toBe(4200n)
  })
})

describe('preço — Lotofácil (tabela 2026)', () => {
  const config = getLotteryConfig('lotofacil')
  const bet = (n: number): BetInput => ({ lottery: 'lotofacil', numbers: range(n) })

  it('15 dezenas = R$ 3,50', () => {
    expect(priceBet(config, bet(15))).toBe(350n)
  })

  it('16 dezenas = R$ 56,00 (C(16,15) = 16)', () => {
    expect(priceBet(config, bet(16))).toBe(5600n)
  })

  it('17 dezenas = R$ 476,00 (C(17,15) = 136)', () => {
    expect(priceBet(config, bet(17))).toBe(47600n)
  })

  it('20 dezenas = C(20,15) × 350', () => {
    expect(priceBet(config, bet(20))).toBe(15504n * 350n)
  })
})

describe('preço — demais PICK_N', () => {
  it('Quina', () => {
    const config = getLotteryConfig('quina')
    expect(priceBet(config, { lottery: 'quina', numbers: range(5) })).toBe(300n)
    expect(priceBet(config, { lottery: 'quina', numbers: range(6) })).toBe(1800n)
    expect(priceBet(config, { lottery: 'quina', numbers: range(15) })).toBe(
      combinations(15, 5) * 300n,
    )
  })

  it('Dupla Sena', () => {
    const config = getLotteryConfig('duplasena')
    expect(priceBet(config, { lottery: 'duplasena', numbers: range(6) })).toBe(300n)
    expect(priceBet(config, { lottery: 'duplasena', numbers: range(7) })).toBe(2100n)
  })

  it('Dia de Sorte', () => {
    const config = getLotteryConfig('diadesorte')
    const bet = (n: number): BetInput => ({
      lottery: 'diadesorte',
      numbers: range(n),
      extra: { kind: 'MONTH', month: 3 },
    })
    expect(priceBet(config, bet(7))).toBe(250n)
    expect(priceBet(config, bet(8))).toBe(2000n)
  })

  it('Timemania e Lotomania não têm aposta múltipla', () => {
    expect(
      priceBet(getLotteryConfig('timemania'), {
        lottery: 'timemania',
        numbers: range(10),
        extra: { kind: 'TEAM', teamId: 'flamengo-rj' },
      }),
    ).toBe(350n)
    expect(
      priceBet(getLotteryConfig('lotomania'), { lottery: 'lotomania', numbers: range(50, 0) }),
    ).toBe(300n)
  })
})

describe('preço — +Milionária (dezenas × trevos)', () => {
  const config = getLotteryConfig('maismilionaria')
  const bet = (picks: number, clovers: number): BetInput => ({
    lottery: 'maismilionaria',
    numbers: range(picks),
    extra: { kind: 'CLOVER', clovers: range(clovers) },
  })

  it('6 dezenas + 2 trevos = R$ 6,00', () => {
    expect(priceBet(config, bet(6, 2))).toBe(600n)
  })

  it('6 dezenas + 3 trevos = R$ 18,00 (C(3,2) = 3)', () => {
    expect(priceBet(config, bet(6, 3))).toBe(1800n)
  })

  it('7 dezenas + 2 trevos = R$ 42,00', () => {
    expect(priceBet(config, bet(7, 2))).toBe(4200n)
  })

  it('7 dezenas + 3 trevos = 7 × 3 × R$ 6,00', () => {
    expect(priceBet(config, bet(7, 3))).toBe(600n * 7n * 3n)
  })

  it('12 dezenas + 6 trevos (máximo) = C(12,6) × C(6,2) × 600', () => {
    expect(priceBet(config, bet(12, 6))).toBe(combinations(12, 6) * combinations(6, 2) * 600n)
  })

  it('a grade da tabela cobre 7 × 5 combinações', () => {
    expect(config.priceTiers).toHaveLength(7 * 5)
  })
})

describe('preço — COLUMNS / MATCH_LIST (produto, não combinação)', () => {
  it('Super Sete: preço = R$ 3,00 × Π palpites por coluna', () => {
    const config = getLotteryConfig('supersete')
    const columns = (sizes: number[]): BetInput => ({
      lottery: 'supersete',
      numbers: [],
      columns: sizes.map((size) => range(size, 0)),
    })
    expect(priceBet(config, columns([1, 1, 1, 1, 1, 1, 1]))).toBe(300n)
    expect(priceBet(config, columns([2, 1, 1, 1, 1, 1, 1]))).toBe(600n)
    // 9 dígitos marcados: 3·1·1·1·1·1·1 = 3 apostas, mas 2·2·1·1·1·1·1 = 4.
    expect(priceBet(config, columns([3, 1, 1, 1, 1, 1, 1]))).toBe(900n)
    expect(priceBet(config, columns([2, 2, 1, 1, 1, 1, 1]))).toBe(1200n)
    expect(priceBet(config, columns([3, 3, 3, 3, 3, 3, 3]))).toBe(300n * 3n ** 7n)
  })

  it('Loteca: preço = R$ 4,00 × Π palpites por jogo', () => {
    const config = getLotteryConfig('loteca')
    const single: BetInput = {
      lottery: 'loteca',
      numbers: [],
      columns: Array.from({ length: 14 }, () => [1]),
    }
    expect(priceBet(config, single)).toBe(400n)

    const withDoubles: BetInput = {
      lottery: 'loteca',
      numbers: [],
      columns: Array.from({ length: 14 }, (_, i) => (i < 2 ? [1, 2] : [1])),
    }
    expect(priceBet(config, withDoubles)).toBe(1600n)
    expect(betMultiplier(config, withDoubles)).toBe(4n)
  })
})

describe('preço — ausência de faixa', () => {
  it('Federal não tem tabela de preço: resolvePrice devolve null e priceBet lança', () => {
    const config = getLotteryConfig('federal')
    const bet: BetInput = { lottery: 'federal', numbers: [12345] }
    expect(resolvePrice(config, bet)).toBeNull()
    expect(() => priceBet(config, bet)).toThrow(/faixa de preço/i)
  })

  it('aposta abaixo do mínimo não é precificável', () => {
    const config = getLotteryConfig('megasena')
    expect(resolvePrice(config, { lottery: 'megasena', numbers: range(5) })).toBeNull()
    expect(betMultiplier(config, { lottery: 'megasena', numbers: range(5) })).toBe(0n)
  })

  it('COLUMNS sem o campo columns não é precificável', () => {
    const config = getLotteryConfig('supersete')
    expect(resolvePrice(config, { lottery: 'supersete', numbers: [] })).toBeNull()
  })

  it('+Milionária sem trevos não é precificável', () => {
    const config = getLotteryConfig('maismilionaria')
    expect(resolvePrice(config, { lottery: 'maismilionaria', numbers: range(6) })).toBeNull()
  })
})

describe('preço — consistência tabela × fórmula', () => {
  it('toda faixa PICK_N enumerada é reproduzida pela combinatória', () => {
    for (const slug of ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'diadesorte'] as const) {
      const config = getLotteryConfig(slug)
      const simple = config.priceTiers[0]?.priceCents ?? 0n
      for (const tier of config.priceTiers) {
        expect(tier.priceCents, `${slug}/${tier.picks}`).toBe(
          simple * combinations(tier.picks, config.picksMin),
        )
      }
    }
  })
})

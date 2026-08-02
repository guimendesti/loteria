import { describe, expect, it } from 'vitest'
import {
  betMultiplier,
  check,
  getLotteryConfig,
  type BetInput,
  type DrawCheck,
  type LotteryConfig,
  type LotterySlug,
  type PrizeTierData,
  type TierCount,
} from '../src/index'
import { makeResult, prize, range } from './helpers'

describe('conferência — Mega-Sena', () => {
  const config = getLotteryConfig('megasena')
  const bet: BetInput = { lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 6] }

  it('sena', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'megasena',
        numbers: [1, 2, 3, 4, 5, 6],
        prizes: [prize(1, 5_000_000_000n)],
      }),
    )
    expect(outcome.draws).toHaveLength(1)
    expect(outcome.draws[0]).toMatchObject({
      drawIndex: 1,
      hits: 6,
      hitNumbers: [1, 2, 3, 4, 5, 6],
      extraHits: null,
      prizeTier: 1,
      prizeCents: 5_000_000_000n,
    })
    expect(outcome.totalPrizeCents).toBe(5_000_000_000n)
  })

  it('quadra', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'megasena',
        numbers: [1, 2, 3, 4, 55, 60],
        prizes: [prize(1, 5_000_000_000n), prize(3, 78_900n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(4)
    expect(outcome.draws[0]?.prizeTier).toBe(3)
    expect(outcome.totalPrizeCents).toBe(78_900n)
  })

  it('3 acertos não premia', () => {
    const outcome = check(
      config,
      bet,
      makeResult({ lottery: 'megasena', numbers: [1, 2, 3, 44, 55, 60], prizes: [prize(3, 100n)] }),
    )
    expect(outcome.draws[0]?.hits).toBe(3)
    expect(outcome.draws[0]?.prizeTier).toBeNull()
    expect(outcome.totalPrizeCents).toBe(0n)
  })

  it('aposta múltipla: acertos são a interseção com o volante inteiro', () => {
    const outcome = check(
      config,
      { lottery: 'megasena', numbers: range(10) },
      makeResult({ lottery: 'megasena', numbers: [2, 4, 6, 8, 10, 60], prizes: [prize(2, 5_000n)] }),
    )
    expect(outcome.draws[0]?.hits).toBe(5)
    expect(outcome.draws[0]?.hitNumbers).toEqual([2, 4, 6, 8, 10])
    expect(outcome.draws[0]?.prizeTier).toBe(2)
  })

  it('faixa é reportada mesmo sem rateio publicado', () => {
    const outcome = check(
      config,
      bet,
      makeResult({ lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 6], prizes: [] }),
    )
    expect(outcome.draws[0]?.prizeTier).toBe(1)
    expect(outcome.draws[0]?.prizeCents).toBe(0n)
  })
})

describe('conferência — Lotofácil', () => {
  const config = getLotteryConfig('lotofacil')

  it('11 acertos é a última faixa premiada', () => {
    const outcome = check(
      config,
      { lottery: 'lotofacil', numbers: range(15) },
      makeResult({
        lottery: 'lotofacil',
        numbers: [...range(11), 22, 23, 24, 25],
        prizes: [prize(5, 600n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(11)
    expect(outcome.draws[0]?.prizeTier).toBe(5)
    expect(outcome.totalPrizeCents).toBe(600n)
  })

  it('10 acertos não premia', () => {
    const outcome = check(
      config,
      { lottery: 'lotofacil', numbers: range(15) },
      makeResult({
        lottery: 'lotofacil',
        numbers: [...range(10), 21, 22, 23, 24, 25],
        prizes: [prize(5, 600n)],
      }),
    )
    expect(outcome.draws[0]?.prizeTier).toBeNull()
  })
})

describe('conferência — Quina', () => {
  it('duque (2 acertos) premia', () => {
    const outcome = check(
      getLotteryConfig('quina'),
      { lottery: 'quina', numbers: [1, 2, 3, 4, 5] },
      makeResult({ lottery: 'quina', numbers: [1, 2, 70, 75, 80], prizes: [prize(4, 350n)] }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 2, prizeTier: 4, prizeCents: 350n })
  })
})

describe('conferência — Lotomania (premia ZERO acertos)', () => {
  const config = getLotteryConfig('lotomania')
  const bet: BetInput = { lottery: 'lotomania', numbers: range(50, 0) } // 0..49

  it('0 acertos cai na faixa 7', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'lotomania',
        numbers: range(20, 50), // 50..69 — nenhuma dezena apostada
        prizes: [prize(1, 100_000_000n), prize(7, 450_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(0)
    expect(outcome.draws[0]?.hitNumbers).toEqual([])
    expect(outcome.draws[0]?.prizeTier).toBe(7)
    expect(outcome.totalPrizeCents).toBe(450_000n)
  })

  it('20 acertos cai na faixa 1', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'lotomania',
        numbers: range(20, 0), // 0..19 — todas apostadas
        prizes: [prize(1, 100_000_000n), prize(7, 450_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(20)
    expect(outcome.draws[0]?.prizeTier).toBe(1)
    expect(outcome.totalPrizeCents).toBe(100_000_000n)
  })

  it('14 acertos (entre 0 e 15) não premia', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'lotomania',
        numbers: [...range(14, 0), ...range(6, 60)],
        prizes: [prize(6, 1_000n), prize(7, 1_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(14)
    expect(outcome.draws[0]?.prizeTier).toBeNull()
    expect(outcome.totalPrizeCents).toBe(0n)
  })
})

describe('conferência — Dupla Sena (dois sorteios por concurso)', () => {
  const config = getLotteryConfig('duplasena')
  const bet: BetInput = { lottery: 'duplasena', numbers: [1, 2, 3, 4, 5, 6] }

  it('confere os dois sorteios e soma os prêmios', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'duplasena',
        numbers: [1, 2, 3, 4, 5, 6],
        secondaryNumbers: [1, 2, 3, 4, 49, 50],
        prizes: [
          prize(1, 1_000_000n, 1),
          prize(3, 5_000n, 2),
        ],
      }),
    )
    expect(outcome.draws).toHaveLength(2)
    expect(outcome.draws[0]).toMatchObject({ drawIndex: 1, hits: 6, prizeTier: 1, prizeCents: 1_000_000n })
    expect(outcome.draws[1]).toMatchObject({ drawIndex: 2, hits: 4, prizeTier: 3, prizeCents: 5_000n })
    expect(outcome.totalPrizeCents).toBe(1_005_000n)
  })

  it('faixa do 1º sorteio não vaza para o 2º', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'duplasena',
        numbers: [1, 2, 3, 4, 5, 6],
        secondaryNumbers: [1, 2, 3, 4, 5, 6],
        // Só o 1º sorteio teve rateio publicado para a sena.
        prizes: [prize(1, 900n, 1)],
      }),
    )
    expect(outcome.draws[0]?.prizeCents).toBe(900n)
    expect(outcome.draws[1]?.prizeTier).toBe(1)
    expect(outcome.draws[1]?.prizeCents).toBe(0n)
    expect(outcome.totalPrizeCents).toBe(900n)
  })

  it('2 acertos (abaixo do terno) não premia em nenhum sorteio', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'duplasena',
        numbers: [1, 2, 40, 41, 42, 43],
        secondaryNumbers: [5, 6, 44, 45, 46, 47],
        prizes: [prize(4, 300n, 1), prize(4, 300n, 2)],
      }),
    )
    expect(outcome.draws.map((d) => d.prizeTier)).toEqual([null, null])
    expect(outcome.totalPrizeCents).toBe(0n)
  })
})

describe('conferência — Timemania (Time do Coração é faixa própria)', () => {
  const config = getLotteryConfig('timemania')
  const bet: BetInput = {
    lottery: 'timemania',
    numbers: range(10),
    extra: { kind: 'TEAM', teamId: 'sao-paulo-sp' },
  }

  it('7 acertos + time acumulam as duas faixas', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'timemania',
        numbers: [...range(7), 70, 75, 80],
        extraResult: { kind: 'TEAM', teamName: 'SÃO PAULO/SP' },
        prizes: [prize(1, 1_000_000n), prize(6, 50_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(7)
    expect(outcome.draws[0]?.extraHits).toBe(1)
    expect(outcome.draws[0]?.prizeTier).toBe(1) // faixa de maior prêmio
    expect(outcome.draws[0]?.prizeCents).toBe(1_050_000n)
    expect(outcome.totalPrizeCents).toBe(1_050_000n)
  })

  it('só o time premia, independentemente das dezenas', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'timemania',
        numbers: [71, 72, 73, 74, 75, 76, 77],
        extraResult: { kind: 'TEAM', teamName: 'São Paulo SP' },
        prizes: [prize(6, 50_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(0)
    expect(outcome.draws[0]?.prizeTier).toBe(6)
    expect(outcome.totalPrizeCents).toBe(50_000n)
  })

  it('time diferente não premia', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'timemania',
        numbers: [71, 72, 73, 74, 75, 76, 77],
        extraResult: { kind: 'TEAM', teamName: 'FLAMENGO/RJ' },
        prizes: [prize(6, 50_000n)],
      }),
    )
    expect(outcome.draws[0]?.extraHits).toBe(0)
    expect(outcome.draws[0]?.prizeTier).toBeNull()
  })
})

describe('conferência — Dia de Sorte (Mês da Sorte é faixa própria)', () => {
  const config = getLotteryConfig('diadesorte')
  const bet: BetInput = {
    lottery: 'diadesorte',
    numbers: range(7),
    extra: { kind: 'MONTH', month: 7 },
  }

  it('4 acertos + mês acumulam', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'diadesorte',
        numbers: [1, 2, 3, 4, 28, 29, 30],
        extraResult: { kind: 'MONTH', month: 7 },
        prizes: [prize(4, 200n), prize(5, 1_200n)],
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 4, extraHits: 1, prizeCents: 1_400n })
    expect(outcome.draws[0]?.prizeTier).toBe(5) // Mês da Sorte pagou mais
    expect(outcome.totalPrizeCents).toBe(1_400n)
  })

  it('mês errado só mantém a faixa numérica', () => {
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'diadesorte',
        numbers: range(7),
        extraResult: { kind: 'MONTH', month: 8 },
        prizes: [prize(1, 9_000_000n), prize(5, 1_200n)],
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 7, extraHits: 0, prizeTier: 1 })
    expect(outcome.totalPrizeCents).toBe(9_000_000n)
  })
})

describe('conferência — Super Sete (acerto por coluna)', () => {
  const config = getLotteryConfig('supersete')

  it('7 colunas certas', () => {
    const outcome = check(
      config,
      { lottery: 'supersete', numbers: [], columns: [[1], [2], [3], [4], [5], [6], [7]] },
      makeResult({
        lottery: 'supersete',
        numbers: [1, 2, 3, 4, 5, 6, 7],
        prizes: [prize(1, 2_000_000n)],
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 7, prizeTier: 1, prizeCents: 2_000_000n })
    expect(outcome.draws[0]?.hitNumbers).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('coluna múltipla acerta se contém o dígito sorteado', () => {
    const outcome = check(
      config,
      { lottery: 'supersete', numbers: [], columns: [[0, 9], [2], [3], [4], [5], [6], [7]] },
      makeResult({
        lottery: 'supersete',
        numbers: [9, 2, 3, 4, 5, 6, 7],
        prizes: [prize(1, 2_000_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(7)
  })

  it('mesma dezena na coluna errada não conta', () => {
    const outcome = check(
      config,
      { lottery: 'supersete', numbers: [], columns: [[2], [1], [3], [4], [5], [6], [7]] },
      makeResult({
        lottery: 'supersete',
        numbers: [1, 2, 3, 4, 5, 6, 7],
        prizes: [prize(3, 1_000n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(5)
    expect(outcome.draws[0]?.prizeTier).toBe(3)
  })

  it('2 colunas certas não premia', () => {
    const outcome = check(
      config,
      { lottery: 'supersete', numbers: [], columns: [[1], [2], [0], [0], [0], [0], [0]] },
      makeResult({
        lottery: 'supersete',
        numbers: [1, 2, 3, 4, 5, 6, 7],
        prizes: [prize(5, 100n)],
      }),
    )
    expect(outcome.draws[0]?.hits).toBe(2)
    expect(outcome.draws[0]?.prizeTier).toBeNull()
  })
})

describe('conferência — +Milionária (dezenas × trevos)', () => {
  const config = getLotteryConfig('maismilionaria')
  const bet = (clovers: number[]): BetInput => ({
    lottery: 'maismilionaria',
    numbers: [1, 2, 3, 4, 5, 6],
    extra: { kind: 'CLOVER', clovers },
  })
  const prizes = [
    prize(1, 10_000_000_000n),
    prize(2, 500_000n),
    prize(3, 100_000n),
    prize(4, 50_000n),
    prize(7, 900n),
    prize(8, 600n),
  ]

  it('6 acertos + 2 trevos = faixa 1', () => {
    const outcome = check(
      config,
      bet([1, 2]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 3, 4, 5, 6],
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 6, extraHits: 2, prizeTier: 1 })
    expect(outcome.totalPrizeCents).toBe(10_000_000_000n)
  })

  it('6 acertos + 1 trevo = faixa 2', () => {
    const outcome = check(
      config,
      bet([1, 5]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 3, 4, 5, 6],
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 6, extraHits: 1, prizeTier: 2 })
    expect(outcome.totalPrizeCents).toBe(500_000n)
  })

  it('6 acertos + 0 trevo = faixa 2 (mesma faixa, sem prêmio dobrado)', () => {
    const outcome = check(
      config,
      bet([5, 6]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 3, 4, 5, 6],
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 6, extraHits: 0, prizeTier: 2 })
    expect(outcome.totalPrizeCents).toBe(500_000n)
  })

  it('2 acertos + 2 trevos = faixa 8 (menor faixa)', () => {
    const outcome = check(
      config,
      bet([1, 2]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 47, 48, 49, 50],
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 2, extraHits: 2, prizeTier: 8 })
    expect(outcome.totalPrizeCents).toBe(600n)
  })

  it('2 acertos + 1 trevo não premia (só 2+2 paga)', () => {
    const outcome = check(
      config,
      bet([1, 5]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 47, 48, 49, 50],
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 2, extraHits: 1, prizeTier: null })
    expect(outcome.totalPrizeCents).toBe(0n)
  })

  it('3 acertos + 1 trevo não premia; 3 + 2 premia', () => {
    const result = (clovers: number[]) =>
      check(
        config,
        bet(clovers),
        makeResult({
          lottery: 'maismilionaria',
          numbers: [1, 2, 3, 48, 49, 50],
          extraResult: { kind: 'CLOVER', clovers: [1, 2] },
          prizes,
        }),
      )
    expect(result([1, 5]).draws[0]?.prizeTier).toBeNull()
    expect(result([1, 2]).draws[0]?.prizeTier).toBe(7)
    expect(result([1, 2]).totalPrizeCents).toBe(900n)
  })

  it('aposta com 6 trevos conta a interseção correta', () => {
    const outcome = check(
      config,
      bet([1, 2, 3, 4, 5, 6]),
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 3, 4, 5, 40],
        extraResult: { kind: 'CLOVER', clovers: [3, 4] },
        prizes,
      }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 5, extraHits: 2, prizeTier: 3 })
  })
})

describe('conferência — Loteca', () => {
  const config = getLotteryConfig('loteca')

  it('14 e 13 acertos', () => {
    const drawn = Array.from({ length: 14 }, (_, i) => (i % 3) + 1)
    const perfect: BetInput = {
      lottery: 'loteca',
      numbers: [],
      columns: drawn.map((value) => [value]),
    }
    const outcome = check(
      config,
      perfect,
      makeResult({ lottery: 'loteca', numbers: drawn, prizes: [prize(1, 700_000n), prize(2, 3_000n)] }),
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 14, prizeTier: 1, prizeCents: 700_000n })

    const almost: BetInput = {
      lottery: 'loteca',
      numbers: [],
      columns: drawn.map((value, i) => [i === 0 ? (value % 3) + 1 : value]),
    }
    const outcome2 = check(
      config,
      almost,
      makeResult({ lottery: 'loteca', numbers: drawn, prizes: [prize(1, 700_000n), prize(2, 3_000n)] }),
    )
    expect(outcome2.draws[0]).toMatchObject({ hits: 13, prizeTier: 2, prizeCents: 3_000n })
  })
})

describe('conferência — Federal (sem faixas modeladas)', () => {
  it('não premia e não quebra', () => {
    const outcome = check(
      getLotteryConfig('federal'),
      { lottery: 'federal', numbers: [12345] },
      makeResult({ lottery: 'federal', numbers: [12345], prizes: [prize(1, 100n)] }),
    )
    expect(outcome.draws).toHaveLength(1)
    expect(outcome.draws[0]?.prizeTier).toBeNull()
    expect(outcome.totalPrizeCents).toBe(0n)
  })
})

describe('conferência — robustez', () => {
  it('resultado sem campo extra publicado zera as faixas de extra', () => {
    const outcome = check(
      getLotteryConfig('diadesorte'),
      { lottery: 'diadesorte', numbers: range(7), extra: { kind: 'MONTH', month: 7 } },
      makeResult({
        lottery: 'diadesorte',
        numbers: range(7),
        extraResult: null,
        prizes: [prize(1, 1_000n), prize(5, 500n)],
      }),
    )
    expect(outcome.draws[0]?.extraHits).toBeNull()
    expect(outcome.draws[0]?.prizeTier).toBe(1)
    expect(outcome.totalPrizeCents).toBe(1_000n)
  })

  it('dezenas repetidas na aposta não inflam os acertos', () => {
    const outcome = check(
      getLotteryConfig('megasena'),
      { lottery: 'megasena', numbers: [1, 1, 1, 2, 3, 4] },
      makeResult({ lottery: 'megasena', numbers: [1, 2, 3, 58, 59, 60], prizes: [prize(3, 10n)] }),
    )
    expect(outcome.draws[0]?.hits).toBe(3)
  })

  it('rateio publicado sem drawIndex é aceito como fallback', () => {
    const outcome = check(
      getLotteryConfig('duplasena'),
      { lottery: 'duplasena', numbers: [1, 2, 3, 4, 5, 6] },
      makeResult({
        lottery: 'duplasena',
        numbers: [1, 2, 3, 4, 5, 6],
        secondaryNumbers: [1, 2, 3, 4, 5, 6],
        prizes: [prize(1, 700n, null)],
      }),
    )
    expect(outcome.totalPrizeCents).toBe(1_400n)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// v2 — decomposição multi-faixa (`DrawCheck.tierCounts`)
// ═══════════════════════════════════════════════════════════════════════════════

/** `{ tier: count }` — leitura direta da decomposição nas asserções. */
function countsByTier(draw: DrawCheck | undefined): Record<number, number> {
  return Object.fromEntries((draw?.tierCounts ?? []).map((entry) => [entry.tier, entry.count]))
}

function sumTierPrizes(tierCounts: readonly TierCount[]): bigint {
  return tierCounts.reduce((acc, entry) => acc + entry.prizeCents, 0n)
}

describe('decomposição multi-faixa — Mega-Sena (exemplo canônico do contrato)', () => {
  const config = getLotteryConfig('megasena')

  it('8 dezenas com 6 acertos = 1 sena + 12 quinas + 15 quadras', () => {
    const outcome = check(
      config,
      { lottery: 'megasena', numbers: range(8) },
      makeResult({
        lottery: 'megasena',
        numbers: [1, 2, 3, 4, 5, 6],
        prizes: [prize(1, 5_000_000_000n), prize(2, 100_000n), prize(3, 1_000n)],
      }),
    )

    // C(6,6)·C(2,0) = 1 · C(6,5)·C(2,1) = 12 · C(6,4)·C(2,2) = 15 → Σ = 28 = C(8,6)
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 12, 3: 15 })
    expect(outcome.draws[0]?.tierCounts.reduce((acc, t) => acc + t.count, 0)).toBe(28)
    expect(betMultiplier(config, { lottery: 'megasena', numbers: range(8) })).toBe(28n)

    // 1×5.000.000.000 + 12×100.000 + 15×1.000
    expect(outcome.draws[0]?.prizeCents).toBe(5_001_215_000n)
    expect(outcome.totalPrizeCents).toBe(5_001_215_000n)
    expect(outcome.draws[0]?.prizeTier).toBe(1) // faixa de maior prêmio presente
    expect(outcome.draws[0]?.hits).toBe(6) // agregado da aposta permanece o mesmo
  })

  it('prêmio de cada faixa é count × valor unitário publicado', () => {
    const outcome = check(
      config,
      { lottery: 'megasena', numbers: range(8) },
      makeResult({
        lottery: 'megasena',
        numbers: [1, 2, 3, 4, 5, 6],
        prizes: [prize(1, 5_000_000_000n), prize(2, 100_000n), prize(3, 1_000n)],
      }),
    )
    expect(outcome.draws[0]?.tierCounts).toEqual([
      { tier: 1, count: 1, prizeCents: 5_000_000_000n },
      { tier: 2, count: 12, prizeCents: 1_200_000n },
      { tier: 3, count: 15, prizeCents: 15_000n },
    ])
  })

  it('faixa sem rateio publicado entra com count e prêmio zero', () => {
    const outcome = check(
      config,
      { lottery: 'megasena', numbers: range(8) },
      makeResult({ lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 6], prizes: [prize(2, 100_000n)] }),
    )
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 12, 3: 15 })
    expect(outcome.draws[0]?.prizeCents).toBe(1_200_000n)
    // Sem rateio da sena, a faixa de MAIOR prêmio presente passa a ser a quina.
    expect(outcome.draws[0]?.prizeTier).toBe(2)
  })
})

describe('decomposição multi-faixa — Lotofácil', () => {
  const config = getLotteryConfig('lotofacil')

  it('17 dezenas com 15 acertos = 1 de 15 + 30 de 14 + 105 de 13', () => {
    const bet: BetInput = { lottery: 'lotofacil', numbers: range(17) }
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'lotofacil',
        numbers: range(15),
        prizes: [
          prize(1, 100_000_000n),
          prize(2, 200_000n),
          prize(3, 3_000n),
          prize(4, 150n),
          prize(5, 75n),
        ],
      }),
    )

    // C(15,15)C(2,0)=1 · C(15,14)C(2,1)=30 · C(15,13)C(2,2)=105 → Σ = 136 = C(17,15).
    // As faixas de 12 e 11 acertos ficam com count 0 (logo, fora de `tierCounts`): toda
    // aposta simples de 15 dezenas tirada de um volante com apenas 2 dezenas não sorteadas
    // erra no máximo 2 → tem no mínimo 13 acertos.
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 30, 3: 105 })
    expect(betMultiplier(config, bet)).toBe(136n)

    // 1×100.000.000 + 30×200.000 + 105×3.000
    expect(outcome.draws[0]?.prizeCents).toBe(106_315_000n)
    expect(outcome.draws[0]?.prizeTier).toBe(1)
  })

  it('17 dezenas com 13 acertos desce a escada inteira (13/12/11)', () => {
    const outcome = check(
      config,
      { lottery: 'lotofacil', numbers: range(17) },
      makeResult({
        lottery: 'lotofacil',
        numbers: [...range(13), 24, 25],
        prizes: [prize(3, 3_000n), prize(4, 150n), prize(5, 75n)],
      }),
    )
    // h=13, p=17, k=15 → j=13: C(13,13)C(4,2)=6 · j=12: C(13,12)C(4,3)=52 · j=11: C(13,11)C(4,4)=78
    expect(countsByTier(outcome.draws[0])).toEqual({ 3: 6, 4: 52, 5: 78 })
    expect(outcome.draws[0]?.prizeCents).toBe(6n * 3_000n + 52n * 150n + 78n * 75n)
  })
})

describe('decomposição multi-faixa — +Milionária (produto dezenas × trevos)', () => {
  const config = getLotteryConfig('maismilionaria')

  it('7 dezenas / 3 trevos com 6 acertos e 2 trevos', () => {
    const bet: BetInput = {
      lottery: 'maismilionaria',
      numbers: range(7),
      extra: { kind: 'CLOVER', clovers: [1, 2, 3] },
    }
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'maismilionaria',
        numbers: range(6),
        extraResult: { kind: 'CLOVER', clovers: [1, 2] },
        prizes: [
          prize(1, 10_000_000_000n),
          prize(2, 500_000n),
          prize(3, 100_000n),
          prize(4, 50_000n),
        ],
      }),
    )

    // Dezenas (p=7, h=6, k=6): [j=6] = 1, [j=5] = 6.
    // Trevos  (q=3, t=2, k=2): [s=2] = 1, [s=1] = 2, [s=0] = 0.
    // count(j,s) = dezenas[j] × trevos[s]:
    //   faixa 1 (6+2) = 1×1 = 1
    //   faixa 2 (6+1 ou 6+0) = 1×2 + 1×0 = 2   ← duas linhas do mesmo tier, contagens somadas
    //   faixa 3 (5+2) = 6×1 = 6
    //   faixa 4 (5+1 ou 5+0) = 6×2 + 6×0 = 12
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 2, 3: 6, 4: 12 })

    // Σ counts = 21 = C(7,6)×C(3,2) = multiplicador de preço da aposta.
    expect(outcome.draws[0]?.tierCounts.reduce((acc, t) => acc + t.count, 0)).toBe(21)
    expect(betMultiplier(config, bet)).toBe(21n)

    expect(outcome.draws[0]?.prizeCents).toBe(
      10_000_000_000n + 2n * 500_000n + 6n * 100_000n + 12n * 50_000n,
    )
    expect(outcome.draws[0]).toMatchObject({ hits: 6, extraHits: 2, prizeTier: 1 })
  })

  it('aposta com 6 trevos e 5 acertos distribui nas faixas de 2 e de "1 ou 0" trevo', () => {
    const outcome = check(
      config,
      {
        lottery: 'maismilionaria',
        numbers: range(6),
        extra: { kind: 'CLOVER', clovers: range(6) },
      },
      makeResult({
        lottery: 'maismilionaria',
        numbers: [1, 2, 3, 4, 5, 40],
        extraResult: { kind: 'CLOVER', clovers: [3, 4] },
        prizes: [prize(3, 100_000n), prize(4, 50_000n)],
      }),
    )
    // Dezenas simples (p=k=6, h=5): [j=5] = 1. Trevos (q=6, t=2): [2]=1, [1]=8, [0]=6 (Σ=15=C(6,2)).
    expect(countsByTier(outcome.draws[0])).toEqual({ 3: 1, 4: 14 })
    expect(outcome.draws[0]?.prizeCents).toBe(100_000n + 14n * 50_000n)
  })
})

describe('decomposição multi-faixa — DP por colunas (Super Sete / Loteca)', () => {
  it('Super Sete: x⁵·(x+1)² = 1 de 7 colunas + 2 de 6 + 1 de 5', () => {
    const config = getLotteryConfig('supersete')
    const bet: BetInput = {
      lottery: 'supersete',
      numbers: [],
      columns: [[1, 2], [2, 3], [3], [4], [5], [6], [7]],
    }
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'supersete',
        numbers: [1, 2, 3, 4, 5, 6, 7],
        prizes: [prize(1, 2_000_000n), prize(2, 10_000n), prize(3, 500n)],
      }),
    )
    // Colunas 0 e 1 contêm o dígito sorteado e têm 2 palpites → fator (1·x + 1) cada;
    // colunas 2..6 acertam com 1 palpite → fator x. Produto = x⁷ + 2x⁶ + x⁵.
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 2, 3: 1 })
    expect(betMultiplier(config, bet)).toBe(4n) // Σ coeficientes = 2×2 = 4
    expect(outcome.draws[0]?.prizeCents).toBe(2_000_000n + 2n * 10_000n + 500n)
  })

  it('Super Sete: coluna que erra zera o eixo x (fator constante)', () => {
    const outcome = check(
      getLotteryConfig('supersete'),
      { lottery: 'supersete', numbers: [], columns: [[0, 8], [2], [3], [4], [5], [6], [7]] },
      makeResult({
        lottery: 'supersete',
        numbers: [1, 2, 3, 4, 5, 6, 7],
        prizes: [prize(2, 10_000n)],
      }),
    )
    // Coluna 0 não contém o 1 → fator constante 2 (dois palpites, ambos errados).
    // Produto = 2·x⁶ → 2 apostas simples com 6 colunas certas, nenhuma com 7.
    expect(countsByTier(outcome.draws[0])).toEqual({ 2: 2 })
    expect(outcome.draws[0]?.prizeCents).toBe(20_000n)
  })

  it('Loteca: x¹²·(x+1)·(x+2) = 1 de 14 + 3 de 13', () => {
    const config = getLotteryConfig('loteca')
    const drawn = Array.from({ length: 14 }, () => 1)
    const columns = [[1, 2], [1, 2, 3], ...Array.from({ length: 12 }, () => [1])]
    const outcome = check(
      config,
      { lottery: 'loteca', numbers: [], columns },
      makeResult({ lottery: 'loteca', numbers: drawn, prizes: [prize(1, 700_000n), prize(2, 3_000n)] }),
    )
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 3 })
    expect(betMultiplier(config, { lottery: 'loteca', numbers: [], columns })).toBe(6n) // 2×3
    expect(outcome.draws[0]?.prizeCents).toBe(700_000n + 3n * 3_000n)
  })
})

describe('decomposição multi-faixa — Dupla Sena e faixas independentes', () => {
  it('Dupla Sena: cada sorteio tem a sua própria decomposição', () => {
    const outcome = check(
      getLotteryConfig('duplasena'),
      { lottery: 'duplasena', numbers: range(8) },
      makeResult({
        lottery: 'duplasena',
        numbers: range(6), // 6 acertos
        secondaryNumbers: [1, 2, 3, 4, 49, 50], // 4 acertos
        prizes: [
          prize(1, 1_000_000n, 1),
          prize(2, 20_000n, 1),
          prize(3, 500n, 1),
          prize(3, 500n, 2),
          prize(4, 100n, 2),
        ],
      }),
    )
    // 1º sorteio (h=6): 1 sena, 12 quinas, 15 quadras.
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 12, 3: 15 })
    // 2º sorteio (h=4): C(4,4)C(4,2)=6 quadras, C(4,3)C(4,3)=16 ternos (o resto não premia).
    expect(countsByTier(outcome.draws[1])).toEqual({ 3: 6, 4: 16 })
    expect(outcome.draws[1]?.prizeCents).toBe(6n * 500n + 16n * 100n)
  })

  it('Dia de Sorte: o Mês da Sorte é pago uma vez por aposta simples embutida', () => {
    const outcome = check(
      getLotteryConfig('diadesorte'),
      { lottery: 'diadesorte', numbers: range(8), extra: { kind: 'MONTH', month: 7 } },
      makeResult({
        lottery: 'diadesorte',
        numbers: range(7),
        extraResult: { kind: 'MONTH', month: 7 },
        prizes: [prize(1, 9_000_000n), prize(2, 1_500n), prize(5, 1_200n)],
      }),
    )
    // Dezenas (p=8, h=7, k=7): [j=7] = 1, [j=6] = 7 → Σ = 8 = C(8,7).
    // Mês da Sorte é faixa INDEPENDENTE das dezenas: as 8 apostas simples embutidas foram
    // pagas uma a uma e todas carregam o mesmo mês → count = 8.
    expect(countsByTier(outcome.draws[0])).toEqual({ 1: 1, 2: 7, 5: 8 })
    expect(outcome.draws[0]?.prizeCents).toBe(9_000_000n + 7n * 1_500n + 8n * 1_200n)
    expect(outcome.draws[0]?.prizeTier).toBe(1)
  })
})

describe('decomposição multi-faixa — aposta simples permanece inalterada', () => {
  it('premiada: uma única entrada, count 1, na própria faixa', () => {
    const outcome = check(
      getLotteryConfig('megasena'),
      { lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 6] },
      makeResult({
        lottery: 'megasena',
        numbers: [1, 2, 3, 4, 55, 60],
        prizes: [prize(1, 5_000_000_000n), prize(3, 78_900n)],
      }),
    )
    expect(outcome.draws[0]?.tierCounts).toEqual([{ tier: 3, count: 1, prizeCents: 78_900n }])
    expect(outcome.draws[0]?.prizeCents).toBe(78_900n)
    expect(outcome.draws[0]?.prizeTier).toBe(3)
  })

  it('não premiada: tierCounts vazio e prizeTier null', () => {
    const outcome = check(
      getLotteryConfig('megasena'),
      { lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 6] },
      makeResult({ lottery: 'megasena', numbers: [1, 2, 3, 44, 55, 60], prizes: [prize(3, 100n)] }),
    )
    expect(outcome.draws[0]?.tierCounts).toEqual([])
    expect(outcome.draws[0]?.prizeTier).toBeNull()
    expect(outcome.draws[0]?.prizeCents).toBe(0n)
  })

  it('aposta abaixo do mínimo contém 0 apostas simples e não premia nem a faixa do extra', () => {
    const config = getLotteryConfig('diadesorte')
    const bet: BetInput = {
      lottery: 'diadesorte',
      numbers: [1, 2, 3], // picksMin é 7 — aposta impossível (validateBet rejeita)
      extra: { kind: 'MONTH', month: 7 },
    }
    expect(betMultiplier(config, bet)).toBe(0n)
    const outcome = check(
      config,
      bet,
      makeResult({
        lottery: 'diadesorte',
        numbers: range(7),
        extraResult: { kind: 'MONTH', month: 7 },
        prizes: [prize(5, 1_200n)],
      }),
    )
    expect(outcome.draws[0]?.tierCounts).toEqual([])
    expect(outcome.totalPrizeCents).toBe(0n)
  })

  it('toda aposta simples premiada de todas as modalidades tem count 1', () => {
    for (const slug of ['megasena', 'lotofacil', 'quina', 'lotomania', 'supersete', 'loteca'] as const) {
      const config = getLotteryConfig(slug)
      const isColumns = config.format !== 'PICK_N'
      const drawn = range(isColumns ? config.picksMin : config.picksMin, config.universeMin)
      const bet: BetInput = isColumns
        ? { lottery: slug, numbers: [], columns: drawn.map((value) => [value % 3 === 0 ? value : value]) }
        : { lottery: slug, numbers: drawn }
      const outcome = check(config, bet, makeResult({ lottery: slug, numbers: drawn, prizes: [] }))
      for (const entry of outcome.draws[0]?.tierCounts ?? []) {
        expect(entry.count, `${slug} faixa ${entry.tier}`).toBe(1)
      }
    }
  })
})

// ─── Invariantes matemáticos com semente fixa ────────────────────────────────

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

function sample(random: () => number, universe: readonly number[], count: number): number[] {
  const pool = [...universe]
  const picked: number[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(random() * pool.length)
    picked.push(pool.splice(index, 1)[0] as number)
  }
  return picked.sort((a, b) => a - b)
}

function universeOf(config: LotteryConfig): number[] {
  return range(config.universeMax - config.universeMin + 1, config.universeMin)
}

/** Faixas cobrindo TODOS os números de acertos possíveis — usado só para somar a decomposição. */
function fullNumericLadder(config: LotteryConfig, maxHits: number): LotteryConfig {
  const prizeTiers: PrizeTierData[] = []
  for (let hits = maxHits; hits >= 0; hits--) {
    prizeTiers.push({ tier: prizeTiers.length + 1, label: `${hits}`, hits, extraHits: null, drawIndex: null })
  }
  return { ...config, extraField: null, drawsPerContest: 1, prizeTiers }
}

/** Grade completa (dezenas × trevos) da +Milionária, idem. */
function fullCloverLadder(config: LotteryConfig): LotteryConfig {
  const prizeTiers: PrizeTierData[] = []
  for (let hits = config.picksMin; hits >= 0; hits--) {
    for (let extraHits = 2; extraHits >= 0; extraHits--) {
      prizeTiers.push({ tier: prizeTiers.length + 1, label: `${hits}+${extraHits}`, hits, extraHits, drawIndex: null })
    }
  }
  return { ...config, drawsPerContest: 1, prizeTiers }
}

function totalCount(draw: DrawCheck | undefined): bigint {
  return BigInt((draw?.tierCounts ?? []).reduce((acc, entry) => acc + entry.count, 0))
}

describe('decomposição — Σ das contagens é o nº de apostas simples embutidas (semente fixa)', () => {
  it('PICK_N sem campo extra: Σ counts === C(dezenas, picksMin) === multiplicador de preço', () => {
    const random = mulberry32(0x1f2e3d4c)
    for (const slug of ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena'] as const) {
      const config = getLotteryConfig(slug)
      const universe = universeOf(config)
      const ladder = fullNumericLadder(config, config.picksMin)
      for (let i = 0; i < 40; i++) {
        const span = Math.min(config.picksMax, config.picksMin + 5) - config.picksMin
        const picks = config.picksMin + Math.floor(random() * (span + 1))
        const bet: BetInput = { lottery: slug, numbers: sample(random, universe, picks) }
        const drawn = sample(random, universe, config.picksMin)
        const outcome = check(ladder, bet, makeResult({ lottery: slug, numbers: drawn, prizes: [] }))
        expect(totalCount(outcome.draws[0]), `${slug} com ${picks} dezenas`).toBe(
          betMultiplier(config, bet),
        )
      }
    }
  })

  it('+Milionária: Σ counts === C(dezenas,6) × C(trevos,2)', () => {
    const random = mulberry32(0x2b7e1516)
    const config = getLotteryConfig('maismilionaria')
    const ladder = fullCloverLadder(config)
    const universe = universeOf(config)
    const cloverUniverse = range(6)
    for (let i = 0; i < 60; i++) {
      const picks = 6 + Math.floor(random() * 7) // 6..12
      const clovers = 2 + Math.floor(random() * 5) // 2..6
      const bet: BetInput = {
        lottery: 'maismilionaria',
        numbers: sample(random, universe, picks),
        extra: { kind: 'CLOVER', clovers: sample(random, cloverUniverse, clovers) },
      }
      const outcome = check(
        ladder,
        bet,
        makeResult({
          lottery: 'maismilionaria',
          numbers: sample(random, universe, 6),
          extraResult: { kind: 'CLOVER', clovers: sample(random, cloverUniverse, 2) },
          prizes: [],
        }),
      )
      expect(totalCount(outcome.draws[0]), `${picks} dezenas × ${clovers} trevos`).toBe(
        betMultiplier(config, bet),
      )
    }
  })

  it('COLUMNS / MATCH_LIST: a DP bate com a enumeração exaustiva das apostas simples', () => {
    const random = mulberry32(0x3c6ef372)
    for (const slug of ['supersete', 'loteca'] as const) {
      const config = getLotteryConfig(slug)
      const universe = universeOf(config)
      const ladder = fullNumericLadder(config, config.picksMin)
      const maxPerColumn = Math.floor(config.picksMax / config.picksMin)
      for (let i = 0; i < 25; i++) {
        // No máximo 3 colunas múltiplas: a enumeração de referência é 3^14 na Loteca cheia.
        const multipleColumns = new Set(sample(random, range(config.picksMin, 0), 3))
        const columns = Array.from({ length: config.picksMin }, (_, index) =>
          sample(random, universe, multipleColumns.has(index) ? 1 + Math.floor(random() * maxPerColumn) : 1),
        )
        const drawn = Array.from({ length: config.picksMin }, () => sample(random, universe, 1)[0] as number)
        const bet: BetInput = { lottery: slug, numbers: [], columns }
        const outcome = check(ladder, bet, makeResult({ lottery: slug, numbers: drawn, prizes: [] }))

        expect(countsByTier(outcome.draws[0])).toEqual(bruteForceLadder(columns, drawn, config.picksMin))
        expect(totalCount(outcome.draws[0])).toBe(betMultiplier(config, bet))
      }
    }
  })
})

/**
 * Referência independente da DP: enumera TODAS as apostas simples do produto cartesiano e
 * conta os acertos de cada uma. `tier` segue a numeração de `fullNumericLadder`
 * (tier 1 = maxHits acertos … tier maxHits+1 = 0 acertos).
 */
function bruteForceLadder(
  columns: readonly number[][],
  drawn: readonly number[],
  maxHits: number,
): Record<number, number> {
  const byHits = new Array<number>(maxHits + 1).fill(0)
  const walk = (index: number, hits: number): void => {
    if (index === columns.length) {
      byHits[hits] = (byHits[hits] ?? 0) + 1
      return
    }
    for (const pick of columns[index] ?? []) walk(index + 1, hits + (pick === drawn[index] ? 1 : 0))
  }
  walk(0, 0)

  const result: Record<number, number> = {}
  byHits.forEach((count, hits) => {
    if (count > 0) result[maxHits - hits + 1] = count
  })
  return result
}

describe('decomposição — invariante prizeCents === Σ tierCounts.prizeCents (semente fixa)', () => {
  const FUZZ_SLUGS: LotterySlug[] = [
    'megasena',
    'lotofacil',
    'quina',
    'lotomania',
    'duplasena',
    'timemania',
    'diadesorte',
    'supersete',
    'maismilionaria',
    'loteca',
  ]

  it('500 casos: o agregado é sempre a soma exata da decomposição', () => {
    const random = mulberry32(0x9e3779b9)
    let multiTierCases = 0
    let multipleCountCases = 0

    for (let iteration = 0; iteration < 500; iteration++) {
      const slug = FUZZ_SLUGS[iteration % FUZZ_SLUGS.length] as LotterySlug
      const config = getLotteryConfig(slug)
      const universe = universeOf(config)
      const isColumns = config.format !== 'PICK_N'
      const maxPerColumn = Math.floor(config.picksMax / config.picksMin)

      // Aposta: sorteia dezenas/colunas dentro dos limites da modalidade.
      const columns = isColumns
        ? Array.from({ length: config.picksMin }, () =>
            sample(random, universe, 1 + Math.floor(random() * maxPerColumn)),
          )
        : undefined
      const span = Math.min(config.picksMax, config.picksMin + 4) - config.picksMin
      const numbers = isColumns
        ? []
        : sample(random, universe, config.picksMin + Math.floor(random() * (span + 1)))

      const extraField = config.extraField
      const bet: BetInput = {
        lottery: slug,
        numbers,
        ...(columns !== undefined ? { columns } : {}),
        ...(extraField === null
          ? {}
          : extraField.kind === 'CLOVER'
            ? {
                extra: {
                  kind: 'CLOVER' as const,
                  clovers: sample(random, range(6), 2 + Math.floor(random() * 5)),
                },
              }
            : extraField.kind === 'MONTH'
              ? { extra: { kind: 'MONTH' as const, month: 1 + Math.floor(random() * 12) } }
              : { extra: { kind: 'TEAM' as const, teamId: random() < 0.5 ? 'flamengo-rj' : 'sao-paulo-sp' } }),
      }

      // Resultado: viesado para gerar acertos (metade das dezenas sai da própria aposta).
      const drawSize = slug === 'lotomania' ? 20 : config.picksMin
      const drawnFor = (): number[] => {
        if (isColumns) {
          return Array.from(
            { length: config.picksMin },
            (_, index) =>
              (random() < 0.6 ? columns?.[index]?.[0] : sample(random, universe, 1)[0]) ??
              config.universeMin,
          )
        }
        const fromBet = sample(random, numbers, Math.min(numbers.length, Math.ceil(drawSize / 2)))
        const rest = sample(
          random,
          universe.filter((value) => !fromBet.includes(value)),
          drawSize - fromBet.length,
        )
        return [...fromBet, ...rest]
      }

      const prizes = [...new Set(config.prizeTiers.map((tier) => tier.tier))].flatMap((tier) =>
        config.drawsPerContest > 1
          ? [1, 2].map((drawIndex) => prize(tier, BigInt(Math.floor(random() * 5_000_000_00)), drawIndex))
          : [prize(tier, BigInt(Math.floor(random() * 5_000_000_00)))],
      )

      const outcome = check(
        config,
        bet,
        makeResult({
          lottery: slug,
          numbers: drawnFor(),
          secondaryNumbers: config.drawsPerContest > 1 ? drawnFor() : [],
          ...(extraField === null
            ? {}
            : extraField.kind === 'CLOVER'
              ? { extraResult: { kind: 'CLOVER' as const, clovers: sample(random, range(6), 2) } }
              : extraField.kind === 'MONTH'
                ? { extraResult: { kind: 'MONTH' as const, month: 1 + Math.floor(random() * 12) } }
                : { extraResult: { kind: 'TEAM' as const, teamName: 'SÃO PAULO/SP' } }),
          prizes,
        }),
      )

      const label = `${slug} #${iteration}`
      let running = 0n
      for (const draw of outcome.draws) {
        // ★ invariante do contrato v2
        expect(sumTierPrizes(draw.tierCounts), label).toBe(draw.prizeCents)
        running += draw.prizeCents

        const tiers = draw.tierCounts.map((entry) => entry.tier)
        expect(new Set(tiers).size, `${label}: faixa repetida`).toBe(tiers.length)
        expect([...tiers], `${label}: faixas fora de ordem`).toEqual([...tiers].sort((a, b) => a - b))

        for (const entry of draw.tierCounts) {
          expect(Number.isSafeInteger(entry.count), label).toBe(true)
          expect(entry.count, label).toBeGreaterThan(0)
          const unit =
            prizes.find(
              (p) => p.tier === entry.tier && (p.drawIndex === null || p.drawIndex === draw.drawIndex),
            )?.prizeCents ?? 0n
          expect(entry.prizeCents, `${label} faixa ${entry.tier}`).toBe(BigInt(entry.count) * unit)
        }

        // `prizeTier` é null exatamente quando não há faixa ganha.
        expect(draw.prizeTier === null, label).toBe(draw.tierCounts.length === 0)
        if (draw.prizeTier !== null) expect(tiers, label).toContain(draw.prizeTier)

        if (draw.tierCounts.length > 1) multiTierCases += 1
        if (draw.tierCounts.some((entry) => entry.count > 1)) multipleCountCases += 1
      }
      expect(outcome.totalPrizeCents, label).toBe(running)
    }

    // Guarda contra bateria vazia: a amostra precisa exercitar de fato a decomposição.
    expect(multiTierCases).toBeGreaterThan(50)
    expect(multipleCountCases).toBeGreaterThan(50)
  })
})

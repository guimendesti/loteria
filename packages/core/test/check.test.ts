import { describe, expect, it } from 'vitest'
import { check, getLotteryConfig, type BetInput } from '../src/index'
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

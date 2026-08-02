import { describe, expect, it } from 'vitest'
import {
  getLotteryConfig,
  validateBet,
  type BetInput,
  type ValidationError,
} from '../src/index'
import { codesOf, range } from './helpers'

/** Acumula todos os códigos exercitados, para provar cobertura do contrato ao final. */
const exercised = new Set<ValidationError['code']>()

function codes(bet: BetInput): Array<ValidationError['code']> {
  const config = getLotteryConfig(bet.lottery)
  const result = codesOf(validateBet(config, bet))
  for (const code of result) exercised.add(code)
  return result
}

function expectValid(bet: BetInput): void {
  const config = getLotteryConfig(bet.lottery)
  const result = validateBet(config, bet)
  expect(result, JSON.stringify(codesOf(result))).toEqual({ ok: true })
}

const validBets: Record<string, BetInput> = {
  megasena: { lottery: 'megasena', numbers: range(6) },
  lotofacil: { lottery: 'lotofacil', numbers: range(15) },
  quina: { lottery: 'quina', numbers: range(5) },
  lotomania: { lottery: 'lotomania', numbers: range(50, 0) },
  duplasena: { lottery: 'duplasena', numbers: range(6) },
  timemania: {
    lottery: 'timemania',
    numbers: range(10),
    extra: { kind: 'TEAM', teamId: 'flamengo-rj' },
  },
  diadesorte: {
    lottery: 'diadesorte',
    numbers: range(7),
    extra: { kind: 'MONTH', month: 12 },
  },
  supersete: {
    lottery: 'supersete',
    numbers: [],
    columns: [[0], [1], [2], [3], [4], [5], [6]],
  },
  maismilionaria: {
    lottery: 'maismilionaria',
    numbers: range(6),
    extra: { kind: 'CLOVER', clovers: [1, 2] },
  },
  loteca: {
    lottery: 'loteca',
    numbers: [],
    columns: Array.from({ length: 14 }, () => [1]),
  },
}

describe('validação — aposta simples válida em cada modalidade', () => {
  for (const [slug, bet] of Object.entries(validBets)) {
    it(slug, () => {
      expectValid(bet)
    })
  }

  it('apostas múltiplas válidas', () => {
    expectValid({ lottery: 'megasena', numbers: range(20) })
    expectValid({ lottery: 'lotofacil', numbers: range(20) })
    expectValid({ lottery: 'quina', numbers: range(15) })
    expectValid({
      lottery: 'maismilionaria',
      numbers: range(12),
      extra: { kind: 'CLOVER', clovers: [1, 2, 3, 4, 5, 6] },
    })
    expectValid({
      lottery: 'supersete',
      numbers: [],
      columns: [[0, 1, 2], [1], [2], [3], [4], [5], [6, 7]],
    })
    expectValid({
      lottery: 'loteca',
      numbers: [],
      columns: Array.from({ length: 14 }, (_, i) => (i === 0 ? [1, 2, 3] : [2])),
    })
  })
})

describe('validação — TOO_FEW_PICKS / TOO_MANY_PICKS', () => {
  it('abaixo do mínimo', () => {
    expect(codes({ lottery: 'megasena', numbers: range(5) })).toContain('TOO_FEW_PICKS')
    expect(codes({ lottery: 'lotofacil', numbers: range(14) })).toContain('TOO_FEW_PICKS')
    expect(codes({ lottery: 'quina', numbers: [] })).toContain('TOO_FEW_PICKS')
    expect(codes({ lottery: 'lotomania', numbers: range(49, 0) })).toContain('TOO_FEW_PICKS')
    expect(codes({ lottery: 'duplasena', numbers: range(5) })).toContain('TOO_FEW_PICKS')
    expect(
      codes({
        lottery: 'timemania',
        numbers: range(9),
        extra: { kind: 'TEAM', teamId: 'santos-sp' },
      }),
    ).toContain('TOO_FEW_PICKS')
    expect(
      codes({ lottery: 'diadesorte', numbers: range(6), extra: { kind: 'MONTH', month: 1 } }),
    ).toContain('TOO_FEW_PICKS')
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(5),
        extra: { kind: 'CLOVER', clovers: [1, 2] },
      }),
    ).toContain('TOO_FEW_PICKS')
  })

  it('acima do máximo', () => {
    expect(codes({ lottery: 'megasena', numbers: range(21) })).toContain('TOO_MANY_PICKS')
    expect(codes({ lottery: 'lotofacil', numbers: range(21) })).toContain('TOO_MANY_PICKS')
    expect(codes({ lottery: 'quina', numbers: range(16) })).toContain('TOO_MANY_PICKS')
    expect(codes({ lottery: 'lotomania', numbers: range(51, 0) })).toContain('TOO_MANY_PICKS')
    expect(codes({ lottery: 'duplasena', numbers: range(16) })).toContain('TOO_MANY_PICKS')
    expect(
      codes({
        lottery: 'timemania',
        numbers: range(11),
        extra: { kind: 'TEAM', teamId: 'santos-sp' },
      }),
    ).toContain('TOO_MANY_PICKS')
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(13),
        extra: { kind: 'CLOVER', clovers: [1, 2] },
      }),
    ).toContain('TOO_MANY_PICKS')
  })
})

describe('validação — OUT_OF_UNIVERSE', () => {
  it('acima do universo', () => {
    expect(codes({ lottery: 'megasena', numbers: [1, 2, 3, 4, 5, 61] })).toContain('OUT_OF_UNIVERSE')
    expect(codes({ lottery: 'lotofacil', numbers: [...range(14), 26] })).toContain('OUT_OF_UNIVERSE')
    expect(codes({ lottery: 'diadesorte', numbers: [...range(6), 32], extra: { kind: 'MONTH', month: 1 } })).toContain(
      'OUT_OF_UNIVERSE',
    )
  })

  it('abaixo do universo e não-inteiros', () => {
    expect(codes({ lottery: 'megasena', numbers: [0, 1, 2, 3, 4, 5] })).toContain('OUT_OF_UNIVERSE')
    expect(codes({ lottery: 'megasena', numbers: [1.5, 2, 3, 4, 5, 6] })).toContain('OUT_OF_UNIVERSE')
    expect(codes({ lottery: 'lotomania', numbers: [...range(49, 0), 100] })).toContain('OUT_OF_UNIVERSE')
  })

  it('Super Sete só aceita dígitos 0–9', () => {
    expect(
      codes({ lottery: 'supersete', numbers: [], columns: [[10], [1], [2], [3], [4], [5], [6]] }),
    ).toContain('OUT_OF_UNIVERSE')
  })

  it('Loteca só aceita 1 (mandante), 2 (empate) e 3 (visitante)', () => {
    expect(
      codes({
        lottery: 'loteca',
        numbers: [],
        columns: Array.from({ length: 14 }, (_, i) => (i === 0 ? [0] : [1])),
      }),
    ).toContain('OUT_OF_UNIVERSE')
  })
})

describe('validação — DUPLICATE_NUMBER', () => {
  it('dezenas repetidas', () => {
    expect(codes({ lottery: 'megasena', numbers: [1, 1, 2, 3, 4, 5] })).toContain('DUPLICATE_NUMBER')
    expect(codes({ lottery: 'quina', numbers: [7, 7, 7, 7, 7] })).toContain('DUPLICATE_NUMBER')
  })

  it('dígitos repetidos na mesma coluna do Super Sete', () => {
    expect(
      codes({ lottery: 'supersete', numbers: [], columns: [[3, 3], [1], [2], [3], [4], [5], [6]] }),
    ).toContain('DUPLICATE_NUMBER')
  })

  it('o mesmo dígito em colunas diferentes é legítimo', () => {
    expectValid({
      lottery: 'supersete',
      numbers: [],
      columns: [[7], [7], [7], [7], [7], [7], [7]],
    })
  })
})

describe('validação — COLUMNS_INVALID', () => {
  it('número de colunas diferente do exigido', () => {
    expect(
      codes({ lottery: 'supersete', numbers: [], columns: [[0], [1], [2], [3], [4], [5]] }),
    ).toContain('COLUMNS_INVALID')
    expect(
      codes({
        lottery: 'supersete',
        numbers: [],
        columns: [[0], [1], [2], [3], [4], [5], [6], [7]],
      }),
    ).toContain('COLUMNS_INVALID')
    expect(
      codes({
        lottery: 'loteca',
        numbers: [],
        columns: Array.from({ length: 13 }, () => [1]),
      }),
    ).toContain('COLUMNS_INVALID')
  })

  it('coluna vazia', () => {
    expect(
      codes({ lottery: 'supersete', numbers: [], columns: [[], [1], [2], [3], [4], [5], [6]] }),
    ).toContain('COLUMNS_INVALID')
  })

  it('mais de 3 números na coluna', () => {
    expect(
      codes({
        lottery: 'supersete',
        numbers: [],
        columns: [[0, 1, 2, 3], [1], [2], [3], [4], [5], [6]],
      }),
    ).toContain('COLUMNS_INVALID')
  })
})

describe('validação — FORMAT_MISMATCH', () => {
  it('aposta de outra modalidade', () => {
    const config = getLotteryConfig('megasena')
    const result = validateBet(config, { lottery: 'quina', numbers: range(6) })
    expect(codesOf(result)).toContain('FORMAT_MISMATCH')
    for (const code of codesOf(result)) exercised.add(code)
  })

  it('PICK_N com campo columns', () => {
    expect(codes({ lottery: 'megasena', numbers: range(6), columns: [[1]] })).toContain(
      'FORMAT_MISMATCH',
    )
  })

  it('COLUMNS sem o campo columns', () => {
    expect(codes({ lottery: 'supersete', numbers: [] })).toContain('FORMAT_MISMATCH')
  })

  it('COLUMNS com dezenas em numbers', () => {
    expect(
      codes({
        lottery: 'supersete',
        numbers: [1, 2],
        columns: [[0], [1], [2], [3], [4], [5], [6]],
      }),
    ).toContain('FORMAT_MISMATCH')
  })
})

describe('validação — EXTRA_REQUIRED', () => {
  it('campo extra obrigatório em cada modalidade que o exige', () => {
    expect(codes({ lottery: 'timemania', numbers: range(10) })).toContain('EXTRA_REQUIRED')
    expect(codes({ lottery: 'diadesorte', numbers: range(7) })).toContain('EXTRA_REQUIRED')
    expect(codes({ lottery: 'maismilionaria', numbers: range(6) })).toContain('EXTRA_REQUIRED')
  })
})

describe('validação — EXTRA_INVALID', () => {
  it('extra em modalidade que não tem campo extra', () => {
    expect(
      codes({ lottery: 'megasena', numbers: range(6), extra: { kind: 'MONTH', month: 5 } }),
    ).toContain('EXTRA_INVALID')
  })

  it('tipo de extra trocado', () => {
    expect(
      codes({
        lottery: 'diadesorte',
        numbers: range(7),
        extra: { kind: 'CLOVER', clovers: [1, 2] },
      }),
    ).toContain('EXTRA_INVALID')
  })

  it('Mês da Sorte fora de 1–12', () => {
    expect(
      codes({ lottery: 'diadesorte', numbers: range(7), extra: { kind: 'MONTH', month: 0 } }),
    ).toContain('EXTRA_INVALID')
    expect(
      codes({ lottery: 'diadesorte', numbers: range(7), extra: { kind: 'MONTH', month: 13 } }),
    ).toContain('EXTRA_INVALID')
    expect(
      codes({ lottery: 'diadesorte', numbers: range(7), extra: { kind: 'MONTH', month: 1.5 } }),
    ).toContain('EXTRA_INVALID')
  })

  it('Time do Coração vazio', () => {
    expect(
      codes({ lottery: 'timemania', numbers: range(10), extra: { kind: 'TEAM', teamId: '  ' } }),
    ).toContain('EXTRA_INVALID')
  })

  it('trevos fora da quantidade permitida', () => {
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(6),
        extra: { kind: 'CLOVER', clovers: [1] },
      }),
    ).toContain('EXTRA_INVALID')
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(6),
        extra: { kind: 'CLOVER', clovers: [1, 2, 3, 4, 5, 6, 7] },
      }),
    ).toContain('EXTRA_INVALID')
  })

  it('trevo fora do intervalo 1–6 e trevo repetido', () => {
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(6),
        extra: { kind: 'CLOVER', clovers: [1, 7] },
      }),
    ).toContain('EXTRA_INVALID')
    expect(
      codes({
        lottery: 'maismilionaria',
        numbers: range(6),
        extra: { kind: 'CLOVER', clovers: [3, 3] },
      }),
    ).toContain('EXTRA_INVALID')
  })
})

describe('validação — NO_PRICE_TIER', () => {
  it('Federal: aposta estruturalmente válida, mas sem tabela de preço', () => {
    const result = codes({ lottery: 'federal', numbers: [12345] })
    expect(result).toEqual(['NO_PRICE_TIER'])
  })

  it('NO_PRICE_TIER não polui apostas já inválidas', () => {
    expect(codes({ lottery: 'megasena', numbers: range(5) })).toEqual(['TOO_FEW_PICKS'])
  })
})

describe('validação — cobertura do contrato', () => {
  it('exercita todos os códigos de ValidationError', () => {
    const all: Array<ValidationError['code']> = [
      'TOO_FEW_PICKS',
      'TOO_MANY_PICKS',
      'OUT_OF_UNIVERSE',
      'DUPLICATE_NUMBER',
      'EXTRA_REQUIRED',
      'EXTRA_INVALID',
      'COLUMNS_INVALID',
      'FORMAT_MISMATCH',
      'NO_PRICE_TIER',
    ]
    expect([...exercised].sort()).toEqual([...all].sort())
  })
})

import { describe, expect, it } from 'vitest'

import {
  CaixaParseError,
  cleanText,
  moneyToCents,
  parseBrDate,
  parseCaixaPayload,
} from '../src/caixa/parse'
import { caixaPayloadSchema } from '../src/caixa/schema'
import { loadFixture } from './load-fixture'

// ─── Dinheiro ────────────────────────────────────────────────────────────────

describe('moneyToCents', () => {
  it('converte o valor arrecadado da Mega-Sena 3038 exatamente', () => {
    // Caso citado em docs/01 §1.3: 66.603.906,00
    expect(moneyToCents(66603906.0)).toBe(6660390600n)
  })

  it.each([
    [0, 0n],
    [0.01, 1n],
    [2.5, 250n],
    [7, 700n],
    [9.95, 995n],
    [1716.31, 171631n],
    [64733.96, 6473396n],
    [41847613.5, 4184761350n],
    [2417456.47, 241745647n],
    [85091902.76, 8509190276n],
    [77358291.93, 7735829193n],
  ])('converte o float %o em %o centavos', (input, expected) => {
    expect(moneyToCents(input)).toBe(expected)
  })

  it('não herda erro de ponto flutuante da multiplicação por 100', () => {
    // Math.round(1.005 * 100) === 100 (errado); a intenção decimal é 1,01.
    expect(moneyToCents(1.005)).toBe(101n)
    // Math.round(1234.565 * 100) === 123456 (errado).
    expect(moneyToCents(1234.565)).toBe(123457n)
    expect(moneyToCents(0.1 + 0.2)).toBe(30n)
    expect(moneyToCents(1e21)).toBe(100000000000000000000000n)
  })

  it('aceita string em formato brasileiro', () => {
    expect(moneyToCents('66.603.906,00')).toBe(6660390600n)
    expect(moneyToCents('R$ 1.234,56')).toBe(123456n)
    expect(moneyToCents('64.733,96')).toBe(6473396n)
    // Sem vírgula e com grupos de 3 dígitos: pontos são separadores de milhar.
    expect(moneyToCents('1.234')).toBe(123400n)
  })

  it('aceita string em formato decimal com ponto', () => {
    expect(moneyToCents('1234.56')).toBe(123456n)
    expect(moneyToCents('0.07')).toBe(7n)
    expect(moneyToCents('12')).toBe(1200n)
  })

  it('trata ausência de valor como null (≠ zero)', () => {
    expect(moneyToCents(null)).toBeNull()
    expect(moneyToCents(undefined)).toBeNull()
    expect(moneyToCents('')).toBeNull()
    expect(moneyToCents('   ')).toBeNull()
  })

  it('rejeita valores não numéricos', () => {
    expect(() => moneyToCents('acumulado')).toThrow(CaixaParseError)
    expect(() => moneyToCents(Number.NaN)).toThrow(CaixaParseError)
    expect(() => moneyToCents(Number.POSITIVE_INFINITY)).toThrow(CaixaParseError)
  })
})

// ─── Data ────────────────────────────────────────────────────────────────────

describe('parseBrDate', () => {
  it('converte DD/MM/AAAA em ISO', () => {
    expect(parseBrDate('30/07/2026')).toBe('2026-07-30')
    expect(parseBrDate('01/08/2026')).toBe('2026-08-01')
    expect(parseBrDate('31/12/1999')).toBe('1999-12-31')
  })

  it('não desloca a data por fuso horário', () => {
    // 01/01 é o caso clássico de virar 31/12 quando se usa `new Date(...)` ingênuo.
    expect(parseBrDate('01/01/2026')).toBe('2026-01-01')
  })

  it('aceita ISO já normalizado (providers de fallback)', () => {
    expect(parseBrDate('2026-07-30')).toBe('2026-07-30')
  })

  it('rejeita data inexistente ou formato desconhecido', () => {
    expect(() => parseBrDate('31/02/2026')).toThrow(CaixaParseError)
    expect(() => parseBrDate('30-07-2026')).toThrow(CaixaParseError)
    expect(() => parseBrDate('')).toThrow(CaixaParseError)
  })
})

// ─── Texto ───────────────────────────────────────────────────────────────────

describe('cleanText', () => {
  it('remove o padding de NUL que a Caixa usa em campos vazios', () => {
    expect(cleanText('\u0000'.repeat(17))).toBe('')
  })

  it('normaliza o nome do time com padding de espaços', () => {
    expect(cleanText('TOMBENSE         /MG')).toBe('TOMBENSE/MG')
  })

  it('trata null/undefined como string vazia', () => {
    expect(cleanText(null)).toBe('')
    expect(cleanText(undefined)).toBe('')
  })
})

// ─── Mega-Sena ───────────────────────────────────────────────────────────────

describe('parseCaixaPayload — Mega-Sena 3038', () => {
  const raw = loadFixture('megasena-3038')
  const result = parseCaixaPayload(raw, 'megasena')

  it('mapeia identificação e data', () => {
    expect(result.lottery).toBe('megasena')
    expect(result.contestNumber).toBe(3038)
    expect(result.drawDate).toBe('2026-07-30')
    expect(result.nextContestNumber).toBe(3039)
    expect(result.isAccumulated).toBe(true)
  })

  it('converte dezenas de string para number preservando a ordem de sorteio', () => {
    expect(result.numbers).toEqual([30, 35, 38, 39, 46, 50])
    expect(result.numbersDrawOrder).toEqual([38, 50, 35, 39, 30, 46])
    expect(result.secondaryNumbers).toEqual([])
  })

  it('converte os valores do concurso para centavos', () => {
    expect(result.collectedCents).toBe(6660390600n)
    expect(result.accumulatedNextCents).toBe(8509190276n)
    expect(result.estimatedNextCents).toBe(10000000000n)
  })

  it('mapeia as faixas de premiação', () => {
    expect(result.prizes).toEqual([
      { tier: 1, label: '6 acertos', winnersCount: 0, prizeCents: 0n, drawIndex: null },
      { tier: 2, label: '5 acertos', winnersCount: 41, prizeCents: 6473396n, drawIndex: null },
      { tier: 3, label: '4 acertos', winnersCount: 2549, prizeCents: 171631n, drawIndex: null },
    ])
  })

  it('não inventa campo extra e preserva o payload bruto (saneado de NUL)', () => {
    expect(result.extraResult).toBeNull()
    // `raw` é uma cópia com NUL removidos (JSONB do Postgres rejeita NUL —
    // erro 22P05, visto no smoke contra banco real). Semanticamente idêntico:
    expect(result.raw).toEqual(JSON.parse(JSON.stringify(raw).replaceAll('\\u0000', '')))
    // invariante: nenhum NUL sobrevive à borda
    expect(JSON.stringify(result.raw)).not.toContain('\\u0000')
  })
})

// ─── Lotofácil ───────────────────────────────────────────────────────────────

describe('parseCaixaPayload — Lotofácil 3750', () => {
  const result = parseCaixaPayload(loadFixture('lotofacil-3750'), 'lotofacil')

  it('mapeia as 15 dezenas e as 5 faixas', () => {
    expect(result.numbers).toHaveLength(15)
    expect(result.numbers[0]).toBe(1)
    expect(result.numbersDrawOrder).toHaveLength(15)
    expect(result.prizes).toHaveLength(5)
    expect(result.prizes[0]).toEqual({
      tier: 1,
      label: '15 acertos',
      winnersCount: 3,
      prizeCents: 241745647n,
      drawIndex: null,
    })
  })

  it('distingue concurso não acumulado com acumulado zerado', () => {
    expect(result.isAccumulated).toBe(false)
    expect(result.accumulatedNextCents).toBe(0n)
    expect(result.collectedCents).toBe(4184761350n)
  })
})

// ─── Lotomania ───────────────────────────────────────────────────────────────

describe('parseCaixaPayload — Lotomania 2957', () => {
  const result = parseCaixaPayload(loadFixture('lotomania-2957'), 'lotomania')

  it('converte a dezena "00" literalmente para 0', () => {
    expect(result.numbers[0]).toBe(0)
    expect(result.numbers).toHaveLength(20)
  })

  it('mantém a faixa de 0 acertos, que é premiada nesta modalidade', () => {
    expect(result.prizes).toHaveLength(7)
    expect(result.prizes[6]?.label).toBe('0 acertos')
    expect(result.prizes[6]?.tier).toBe(7)
  })
})

// ─── Dupla Sena (2 sorteios) ─────────────────────────────────────────────────

describe('parseCaixaPayload — Dupla Sena 2990', () => {
  const result = parseCaixaPayload(loadFixture('duplasena-2990'), 'duplasena')

  it('mapeia o 2º sorteio para secondaryNumbers', () => {
    expect(result.numbers).toEqual([11, 13, 14, 25, 35, 38])
    expect(result.secondaryNumbers).toEqual([7, 15, 19, 23, 40, 46])
  })

  it('trunca a ordem de sorteio no tamanho do sorteio primário', () => {
    // A API concatena os 12 números (6 do 1º + 6 do 2º) num único array.
    expect(result.numbersDrawOrder).toEqual([38, 35, 25, 14, 11, 13])
  })

  it('atribui drawIndex 1 e 2 às oito faixas, na ordem do payload', () => {
    expect(result.prizes.map((p) => p.drawIndex)).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
    expect(result.prizes.map((p) => p.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.prizes[1]).toEqual({
      tier: 2,
      label: '5 acertos',
      winnersCount: 4,
      prizeCents: 859872n,
      drawIndex: 1,
    })
    expect(result.prizes[5]).toEqual({
      tier: 6,
      label: '5 acertos',
      winnersCount: 8,
      prizeCents: 386942n,
      drawIndex: 2,
    })
  })

  it('ignora o campo de time/mês preenchido com NUL', () => {
    expect(result.extraResult).toBeNull()
  })
})

// ─── +Milionária (trevos) ────────────────────────────────────────────────────

describe('parseCaixaPayload — +Milionária 376', () => {
  const result = parseCaixaPayload(loadFixture('maismilionaria-376'), 'maismilionaria')

  it('extrai os trevos de trevosSorteados', () => {
    expect(result.extraResult).toEqual({ kind: 'CLOVER', clovers: [3, 4] })
  })

  it('remove os trevos da ordem de sorteio das dezenas', () => {
    // dezenasSorteadasOrdemSorteio traz 8 itens: 6 dezenas + 2 trevos no fim.
    expect(result.numbers).toEqual([1, 2, 35, 38, 40, 45])
    expect(result.numbersDrawOrder).toEqual([1, 35, 40, 45, 38, 2])
  })

  it('mapeia as dez faixas com trevo', () => {
    expect(result.prizes).toHaveLength(10)
    expect(result.prizes[3]).toEqual({
      tier: 4,
      label: '5 acertos + 1 ou nenhum trevo',
      winnersCount: 12,
      prizeCents: 3716055n,
      drawIndex: null,
    })
  })
})

// ─── Dia de Sorte (mês) ──────────────────────────────────────────────────────

describe('parseCaixaPayload — Dia de Sorte 1260', () => {
  const result = parseCaixaPayload(loadFixture('diadesorte-1260'), 'diadesorte')

  it('converte o nome do mês em número', () => {
    expect(result.extraResult).toEqual({ kind: 'MONTH', month: 4 })
  })

  it('mapeia a faixa "Mês da Sorte"', () => {
    expect(result.prizes[4]).toEqual({
      tier: 5,
      label: 'Mês da Sorte',
      winnersCount: 38402,
      prizeCents: 250n,
      drawIndex: null,
    })
  })

  it.each([
    ['Janeiro', 1],
    ['MARÇO', 3],
    ['março', 3],
    ['dezembro', 12],
  ])('reconhece o mês %s', (nome, esperado) => {
    const raw = { ...(loadFixture('diadesorte-1260') as object), nomeTimeCoracaoMesSorte: nome }
    expect(parseCaixaPayload(raw, 'diadesorte').extraResult).toEqual({
      kind: 'MONTH',
      month: esperado,
    })
  })

  it('falha alto se o mês vier irreconhecível', () => {
    const raw = {
      ...(loadFixture('diadesorte-1260') as object),
      nomeTimeCoracaoMesSorte: 'Sextember',
    }
    expect(() => parseCaixaPayload(raw, 'diadesorte')).toThrow(CaixaParseError)
  })
})

// ─── Timemania (time) ────────────────────────────────────────────────────────

describe('parseCaixaPayload — Timemania 2422', () => {
  const result = parseCaixaPayload(loadFixture('timemania-2422'), 'timemania')

  it('normaliza o nome do time do coração', () => {
    expect(result.extraResult).toEqual({ kind: 'TEAM', teamName: 'TOMBENSE/MG' })
  })

  it('converte prêmios com uma casa decimal', () => {
    expect(result.prizes[3]?.prizeCents).toBe(1050n)
    expect(result.prizes[4]?.prizeCents).toBe(350n)
    expect(result.prizes[5]?.prizeCents).toBe(850n)
  })
})

// ─── Tolerância a variação de schema ─────────────────────────────────────────

describe('tolerância do schema', () => {
  const base = loadFixture('megasena-3038') as Record<string, unknown>

  it('ignora campos desconhecidos sem falhar e os mantém em raw', () => {
    const raw = { ...base, campoNovoDaCaixa: { qualquer: 'coisa' }, outroCampo: 42 }
    const result = parseCaixaPayload(raw, 'megasena')
    expect(result.contestNumber).toBe(3038)
    expect((result.raw as Record<string, unknown>)['campoNovoDaCaixa']).toEqual({
      qualquer: 'coisa',
    })
  })

  it('aceita numéricos entregues como string', () => {
    const raw = {
      ...base,
      numero: '3038',
      numeroConcursoProximo: '3039',
      valorArrecadado: '66603906.00',
      acumulado: 'true',
      listaRateioPremio: [
        { descricaoFaixa: '6 acertos', faixa: '1', numeroDeGanhadores: '0', valorPremio: '0,00' },
      ],
    }
    const result = parseCaixaPayload(raw, 'megasena')
    expect(result.contestNumber).toBe(3038)
    expect(result.nextContestNumber).toBe(3039)
    expect(result.collectedCents).toBe(6660390600n)
    expect(result.isAccumulated).toBe(true)
    expect(result.prizes[0]).toEqual({
      tier: 1,
      label: '6 acertos',
      winnersCount: 0,
      prizeCents: 0n,
      drawIndex: null,
    })
  })

  it('aceita listas nulas (Loteca não tem dezenas)', () => {
    const raw = {
      ...base,
      listaDezenas: null,
      dezenasSorteadasOrdemSorteio: null,
      listaRateioPremio: null,
    }
    const result = parseCaixaPayload(raw, 'loteca')
    expect(result.numbers).toEqual([])
    expect(result.numbersDrawOrder).toEqual([])
    expect(result.prizes).toEqual([])
  })

  it('normaliza numeroConcursoProximo = 0 para null', () => {
    const result = parseCaixaPayload({ ...base, numeroConcursoProximo: 0 }, 'megasena')
    expect(result.nextContestNumber).toBeNull()
  })

  it('lança CaixaParseError quando o payload perde um campo essencial', () => {
    const { numero: _numero, ...semNumero } = base
    expect(() => parseCaixaPayload(semNumero, 'megasena')).toThrow(CaixaParseError)
    expect(() => parseCaixaPayload({ ...base, dataApuracao: undefined }, 'megasena')).toThrow(
      CaixaParseError,
    )
    expect(() => parseCaixaPayload(null, 'megasena')).toThrow(CaixaParseError)
    expect(() => parseCaixaPayload('<html>erro</html>', 'megasena')).toThrow(CaixaParseError)
  })

  it('o schema por si só aceita todos os fixtures', () => {
    for (const name of [
      'megasena-3038',
      'lotofacil-3750',
      'lotomania-2957',
      'duplasena-2990',
      'maismilionaria-376',
      'diadesorte-1260',
      'timemania-2422',
    ]) {
      expect(caixaPayloadSchema.safeParse(loadFixture(name)).success).toBe(true)
    }
  })
})

/**
 * Testes puros do cálculo de custo multi-concurso (`server/lib/bet-cost.ts`),
 * usados por `bets.create`/`bets.update`/`bets.duplicate`. Sem Prisma/tRPC —
 * só `@lotopro/core` (config estática das modalidades) + os helpers puros.
 *
 * ⚠️ `apps/web` ainda não tem `vitest` como devDependency nem script `test`
 * (ver `apps/web/package.json`) — este arquivo fica pronto para quando isso
 * for cabeado numa próxima onda; até lá, `pnpm -F @lotopro/web test` não
 * executa nada. Rodar manualmente com `pnpm exec vitest run` depois de
 * adicionar a dependência, ou mover para o pacote que ganhar o runner.
 */
import { describe, expect, it } from 'vitest'
import { getLotteryConfig } from '@lotopro/core'
import {
  MAX_CONTESTS_PER_BET,
  assertValidContestRange,
  calculateBetCostCents,
  contestCount,
} from '@/server/lib/bet-cost'

describe('contestCount', () => {
  it('conta os concursos de forma inclusiva nas duas pontas', () => {
    expect(contestCount(3040, 3040)).toBe(1)
    expect(contestCount(3040, 3047)).toBe(8)
  })
})

describe('assertValidContestRange', () => {
  it('aceita um intervalo válido', () => {
    expect(() => assertValidContestRange(3040, 3047)).not.toThrow()
  })

  it('rejeita contestTo < contestFrom', () => {
    expect(() => assertValidContestRange(3047, 3040)).toThrow(/maior ou igual/)
  })

  it(`rejeita mais de ${MAX_CONTESTS_PER_BET} concursos`, () => {
    expect(() => assertValidContestRange(1, MAX_CONTESTS_PER_BET + 1)).toThrow(/no máximo/)
  })

  it(`aceita exatamente ${MAX_CONTESTS_PER_BET} concursos`, () => {
    expect(() => assertValidContestRange(1, MAX_CONTESTS_PER_BET)).not.toThrow()
  })
})

describe('calculateBetCostCents', () => {
  it('multiplica o preço da aposta simples pelo nº de concursos (Mega-Sena, 6 dezenas)', () => {
    const config = getLotteryConfig('megasena')
    const bet = { lottery: 'megasena' as const, numbers: [1, 2, 3, 4, 5, 6] }

    expect(calculateBetCostCents(config, bet, 3040, 3040)).toBe(600n)
    expect(calculateBetCostCents(config, bet, 3040, 3047)).toBe(600n * 8n)
  })

  it('aplica o multiplicador combinatório de aposta múltipla antes de multiplicar pelos concursos', () => {
    const config = getLotteryConfig('megasena')
    // C(7,6) = 7 apostas simples embutidas.
    const bet = { lottery: 'megasena' as const, numbers: [1, 2, 3, 4, 5, 6, 7] }

    const single = calculateBetCostCents(config, bet, 3040, 3040)
    expect(single).toBe(600n * 7n)
    expect(calculateBetCostCents(config, bet, 3040, 3043)).toBe(single * 4n)
  })

  it('Super Sete (COLUMNS): multiplicador é o produto de palpites por coluna, não C(n,k)', () => {
    const config = getLotteryConfig('supersete')
    const bet = {
      lottery: 'supersete' as const,
      numbers: [],
      columns: [[1, 2], [3], [4], [5], [6], [7], [8]], // 2 palpites na 1ª coluna, 1 nas demais
    }

    // multiplicador = 2 × 1×1×1×1×1×1 = 2
    expect(calculateBetCostCents(config, bet, 100, 100)).toBe(300n * 2n)
  })
})

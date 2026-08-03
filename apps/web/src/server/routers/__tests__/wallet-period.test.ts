/**
 * Testes puros dos helpers de período/agregação da Carteira
 * (`server/lib/wallet-period.ts`), usados por `wallet.overview`/`wallet.monthly`.
 * Sem Prisma/tRPC — mesmo padrão de `bet-cost.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import {
  calculateRoiPct,
  lastMonthKeys,
  monthKey,
  periodRange,
  saoPauloYearMonth,
  startOfSaoPauloMonthUtc,
} from '@/server/lib/wallet-period'

describe('saoPauloYearMonth', () => {
  it('lê ano/mês em America/Sao_Paulo (UTC-3), não em UTC', () => {
    // 01/08/2026 02:00 UTC == 31/07/2026 23:00 em São Paulo — vira julho, não agosto.
    expect(saoPauloYearMonth(new Date('2026-08-01T02:00:00Z'))).toEqual({ year: 2026, month: 7 })
    // 01/08/2026 03:00 UTC == 01/08/2026 00:00 em São Paulo — já é agosto.
    expect(saoPauloYearMonth(new Date('2026-08-01T03:00:00Z'))).toEqual({ year: 2026, month: 8 })
  })
})

describe('monthKey', () => {
  it('formata como "YYYY-MM" com zero à esquerda', () => {
    expect(monthKey(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03')
    expect(monthKey(new Date('2026-11-15T12:00:00Z'))).toBe('2026-11')
  })
})

describe('startOfSaoPauloMonthUtc', () => {
  it('devolve o instante UTC da meia-noite de São Paulo (offset fixo -03:00)', () => {
    const start = startOfSaoPauloMonthUtc(2026, 8)
    expect(start.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(saoPauloYearMonth(start)).toEqual({ year: 2026, month: 8 })
  })

  it('vira o ano corretamente (dezembro → janeiro)', () => {
    const start = startOfSaoPauloMonthUtc(2027, 1)
    expect(start.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('periodRange', () => {
  const now = new Date('2026-08-15T18:00:00Z') // 15/08/2026 15:00 em São Paulo

  it("'month' cobre [1º dia do mês atual, 1º dia do mês seguinte)", () => {
    const { gte, lt } = periodRange('month', now)
    expect(gte?.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(lt?.toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })

  it("'year' cobre [1º de janeiro, 1º de janeiro do ano seguinte)", () => {
    const { gte, lt } = periodRange('year', now)
    expect(gte?.toISOString()).toBe('2026-01-01T03:00:00.000Z')
    expect(lt?.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it("'all' não filtra por data", () => {
    expect(periodRange('all', now)).toEqual({})
  })

  it("'month' em dezembro vira o ano no limite superior", () => {
    const { gte, lt } = periodRange('month', new Date('2026-12-20T18:00:00Z'))
    expect(gte?.toISOString()).toBe('2026-12-01T03:00:00.000Z')
    expect(lt?.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('lastMonthKeys', () => {
  it('devolve N meses terminando no mês de referência, do mais antigo ao mais recente', () => {
    const reference = new Date('2026-08-15T18:00:00Z')
    expect(lastMonthKeys(reference, 3)).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('atravessa a virada de ano sem pular nem repetir mês', () => {
    const reference = new Date('2026-02-10T18:00:00Z')
    expect(lastMonthKeys(reference, 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('meses=1 devolve só o mês atual', () => {
    expect(lastMonthKeys(new Date('2026-08-15T18:00:00Z'), 1)).toEqual(['2026-08'])
  })

  it('meses=12 não tem chaves duplicadas', () => {
    const keys = lastMonthKeys(new Date('2026-08-15T18:00:00Z'), 12)
    expect(keys).toHaveLength(12)
    expect(new Set(keys).size).toBe(12)
  })
})

describe('calculateRoiPct', () => {
  it('ROI positivo quando o prêmio supera o gasto', () => {
    expect(calculateRoiPct(10_000n, 15_000n)).toBeCloseTo(50, 6)
  })

  it('ROI negativo — nunca escondido nem arredondado para 0 (docs/08 CL-92)', () => {
    expect(calculateRoiPct(10_000n, 3_000n)).toBeCloseTo(-70, 6)
  })

  it('ROI -100% quando não houve nenhum prêmio', () => {
    expect(calculateRoiPct(10_000n, 0n)).toBeCloseTo(-100, 6)
  })

  it('null quando não houve gasto no período (ROI indefinido, diferente de 0%)', () => {
    expect(calculateRoiPct(0n, 0n)).toBeNull()
    expect(calculateRoiPct(0n, 5_000n)).toBeNull()
  })
})

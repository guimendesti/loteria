import { describe, expect, it } from 'vitest'
import { computePayout, type PayoutMember } from '../src/index'

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

describe('rateio — casos manuais (docs/07 §7.6)', () => {
  it('prêmio indivisível: resto vai para o organizador', () => {
    const result = computePayout(1000n, [
      { memberId: 'a', shares: 1 },
      { memberId: 'b', shares: 1 },
      { memberId: 'c', shares: 1 },
    ], 3)
    expect(result.shares.map((s) => s.amountCents)).toEqual([333n, 333n, 333n])
    expect(result.remainderCents).toBe(1n)
    expect(result.totalCents).toBe(1000n)
  })

  it('cotas desiguais', () => {
    const result = computePayout(100n, [
      { memberId: 'a', shares: 2 },
      { memberId: 'b', shares: 1 },
    ], 3)
    expect(result.shares.map((s) => s.amountCents)).toEqual([66n, 33n])
    expect(result.remainderCents).toBe(1n)
  })

  it('divisão exata não deixa resto', () => {
    const result = computePayout(90_000n, [
      { memberId: 'a', shares: 3 },
      { memberId: 'b', shares: 6 },
      { memberId: 'c', shares: 1 },
    ], 10)
    expect(result.shares.map((s) => s.amountCents)).toEqual([27_000n, 54_000n, 9_000n])
    expect(result.remainderCents).toBe(0n)
  })

  it('cotas não vendidas ficam com o organizador', () => {
    const result = computePayout(1000n, [{ memberId: 'a', shares: 1 }], 4)
    expect(result.shares[0]?.amountCents).toBe(250n)
    expect(result.remainderCents).toBe(750n)
  })

  it('membro com 0 cotas não recebe', () => {
    const result = computePayout(500n, [
      { memberId: 'a', shares: 5 },
      { memberId: 'b', shares: 0 },
    ], 5)
    expect(result.shares.map((s) => s.amountCents)).toEqual([500n, 0n])
    expect(result.remainderCents).toBe(0n)
  })

  it('prêmio zero (concurso sem acerto)', () => {
    const result = computePayout(0n, [
      { memberId: 'a', shares: 1 },
      { memberId: 'b', shares: 2 },
    ], 3)
    expect(result.shares.every((s) => s.amountCents === 0n)).toBe(true)
    expect(result.remainderCents).toBe(0n)
  })

  it('sem membros: tudo é resto', () => {
    const result = computePayout(12_345n, [], 10)
    expect(result.shares).toEqual([])
    expect(result.remainderCents).toBe(12_345n)
  })

  it('prêmio bilionário continua exato (bigint, nunca float)', () => {
    const total = 3_000_000_000_00n // R$ 3 bilhões em centavos — Mega da Virada 2025
    const result = computePayout(total, [
      { memberId: 'a', shares: 7 },
      { memberId: 'b', shares: 11 },
      { memberId: 'c', shares: 13 },
    ], 31)
    const sum = result.shares.reduce((acc, s) => acc + s.amountCents, 0n)
    expect(sum + result.remainderCents).toBe(total)
    expect(result.shares[0]?.amountCents).toBe((total * 7n) / 31n)
  })

  it('preserva memberId e cotas na saída', () => {
    const members: PayoutMember[] = [
      { memberId: 'guilherme', shares: 4 },
      { memberId: 'ana', shares: 1 },
    ]
    const result = computePayout(777n, members, 5)
    expect(result.shares.map((s) => s.memberId)).toEqual(['guilherme', 'ana'])
    expect(result.shares.map((s) => s.shares)).toEqual([4, 1])
  })
})

describe('rateio — entradas inválidas', () => {
  it('rejeita prêmio negativo', () => {
    expect(() => computePayout(-1n, [{ memberId: 'a', shares: 1 }], 1)).toThrow(/negativo/)
  })

  it('rejeita totalShares inválido', () => {
    expect(() => computePayout(10n, [], 0)).toThrow(/totalShares/)
    expect(() => computePayout(10n, [], -3)).toThrow(/totalShares/)
    expect(() => computePayout(10n, [], 2.5)).toThrow(/totalShares/)
  })

  it('rejeita cotas não inteiras ou negativas', () => {
    expect(() => computePayout(10n, [{ memberId: 'a', shares: 1.5 }], 3)).toThrow(/Cotas/)
    expect(() => computePayout(10n, [{ memberId: 'a', shares: -1 }], 3)).toThrow(/Cotas/)
  })

  it('rejeita soma de cotas acima do total do bolão', () => {
    expect(() =>
      computePayout(10n, [
        { memberId: 'a', shares: 3 },
        { memberId: 'b', shares: 3 },
      ], 5),
    ).toThrow(/excede/)
  })

  it('rejeita memberId duplicado', () => {
    expect(() =>
      computePayout(10n, [
        { memberId: 'a', shares: 1 },
        { memberId: 'a', shares: 1 },
      ], 5),
    ).toThrow(/duplicado/)
  })
})

describe('rateio — invariante da soma em 1000 casos pseudo-aleatórios (semente fixa)', () => {
  it('Σ(amountCents) + remainderCents === totalCents, sempre', () => {
    const random = mulberry32(0x9e3779b9)
    let casesWithRemainder = 0

    for (let iteration = 0; iteration < 1000; iteration++) {
      const memberCount = 1 + Math.floor(random() * 40)

      // Cotas por membro (1..25) — todas as cotas do bolão são vendidas neste cenário.
      const members: PayoutMember[] = []
      let totalShares = 0
      for (let i = 0; i < memberCount; i++) {
        const shares = 1 + Math.floor(random() * 25)
        totalShares += shares
        members.push({ memberId: `m${i}`, shares })
      }

      // Prêmio de R$ 0,00 a ~R$ 500 milhões, em centavos.
      const totalPrizeCents = BigInt(Math.floor(random() * 50_000_000_000))

      const result = computePayout(totalPrizeCents, members, totalShares)

      const sum = result.shares.reduce((acc, share) => acc + share.amountCents, 0n)
      expect(sum + result.remainderCents).toBe(totalPrizeCents)
      expect(result.totalCents).toBe(totalPrizeCents)
      expect(result.shares).toHaveLength(memberCount)

      // Nenhum valor negativo e nada além do devido.
      expect(result.remainderCents >= 0n).toBe(true)
      for (const share of result.shares) {
        expect(share.amountCents >= 0n).toBe(true)
        expect(share.amountCents * BigInt(totalShares) <= totalPrizeCents * BigInt(share.shares)).toBe(
          true,
        )
      }

      // Com todas as cotas vendidas, o resto é só arredondamento: < nº de membros.
      expect(result.remainderCents < BigInt(memberCount)).toBe(true)

      // Monotonicidade: mais cotas nunca recebe menos.
      const ordered = [...result.shares].sort((a, b) => a.shares - b.shares)
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1]
        const curr = ordered[i]
        if (prev !== undefined && curr !== undefined) {
          expect(curr.amountCents >= prev.amountCents).toBe(true)
        }
      }

      if (result.remainderCents > 0n) casesWithRemainder += 1
    }

    // Sanidade da bateria: o cenário com resto (o interessante) foi de fato exercitado.
    expect(casesWithRemainder).toBeGreaterThan(100)
  })

  it('cenário com cotas não vendidas mantém a invariante', () => {
    const random = mulberry32(0x5bf03635)
    for (let iteration = 0; iteration < 1000; iteration++) {
      const memberCount = 1 + Math.floor(random() * 10)
      const members: PayoutMember[] = []
      let assigned = 0
      for (let i = 0; i < memberCount; i++) {
        const shares = Math.floor(random() * 10)
        assigned += shares
        members.push({ memberId: `m${i}`, shares })
      }
      const unsold = Math.floor(random() * 15)
      const totalShares = Math.max(1, assigned + unsold)
      const totalPrizeCents = BigInt(Math.floor(random() * 1_000_000_000))

      const result = computePayout(totalPrizeCents, members, totalShares)
      const sum = result.shares.reduce((acc, share) => acc + share.amountCents, 0n)
      expect(sum + result.remainderCents).toBe(totalPrizeCents)
      expect(result.remainderCents >= 0n).toBe(true)
    }
  })
})

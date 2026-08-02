import { describe, expect, it } from 'vitest'
import {
  betCheckedTemplate,
  betPrizedTemplate,
  contestAccumulatedTemplate,
  formatMillionsBRL,
  poolBetPlacedTemplate,
  poolPaymentPendingTemplate,
  poolPrizedTemplate,
  renderPlainTemplate,
} from '../../src/notify/templates'

// Textos EXATOS de docs/09-design-system-e-ux.md §9.6 — não reformule, transcreva.

describe('betPrizedTemplate — doc 9.6 "Premiado"', () => {
  it('produz o título e corpo exatos do doc', () => {
    const result = betPrizedTemplate({ lotteryName: 'Lotofácil', contestNumber: 3697, hits: 14 })
    expect(result.subject).toBe('🎉 Você foi premiado na Lotofácil!')
    expect(result.text).toBe('Acertou 14 números no concurso 3697. Confira o valor.')
    expect(result.html).toContain('Você foi premiado na Lotofácil')
    expect(result.html).toContain('Acertou 14 números no concurso 3697. Confira o valor.')
  })

  it('escapa HTML no nome da modalidade (defesa em profundidade)', () => {
    const result = betPrizedTemplate({ lotteryName: '<b>X</b>', contestNumber: 1, hits: 1 })
    expect(result.html).not.toContain('<b>X</b>')
    expect(result.html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})

describe('betCheckedTemplate — doc 9.6 "Acertos sem prêmio" / "Nenhum acerto"', () => {
  it('acertos sem prêmio: texto exato do doc, com concursos restantes', () => {
    const result = betCheckedTemplate({ lotteryName: 'Mega-Sena', contestNumber: 3040, hits: 2, remainingContests: 5 })
    expect(result.subject).toBe('Resultado da Mega-Sena 3040')
    expect(result.text).toBe('Você acertou 2 números. Seu jogo vale mais 5 concursos.')
  })

  it('nenhum acerto: texto exato do doc, sem menção a concursos restantes', () => {
    const result = betCheckedTemplate({ lotteryName: 'Mega-Sena', contestNumber: 3040, hits: 0 })
    expect(result.subject).toBe('Resultado da Mega-Sena 3040')
    expect(result.text).toBe('Confira as dezenas sorteadas e seus jogos.')
  })

  it('acertos sem prêmio mas sem remainingContests informado: omite a frase de validade', () => {
    const result = betCheckedTemplate({ lotteryName: 'Mega-Sena', contestNumber: 3040, hits: 2 })
    expect(result.text).toBe('Você acertou 2 números.')
  })
})

describe('contestAccumulatedTemplate — doc 9.6 "Acumulado"', () => {
  it('produz o título e corpo exatos do doc para R$ 120 milhões', () => {
    const result = contestAccumulatedTemplate({
      lotteryName: 'Mega-Sena',
      estimatedNextCents: 12_000_000_000n, // R$ 120.000.000,00
      nextDrawLabel: 'quinta-feira, 21h',
    })
    expect(result.subject).toBe('Mega-Sena acumulou R$ 120 milhões')
    expect(result.text).toBe('Próximo sorteio: quinta-feira, 21h.')
  })
})

describe('formatMillionsBRL', () => {
  it('arredonda para o milhão mais próximo, só com bigint', () => {
    expect(formatMillionsBRL(12_000_000_000n)).toBe('R$ 120 milhões')
    expect(formatMillionsBRL(100_000_000n)).toBe('R$ 1 milhão') // singular
    expect(formatMillionsBRL(149_000_000n)).toBe('R$ 1 milhão') // 1.49M arredonda p/ baixo
    expect(formatMillionsBRL(150_000_000n)).toBe('R$ 2 milhões') // 1.50M arredonda p/ cima
  })
})

describe('pool.* — placeholders (doc 9.6, ainda sem job que enfileire)', () => {
  it('pool.payment_pending', () => {
    const result = poolPaymentPendingTemplate({ memberName: 'João', poolName: 'Escritório', shares: 2 })
    expect(result.subject).toBe('João entrou no bolão "Escritório"')
    expect(result.text).toBe('2 cotas · aguardando pagamento.')
  })

  it('pool.bet_placed', () => {
    const result = poolBetPlacedTemplate({ poolName: 'Escritório' })
    expect(result.subject).toBe('Bolão "Escritório" apostado ✅')
    expect(result.text).toBe('O comprovante já está disponível para todos.')
  })

  it('pool.prized', () => {
    const result = poolPrizedTemplate({ poolName: 'Escritório', memberShareText: 'R$ 340,00' })
    expect(result.subject).toBe('🎉 O bolão "Escritório" foi premiado!')
    expect(result.text).toBe('Sua parte: R$ 340,00. Veja o rateio.')
  })
})

describe('renderPlainTemplate — fallback (não é texto do doc)', () => {
  it('sanitiza quebras de linha no assunto e escapa HTML no corpo', () => {
    const result = renderPlainTemplate('Assunto\ncom quebra', 'corpo <script>alert(1)</script>')
    expect(result.subject).toBe('Assunto com quebra')
    expect(result.html).not.toContain('<script>')
    expect(result.text).toBe('corpo <script>alert(1)</script>') // texto puro não é escapado
  })
})

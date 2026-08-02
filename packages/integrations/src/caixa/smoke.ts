/**
 * Smoke test manual contra a API REAL da Caixa. **Não é parte da suíte automatizada**
 * (a suíte roda offline, com fixtures).
 *
 * Serve para a validação exigida pelo doc 06 §6.6: "validar o handshake TLS em
 * Linux/produção na Sprint 1". Rodar no ambiente alvo antes de fechar a arquitetura.
 *
 * Uso (Node 20 não executa TypeScript direto — precisa de um runner):
 *   pnpm dlx tsx packages/integrations/src/caixa/smoke.ts megasena
 *   pnpm dlx tsx packages/integrations/src/caixa/smoke.ts duplasena 2990
 *
 * Em Node >= 22.6: `node --experimental-strip-types src/caixa/smoke.ts megasena`.
 */

import { CaixaOfficialProvider, CaixaTlsError, CAIXA_SLUG_PATH } from './provider'
import type { LotterySlug } from '@lotopro/core'

async function main(): Promise<void> {
  const slugArg = process.argv[2] ?? 'megasena'
  if (!(slugArg in CAIXA_SLUG_PATH)) {
    console.error(`modalidade inválida: ${slugArg}`)
    console.error(`válidas: ${Object.keys(CAIXA_SLUG_PATH).join(', ')}`)
    process.exitCode = 2
    return
  }
  const slug = slugArg as LotterySlug
  const contestArg = process.argv[3]

  const provider = new CaixaOfficialProvider()
  const startedAt = Date.now()

  try {
    const result = contestArg
      ? await provider.fetchByNumber(slug, Number.parseInt(contestArg, 10))
      : await provider.fetchLatest(slug)

    console.log(`OK em ${Date.now() - startedAt}ms`)
    console.log({
      lottery: result.lottery,
      contestNumber: result.contestNumber,
      drawDate: result.drawDate,
      numbers: result.numbers,
      secondaryNumbers: result.secondaryNumbers,
      extraResult: result.extraResult,
      isAccumulated: result.isAccumulated,
      collectedCents: result.collectedCents?.toString() ?? null,
      estimatedNextCents: result.estimatedNextCents?.toString() ?? null,
      prizes: result.prizes.map((p) => ({
        tier: p.tier,
        label: p.label,
        winnersCount: p.winnersCount,
        prizeCents: p.prizeCents.toString(),
        drawIndex: p.drawIndex,
      })),
    })
  } catch (error) {
    if (error instanceof CaixaTlsError) {
      console.error('FALHA DE TLS — risco conhecido do doc 01 §1.3')
      console.error(error.message)
      process.exitCode = 3
      return
    }
    console.error('FALHA:', error)
    process.exitCode = 1
  }
}

void main()

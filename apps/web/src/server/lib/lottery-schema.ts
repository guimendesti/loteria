/**
 * Schemas Zod compartilhados entre os routers de apostas/concursos.
 *
 * `lotterySlugSchema` é derivado dinamicamente de `ALL_LOTTERIES` (não uma lista
 * hardcoded) — se o core ganhar/perder uma modalidade, este schema acompanha
 * sem precisar de edição aqui (CLAUDE.md §6, "modalidade é dado").
 *
 * `extraPicksSchema`/`columnsSchema` só validam FORMATO (tipos, shape). As regras
 * de negócio (faixa de universo, mín/máx dezenas, campo extra obrigatório etc.)
 * são responsabilidade exclusiva de `validateBet` (@lotopro/core) — não duplicar
 * aqui, para não haver duas fontes de verdade divergentes.
 */
import { z } from 'zod'
import { ALL_LOTTERIES } from '@lotopro/core'
import type { LotterySlug } from '@lotopro/core'

const LOTTERY_SLUGS = ALL_LOTTERIES.map((lottery) => lottery.slug) as [LotterySlug, ...LotterySlug[]]

export const lotterySlugSchema = z.enum(LOTTERY_SLUGS)

export const extraPicksSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CLOVER'), clovers: z.array(z.number().int()) }),
  z.object({ kind: z.literal('MONTH'), month: z.number().int() }),
  z.object({ kind: z.literal('TEAM'), teamId: z.string().min(1) }),
])

export const columnsSchema = z.array(z.array(z.number().int()))

export const numbersSchema = z.array(z.number().int().min(0))

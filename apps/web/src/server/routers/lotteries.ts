import { ALL_LOTTERIES } from '@lotopro/core'
import { lotteryColors } from '@lotopro/ui'
import { publicProcedure, router } from '@/server/trpc'

/**
 * Catálogo de modalidades — nome/slug/cor apenas, direto de
 * `@lotopro/core` (config estática, sem tocar o banco). A cor vem de
 * `@lotopro/ui` (lotteryColors), já ajustada para contraste (docs/09 §9.2);
 * `LotteryConfig` em si não carrega cor — ver packages/core/src/types.ts.
 *
 * Em produção o catálogo "de verdade" é a tabela `lotteries` (docs/07) —
 * este router é deliberadamente estático, só para o shell/typecheck.
 */
export const lotteriesRouter = router({
  list: publicProcedure.query(() => {
    return ALL_LOTTERIES.map((lottery) => ({
      slug: lottery.slug,
      name: lottery.name,
      color: lotteryColors[lottery.slug],
    }))
  }),
})

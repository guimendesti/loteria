# Registro pendente do router `wallet` em `_app.ts`

Este agente **não edita `_app.ts`** (outro agente — billing — também edita esse arquivo
na mesma onda; território combinado para evitar conflito de merge). O router está pronto
e exportado em `apps/web/src/server/routers/wallet.ts` (`walletRouter`) — falta só o
orquestrador aplicar as duas linhas abaixo.

## Diff a aplicar em `apps/web/src/server/routers/_app.ts`

Estado atual do arquivo (já com `billing`, registrado por outro agente nesta mesma onda):

```ts
import { router } from '@/server/trpc'
import { healthRouter } from '@/server/routers/health'
import { lotteriesRouter } from '@/server/routers/lotteries'
import { betsRouter } from '@/server/routers/bets'
import { contestsRouter } from '@/server/routers/contests'
import { billingRouter } from '@/server/routers/billing'

export const appRouter = router({
  health: healthRouter,
  lotteries: lotteriesRouter,
  bets: betsRouter,
  contests: contestsRouter,
  billing: billingRouter,
})

export type AppRouter = typeof appRouter
```

Diff a aplicar por cima disso (só a linha de import + a linha no objeto do router —
não mexe em mais nada, independente de outros routers que já tenham sido registrados):

```diff
 import { contestsRouter } from '@/server/routers/contests'
 import { billingRouter } from '@/server/routers/billing'
+import { walletRouter } from '@/server/routers/wallet'

 export const appRouter = router({
   health: healthRouter,
   lotteries: lotteriesRouter,
   bets: betsRouter,
   contests: contestsRouter,
   billing: billingRouter,
+  wallet: walletRouter,
 })
```

## Validação já feita por este agente (e revertida)

Apliquei o diff acima localmente (por cima do `_app.ts` já com `billing`), rodei:

- `pnpm -F @lotopro/web typecheck` com o registro aplicado → **zero erros em
  `wallet.ts`/`carteira/**`/`resultados/**`**. Restaram só 2 erros pré-existentes em
  `src/server/lib/billing/gateway.ts` (`Cannot find name 'ASAAS_PACKAGE'`) — trabalho em
  andamento de outro agente nesta mesma onda, não relacionado a este território.
- `pnpm -F @lotopro/web test` com o registro aplicado → **65/65 testes verdes** (16 deste
  agente em `wallet-period.test.ts` + 8 `bet-cost.test.ts` + 29 `billing-service.test.ts` +
  12 `entitlements.test.ts`, dos outros agentes).

Depois, **revertei `_app.ts` removendo só a linha do import e a linha `wallet:
walletRouter` que eu tinha adicionado**, preservando a linha do `billing` intacta — o
arquivo final ficou byte-a-byte igual ao estado em que o encontrei (confirmado por leitura
antes/depois). Sem o registro, `pnpm typecheck` volta a mostrar só os 2 erros esperados em
`carteira/page.tsx` (`Property 'wallet' does not exist...`).

Depois de aplicar o diff acima, apagar este arquivo.

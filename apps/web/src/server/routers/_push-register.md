# Registro pendente do router `push` em `_app.ts`

Este agente **não edita `_app.ts`** (território combinado entre agentes nesta onda — evita
conflito de merge; ver `_wallet-register.md`, mesma convenção). O router está pronto e
exportado em `apps/web/src/server/routers/push.ts` (`pushRouter`) — falta só o orquestrador
aplicar as duas linhas abaixo.

## Diff a aplicar em `apps/web/src/server/routers/_app.ts`

Estado atual do arquivo (já com `wallet`, registrado em onda anterior):

```ts
import { router } from '@/server/trpc'
import { healthRouter } from '@/server/routers/health'
import { lotteriesRouter } from '@/server/routers/lotteries'
import { betsRouter } from '@/server/routers/bets'
import { contestsRouter } from '@/server/routers/contests'
import { billingRouter } from '@/server/routers/billing'
import { walletRouter } from '@/server/routers/wallet'

export const appRouter = router({
  health: healthRouter,
  lotteries: lotteriesRouter,
  bets: betsRouter,
  contests: contestsRouter,
  billing: billingRouter,
  wallet: walletRouter,
})

export type AppRouter = typeof appRouter
```

Diff a aplicar por cima disso (só a linha de import + a linha no objeto do router — não mexe
em mais nada, independente de outros routers que já tenham sido registrados nesse meio-tempo,
ex.: `account`/`admin`):

```diff
 import { billingRouter } from '@/server/routers/billing'
 import { walletRouter } from '@/server/routers/wallet'
+import { pushRouter } from '@/server/routers/push'

 export const appRouter = router({
   health: healthRouter,
   lotteries: lotteriesRouter,
   bets: betsRouter,
   contests: contestsRouter,
   billing: billingRouter,
   wallet: walletRouter,
+  push: pushRouter,
 })
```

## Validação já feita por este agente (e revertida)

Apliquei o diff acima localmente (por cima do `_app.ts` já com `wallet`), rodei
`pnpm -F @lotopro/web typecheck` com o registro aplicado → **zero erros em
`push.ts`/`PushOptIn.tsx`/`use-push-subscription.ts`**. Restaram só erros pré-existentes em
`src/server/routers/admin/**` (trabalho em andamento de outros agentes nesta mesma onda,
território `(admin)`, não relacionado a este território).

Depois, **revertei `_app.ts`** (`git checkout --`) para o estado em que encontrei — confirmado
por `git diff` vazio no arquivo. Sem o registro, `pnpm typecheck` volta a mostrar
`Property 'push' does not exist on type ...` nas duas chamadas `trpc.push.*` de
`use-push-subscription.ts` — esperado até o diff acima ser aplicado.

## Onde renderizar `<PushOptIn />`

Fora do território desta tarefa (dashboard é de outro agente). Sugestão para
`apps/web/src/app/(app)/app/page.tsx`: importar `import { PushOptIn } from './components/PushOptIn'`
e renderizar `<PushOptIn />` logo abaixo do `<h1>` do dashboard (mesmo nível/ordem do
`<EmptyState>` condicional já existente ali) — é um card dismissível-por-natureza (some
sozinho assim que `state` vira `'granted'`/`'denied'`), então não compete por espaço com o
conteúdo principal.

Depois de aplicar o diff acima, apagar este arquivo.

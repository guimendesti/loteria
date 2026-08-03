# Registro pendente do router `account` em `_app.ts`

Este agente **não edita `_app.ts`** (território exclusivo desta tarefa é
`apps/web/src/app/(app)/app/conta/**` e `apps/web/src/server/routers/account.ts` — outros
agentes mexem em `(admin)` na mesma onda; `_app.ts` é compartilhado e fica fora). O router
está pronto e exportado em `apps/web/src/server/routers/account.ts` (`accountRouter`) —
falta só o orquestrador aplicar as duas linhas abaixo.

## Diff a aplicar em `apps/web/src/server/routers/_app.ts`

Estado atual do arquivo:

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

Diff a aplicar por cima disso (só a linha de import + a linha no objeto do router — não
mexe em mais nada, independente de outros routers que já tenham sido registrados por
outras ondas, ex.: `admin`):

```diff
 import { billingRouter } from '@/server/routers/billing'
 import { walletRouter } from '@/server/routers/wallet'
+import { accountRouter } from '@/server/routers/account'

 export const appRouter = router({
   health: healthRouter,
   lotteries: lotteriesRouter,
   bets: betsRouter,
   contests: contestsRouter,
   billing: billingRouter,
   wallet: walletRouter,
+  account: accountRouter,
 })
```

## Por que isso importa agora (não é só "arrumar depois")

As 4 telas em `(app)/app/conta/**` (`page.tsx`, `assinatura/page.tsx`,
`notificacoes/page.tsx`, `privacidade/page.tsx`) chamam `trpc.account.*`. Sem essa linha em
`_app.ts`, o tipo `AppRouter` não conhece `account`, e o `tsc --noEmit` do app falha nessas
4 páginas com `Property 'account' does not exist on type ...` — é exatamente o mesmo
sintoma que `wallet`/`carteira` tiveram antes de `wallet` ser registrado (ver
`_wallet-register.md`, já resolvido — hoje `wallet` está em `_app.ts`).

O **router** e os **testes** (`server/routers/__tests__/account.test.ts`) não dependem
disso — chamam `accountRouter` diretamente via `createCallerFactory`, sem passar pelo
`AppRouter` global. Só o typecheck das 4 páginas cliente depende do registro.

O CTA do `PaywallDialog` (`(app)/app/components/PaywallDialog.tsx`) já aponta para
`/app/conta/assinatura` — a rota existe (`assinatura/page.tsx`), mas as chamadas
`trpc.billing.*`/`trpc.account.*` dela só funcionam de fato em runtime depois deste
registro (o `billing` já está registrado; falta só `account`).

## Validação já feita por este agente (e revertida)

Apliquei o diff acima localmente (por cima do `_app.ts` já com `wallet`), rodei:

- `pnpm -F @lotopro/web typecheck` com o registro aplicado → **zero erros em
  `account.ts`/`crypto.ts`/`conta/**`**. Restaram só os erros pré-existentes de outras
  ondas em andamento: `(admin)/**` (`Property 'admin' does not exist...` — router admin
  ainda não registrado, território de outro agente) e
  `(app)/app/components/use-push-subscription.ts` (`Property 'push' does not exist...` —
  router de push notifications, não relacionado a esta tarefa).
- `pnpm -F @lotopro/web test` com o registro aplicado → **137/137 testes verdes** (19
  deste agente em `account.test.ts` + 118 de outras ondas: `admin-audit`,
  `wallet-period`, `billing-webhook`, `billing-service`, `bet-cost`, `admin-rbac`,
  `admin-finance`, `entitlements`, `admin-reprocess`).

Depois, **revertei `_app.ts` removendo só a linha do import e a linha `account:
accountRouter` que eu tinha adicionado**, preservando as linhas de `billing`/`wallet`
intactas — o arquivo final ficou igual ao estado em que o encontrei (confirmado por
leitura antes/depois). Sem o registro, `pnpm typecheck` volta a mostrar os erros
`Property 'account' does not exist...` nas 4 páginas de `conta/**`, como esperado.

Depois de aplicar o diff acima, apagar este arquivo.

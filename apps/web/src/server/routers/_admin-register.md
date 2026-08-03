# Registro pendente do namespace `admin` em `_app.ts`

Nenhum dos agentes da Onda 7 (backoffice) edita `_app.ts` — território combinado do
orquestrador, mesmo protocolo do `_wallet-register.md` (já aplicado e apagado). Os 6
routers abaixo já existem e exportam o que a navegação/telas de `(admin)/**` esperam;
falta só aplicar o diff.

- `dashboard`/`users` — deste agente (admin-core): `server/routers/admin/dashboard.ts`
  (`adminDashboardRouter`), `server/routers/admin/users.ts` (`adminUsersRouter`).
- `bets`/`finance`/`config`/`support` — do agente admin-ops: `server/routers/admin/bets.ts`
  (`adminBetsRouter`), `server/routers/admin/finance.ts` (`adminFinanceRouter`),
  `server/routers/admin/config.ts` (`adminConfigRouter`), `server/routers/admin/support.ts`
  (`adminSupportRouter`).

As telas client-side já chamam exatamente essas chaves (`trpc.admin.dashboard.*`,
`trpc.admin.users.*`, `trpc.admin.bets.*`, `trpc.admin.finance.*`, `trpc.admin.config.*`,
`trpc.admin.support.*` — confirmado por grep em `(admin)/**`), então o namespace final
tem que ser UM `admin: router({...})` só, com as 6 chaves juntas — não dois `admin: router(...)`
separados (o objeto literal passado a `router({...})` só aceita uma chave `admin` por vez).

## Diff a aplicar em `apps/web/src/server/routers/_app.ts`

Estado atual (pristino, sem nenhum router de admin):

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

Diff a aplicar por cima:

```diff
 import { billingRouter } from '@/server/routers/billing'
 import { walletRouter } from '@/server/routers/wallet'
+import { adminDashboardRouter } from '@/server/routers/admin/dashboard'
+import { adminUsersRouter } from '@/server/routers/admin/users'
+import { adminBetsRouter } from '@/server/routers/admin/bets'
+import { adminFinanceRouter } from '@/server/routers/admin/finance'
+import { adminConfigRouter } from '@/server/routers/admin/config'
+import { adminSupportRouter } from '@/server/routers/admin/support'

 export const appRouter = router({
   health: healthRouter,
   lotteries: lotteriesRouter,
   bets: betsRouter,
   contests: contestsRouter,
   billing: billingRouter,
   wallet: walletRouter,
+  admin: router({
+    dashboard: adminDashboardRouter,
+    users: adminUsersRouter,
+    bets: adminBetsRouter,
+    finance: adminFinanceRouter,
+    config: adminConfigRouter,
+    support: adminSupportRouter,
+  }),
 })
```

## Validação já feita por este agente (aplicada localmente e revertida)

Apliquei o diff acima duas vezes:

1. **Só `dashboard`/`users`** (meu território) — `pnpm -F @lotopro/web typecheck`: zero
   erros em `rbac.ts`/`audit.ts`/`admin/dashboard.ts`/`admin/users.ts`/`(admin)/**` (fora
   das subpastas de outro agente). `pnpm -F @lotopro/web test`: **118/118 testes verdes**
   (23 deste agente — 17 `admin-rbac.test.ts` + 6 `admin-audit.test.ts` — mais 95 de outros
   agentes, incluindo `admin-finance.test.ts`/`admin-reprocess.test.ts` do admin-ops), 1
   suíte falhando (`account.test.ts`, `createCallerFactory` não existe na versão instalada
   de `@trpc/server` — bug pré-existente de outro agente/território, não deste).
2. **Diff completo** (as 6 chaves, para confirmar que o merge com admin-ops fecha limpo)
   — `pnpm -F @lotopro/web typecheck`: os erros que antes apareciam em
   `(admin)/admin/apostas/page.tsx` e `(admin)/admin/financeiro/page.tsx`
   ("Property 'bets'/'finance' does not exist...") **desaparecem** — confirma que os 4
   routers do admin-ops têm exatamente as chaves que as telas dele esperam. Erros
   restantes: só `account`/`push` (routers de outro agente/onda, `use-push-subscription.ts`
   e `(app)/app/conta/**`, ainda sem registro) e o mesmo `account.test.ts` acima — nenhum
   relacionado a `admin/**`.

Depois de cada rodada, **revertei `_app.ts` para o estado pristino** (confirmado
byte-a-byte contra o que encontrei no início da tarefa).

Depois de aplicar o diff, apagar este arquivo.

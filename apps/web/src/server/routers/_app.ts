import { router } from '@/server/trpc'
import { healthRouter } from '@/server/routers/health'
import { lotteriesRouter } from '@/server/routers/lotteries'
import { betsRouter } from '@/server/routers/bets'
import { contestsRouter } from '@/server/routers/contests'
import { billingRouter } from '@/server/routers/billing'
import { walletRouter } from '@/server/routers/wallet'
import { accountRouter } from '@/server/routers/account'
import { pushRouter } from '@/server/routers/push'
import { adminDashboardRouter } from '@/server/routers/admin/dashboard'
import { adminUsersRouter } from '@/server/routers/admin/users'
import { adminBetsRouter } from '@/server/routers/admin/bets'
import { adminFinanceRouter } from '@/server/routers/admin/finance'
import { adminConfigRouter } from '@/server/routers/admin/config'
import { adminSupportRouter } from '@/server/routers/admin/support'

export const appRouter = router({
  health: healthRouter,
  lotteries: lotteriesRouter,
  bets: betsRouter,
  contests: contestsRouter,
  billing: billingRouter,
  wallet: walletRouter,
  account: accountRouter,
  push: pushRouter,
  // Backoffice — todo procedure aqui passa por `adminProcedure(minRole)`
  // (server/lib/admin/rbac.ts) e grava auditoria nas mutations.
  admin: router({
    dashboard: adminDashboardRouter,
    users: adminUsersRouter,
    bets: adminBetsRouter,
    finance: adminFinanceRouter,
    config: adminConfigRouter,
    support: adminSupportRouter,
  }),
})

export type AppRouter = typeof appRouter

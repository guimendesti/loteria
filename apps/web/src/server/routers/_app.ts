import { router } from '@/server/trpc'
import { healthRouter } from '@/server/routers/health'
import { lotteriesRouter } from '@/server/routers/lotteries'

export const appRouter = router({
  health: healthRouter,
  lotteries: lotteriesRouter,
})

export type AppRouter = typeof appRouter

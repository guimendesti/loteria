import { publicProcedure, router } from '@/server/trpc'

/** Healthcheck simples — sem tocar DB/Redis (isso é SY-14, `/api/health`, fora do escopo do shell). */
export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true as const,
    time: new Date().toISOString(),
  })),
})

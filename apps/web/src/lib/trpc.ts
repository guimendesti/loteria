'use client'

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@/server/routers/_app'

/** Bindings React (hooks) do tRPC v11 tipados pelo router raiz do servidor. */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Better Auth — client React (browser).
 *
 * `import type` para `./auth`: só o tipo é usado (via `inferAdditionalFields`)
 * para que `signUp.email` etc. conheçam os campos extras (`role`, `isAdult`)
 * sem empacotar código de servidor (Prisma, better-auth/adapters/prisma) no
 * bundle do cliente — padrão recomendado pelo Better Auth.
 */
'use client'

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import type { auth } from './auth'

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  // ⚠️ Nesta versão instalada (better-auth 1.6.25) o endpoint de servidor é
  // `/request-password-reset` (não `/forget-password`, como em versões
  // antigas/docs desatualizadas) — o client deriva o nome do método a partir
  // do path do servidor. Ver client/proxy.ts (toKebabCase do nome da prop).
  requestPasswordReset,
  resetPassword,
} = authClient

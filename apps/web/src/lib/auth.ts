/**
 * Better Auth — instância de servidor.
 *
 * Adapter Prisma apontando para o client singleton de @lotopro/db (mesma
 * conexão usada pelo resto do app — ver packages/db/src/index.ts).
 *
 * ⚠️ Pendência conhecida (fora do escopo desta tarefa, restrita a apps/web/):
 * o schema Prisma (packages/db/prisma/schema.prisma) ainda não tem os models
 * `Session`, `Account` e `Verification` que o Better Auth espera encontrar em
 * runtime. `prismaAdapter` tipa o client como `{}` (estrutural, sem exigir
 * esses models em tempo de compilação — por isso o typecheck passa), mas o
 * fluxo de auth só funciona de fato depois que esses models forem
 * adicionados ao schema. Ver relatório da tarefa.
 *
 * Envs ausentes (sem DATABASE_URL/.env real neste momento) não podem quebrar
 * o typecheck nem o import deste módulo — por isso os fallbacks de string
 * vazia abaixo.
 */
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '@lotopro/db'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || '',
  secret: process.env.BETTER_AUTH_SECRET || '',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  user: {
    additionalFields: {
      // Espelha User.role no Prisma (packages/db/prisma/schema.prisma) — RBAC
      // do backoffice (docs/08 §D.1). Nunca setável pelo próprio usuário no
      // cadastro (`input: false`): só o backoffice/seed muda o role.
      role: {
        type: 'string',
        input: false,
        defaultValue: 'CUSTOMER',
      },
      // AU-01 — declaração obrigatória de maioridade (docs/03 §3.4 D4 e
      // docs/08 AU-01). Espelha User.isAdult no Prisma; enviado pelo próprio
      // formulário de cadastro.
      isAdult: {
        type: 'boolean',
        input: true,
        required: true,
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session

/**
 * Better Auth — instância de servidor.
 *
 * Adapter Prisma apontando para o client singleton de @lotopro/db (mesma
 * conexão usada pelo resto do app — ver packages/db/src/index.ts). Os models
 * `Session`, `Account` e `Verification` que o Better Auth espera já existem
 * em packages/db/prisma/schema.prisma.
 *
 * Envs ausentes (sem DATABASE_URL/.env real neste momento) não podem quebrar
 * o typecheck nem o import deste módulo — por isso os fallbacks de string
 * vazia abaixo.
 */
import { APIError, betterAuth } from 'better-auth'
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
      // Espelha User.tenantId (multi-tenant "platform" único por ora — ver
      // comentário em User no schema). Read-only: nunca setável pelo cliente,
      // só existe para os routers tRPC (apps/web/src/server/routers/bets.ts)
      // lerem `session.user.tenantId` sem precisar de uma query extra ao User
      // a cada mutação.
      tenantId: {
        type: 'string',
        input: false,
      },
      // BO-13 — espelham User.blockedAt/blockedReason (packages/db/prisma/schema.prisma).
      // Read-only (`input: false`): só o backoffice grava, via `admin.users.toggleBlock`
      // (server/routers/admin/users.ts), nunca o próprio usuário. Declarados aqui pelo MESMO
      // motivo de `tenantId` acima: ficam de graça em `session.user` na consulta que o
      // Better Auth já faz para montar a sessão (`getSession`, uma vez por request em
      // `server/trpc.ts`/`createTRPCContext`) — sem isso, `protectedProcedure` precisaria de
      // uma query extra ao `User` em TODA requisição autenticada só para saber se a conta
      // está bloqueada. `type: 'date'` porque `blockedAt` é timestamp, não boolean — a
      // ausência (`null`) já significa "não bloqueado", não precisa de um segundo campo.
      blockedAt: {
        type: 'date',
        input: false,
        required: false,
      },
      blockedReason: {
        type: 'string',
        input: false,
        required: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // P3 — aceite dos termos (docs/03 §3.4, docs/08 AU-01/P3): o formulário
        // de cadastro (`app/(auth)/cadastro/page.tsx`) só habilita o submit com
        // o checkbox de termos marcado, então todo signup que chega aqui já
        // implica aceite — registramos o timestamp no servidor (nunca confiar só
        // em checagem client-side, CLAUDE.md "Convenções").
        before: async (user) => {
          return {
            data: {
              ...user,
              termsAcceptedAt: new Date(),
              // `User.tenantId` é FK OBRIGATÓRIA e o Better Auth não a conhece
              // (o campo é `input: false`, sem default). Sem isto todo cadastro
              // falha com "Argument `tenant` is missing" — o funil inteiro morre.
              // Enquanto houver um único tenant, resolvemos o `platform` aqui.
              // No white-label (Fase 3) isto passa a derivar do host da requisição.
              tenantId: await getPlatformTenantId(),
            },
          }
        },
      },
    },
    session: {
      create: {
        // BO-13 — segunda camada do bloqueio (a primeira é `protectedProcedure`,
        // server/trpc.ts): nega a criação de uma sessão NOVA para uma conta bloqueada.
        // Sem isto, `toggleBlock` revoga as sessões ativas no momento do bloqueio (efeito
        // imediato), mas nada impediria um login (e-mail/senha OU Google) logo em seguida —
        // a sessão recém-criada carregaria `blockedAt` preenchido e a PRIMEIRA chamada a
        // `protectedProcedure` tomaria FORBIDDEN, mas o cookie de sessão já teria sido
        // emitido, uma inconsistência ruim de UX e um resquício de acesso desnecessário.
        // Dispara em TODO `createSession` (login por credencial, login social, e também o
        // signup com `autoSignIn: true`) — nunca em leitura de sessão existente
        // (`getSession` não chama este hook).
        before: async (session) => {
          await rejectBlockedUserSession(prisma, session)
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session

/**
 * Porta mínima de Prisma exigida por `rejectBlockedUserSession` — mesmo padrão de
 * `server/lib/admin/audit.ts` (`AuditPrisma`): só o método realmente usado, para o guard
 * ser testável com um duplo em memória, sem subir Postgres nem o Better Auth de verdade.
 */
export interface BlockGuardPrisma {
  user: {
    findUnique(args: { where: { id: string }; select: { blockedAt: true } }): Promise<{ blockedAt: Date | null } | null>
  }
}

/**
 * Guard de `databaseHooks.session.create.before` (BO-13) — nega a criação de sessão quando
 * `User.blockedAt` está preenchido. Extraído como função nomeada/exportada em vez de ficar
 * inline no `databaseHooks` para ser testável isoladamente (ver `lib/__tests__/auth.test.ts`)
 * sem depender do Better Auth/Postgres reais.
 *
 * Mensagem deliberadamente genérica — não diz "esta conta está bloqueada" nem distingue de
 * credencial inválida: revelar o motivo da recusa no momento do login ajudaria a enumerar
 * quais e-mails têm conta bloqueada (mesma cautela de `signIn` recusar credencial errada com
 * mensagem genérica). O motivo detalhado (`blockedReason`) só existe no backoffice
 * (`admin.users.detail`), nunca na resposta do endpoint de login.
 *
 * Lança `APIError('FORBIDDEN', ...)` em vez de retornar `false`: o retorno booleano do hook
 * (`createWithHooks` em better-auth/dist/db/with-hooks) apenas devolve `null` da criação,
 * sem garantir uma mensagem de erro utilizável para o cliente — lançar é o mecanismo que o
 * próprio Better Auth usa internamente para abortar um endpoint com um corpo de erro
 * controlado.
 */
export async function rejectBlockedUserSession(
  prisma: BlockGuardPrisma,
  session: { userId: string },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { blockedAt: true },
  })
  if (user?.blockedAt) {
    throw new APIError('FORBIDDEN', {
      message: 'Não foi possível concluir o login. Entre em contato com o suporte.',
    })
  }
}

/**
 * Resolve (uma vez por processo) o tenant padrão da plataforma.
 * Memoizado porque é constante e roda em todo cadastro; falha ALTO se o seed
 * não tiver rodado, para o erro apontar a causa real em vez de virar FK violation.
 */
let platformTenantIdPromise: Promise<string> | null = null

function getPlatformTenantId(): Promise<string> {
  if (platformTenantIdPromise === null) {
    platformTenantIdPromise = prisma.tenant
      .findUnique({ where: { slug: 'platform' }, select: { id: true } })
      .then((tenant) => {
        if (!tenant) {
          throw new Error(
            'Tenant "platform" não encontrado — rode o seed (pnpm -F @lotopro/db seed) antes de aceitar cadastros.',
          )
        }
        return tenant.id
      })
      .catch((error: unknown) => {
        platformTenantIdPromise = null // não memoiza falha: a próxima tentativa reconsulta
        throw error
      })
  }
  return platformTenantIdPromise
}

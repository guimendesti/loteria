/**
 * Router `account` — docs/08 §C.8 (CL-100..CL-109): perfil, chave Pix, preferências de
 * notificação, uso vs. limites do plano, exportação de dados e exclusão de conta (LGPD).
 *
 * Assinatura/plano/faturas (CL-104..CL-107) são consumidos do router `billing`, já
 * pronto (`server/routers/billing.ts` — `plans.list`, `subscription.current`,
 * `invoices.list`, `startTrial`, `subscribe`, `changePlan`, `cancel`, `reactivate`).
 * NENHUMA procedure aqui duplica essas regras; a tela `conta/assinatura/page.tsx` chama
 * `trpc.billing.*` diretamente e usa `usage.get` (abaixo) só para as barras de consumo.
 *
 * ── Troca de senha (CL-101) — SEM procedure aqui ──────────────────────────────────────
 * Better Auth expõe `auth.api.changePassword` no servidor, mas esse endpoint reautentica
 * a sessão a partir dos HEADERS/cookie da requisição original (não de um `userId` solto).
 * O contexto tRPC (`server/trpc.ts`, fora do território desta tarefa) só carrega
 * `session` já resolvido — não os headers brutos — então chamar `auth.api.changePassword`
 * daqui exigiria reconstruir manualmente esse cookie (frágil e duplica lógica de auth que
 * já existe no cliente). A tela (`conta/page.tsx`) chama `authClient.changePassword`
 * direto (mesmo padrão já usado por `requestPasswordReset`/`resetPassword` em
 * `lib/auth-client.ts`), documentado ali e no relatório desta tarefa.
 *
 * ── 2FA (CL-101) — pendência de infraestrutura ────────────────────────────────────────
 * Não há plugin `twoFactor` habilitado em `lib/auth.ts` nem coluna de segredo TOTP no
 * schema Prisma — ambos fora do território exclusivo desta tarefa. A tela mostra um
 * aviso "em breve" em vez de simular um recurso que não existe de verdade. Pendência
 * reportada.
 *
 * ── Chave Pix (CL-102) ────────────────────────────────────────────────────────────────
 * `pixKeyEncrypted` é cifrado com AES-256-GCM (`server/lib/crypto.ts`, novo — nenhum
 * helper equivalente existia no monorepo). Nunca retornamos a chave em claro: toda leitura
 * passa por `maskPixKeyValue` antes de sair do servidor.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { PixKeyType, PoolStatus, UserRole, type NotificationPreference } from '@lotopro/db'
import { currentPeriod, hasChannel, UNLIMITED, type Limit } from '@lotopro/core'
import { guardOrThrow, protectedProcedure, router } from '@/server/trpc'
import { decryptSecret, encryptSecret } from '@/server/lib/crypto'

// ─── Perfil (CL-100) ─────────────────────────────────────────────────────────────────

/** `Intl` lança para timezone inválida — mais confiável que manter uma lista estática de IANA TZs. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const profileUpdateInput = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .max(20, 'Telefone muito longo.')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  avatarUrl: z
    .string()
    .trim()
    .max(500, 'URL de avatar muito longa.')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  timezone: z
    .string()
    .trim()
    .min(1, 'Informe o fuso horário.')
    .max(60)
    .refine(isValidTimezone, 'Fuso horário inválido.'),
})

const profileRouter = router({
  /** CL-100 — dados exibidos no formulário (inclui e-mail, só leitura aqui). */
  get: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        timezone: true,
        createdAt: true,
      },
    })
  }),

  /** CL-100 — nome, telefone, avatar (URL — sem pipeline de upload nesta tarefa, ver relatório) e fuso. */
  update: protectedProcedure.input(profileUpdateInput).mutation(async ({ ctx, input }) => {
    return ctx.prisma.user.update({
      where: { id: ctx.session.user.id },
      data: {
        name: input.name,
        phone: input.phone,
        avatarUrl: input.avatarUrl,
        timezone: input.timezone,
      },
      select: { id: true, name: true, phone: true, avatarUrl: true, timezone: true },
    })
  }),
})

// ─── Chave Pix (CL-102) ──────────────────────────────────────────────────────────────

export interface PixKeyDTO {
  configured: boolean
  type: PixKeyType | null
  masked: string | null
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Normaliza e valida por tipo. Lança `TRPCError BAD_REQUEST` com mensagem PT-BR — nunca ecoa o valor bruto. */
function validatePixKeyValue(type: PixKeyType, rawValue: string): string {
  const trimmed = rawValue.trim()
  switch (type) {
    case PixKeyType.CPF: {
      const digits = onlyDigits(trimmed)
      if (digits.length !== 11) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF deve ter 11 dígitos.' })
      }
      return digits
    }
    case PixKeyType.CNPJ: {
      const digits = onlyDigits(trimmed)
      if (digits.length !== 14) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'CNPJ deve ter 14 dígitos.' })
      }
      return digits
    }
    case PixKeyType.EMAIL: {
      const result = z.string().trim().toLowerCase().email().safeParse(trimmed)
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'E-mail de chave Pix inválido.' })
      }
      return result.data
    }
    case PixKeyType.PHONE: {
      const digits = onlyDigits(trimmed)
      if (digits.length < 10 || digits.length > 13) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Telefone de chave Pix inválido.' })
      }
      return digits
    }
    case PixKeyType.RANDOM: {
      // Chave aleatória do BACEN é um UUID (36 caracteres); aceitamos uma faixa um pouco
      // mais larga para não travar em variações de formatação de outros bancos.
      if (trimmed.length < 8 || trimmed.length > 77) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Chave aleatória inválida.' })
      }
      return trimmed
    }
    default: {
      const exhaustive: never = type
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Tipo de chave Pix desconhecido: ${String(exhaustive)}`,
      })
    }
  }
}

/** Mantém só os últimos 4 caracteres visíveis; o resto vira `•`. */
function maskTail(value: string): string {
  const VISIBLE = 4
  if (value.length <= VISIBLE) return '•'.repeat(value.length)
  return `${'•'.repeat(value.length - VISIBLE)}${value.slice(-VISIBLE)}`
}

/** E-mail preserva o domínio (útil pro usuário reconhecer a chave); os demais tipos mascaram tudo menos os últimos 4 caracteres. */
function maskPixKeyValue(type: PixKeyType, value: string): string {
  if (type !== PixKeyType.EMAIL) return maskTail(value)

  const atIndex = value.indexOf('@')
  if (atIndex <= 0) return maskTail(value)

  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex)
  const first = local.charAt(0)
  const last = local.charAt(local.length - 1)
  const maskedLocal = local.length <= 2 ? `${first}•` : `${first}${'•'.repeat(local.length - 2)}${last}`
  return `${maskedLocal}${domain}`
}

const pixKeyRouter = router({
  /** CL-102 — nunca devolve a chave em claro: decifra no servidor só para calcular a máscara. */
  get: protectedProcedure.query(async ({ ctx }): Promise<PixKeyDTO> => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { pixKeyEncrypted: true, pixKeyType: true },
    })
    if (!user.pixKeyEncrypted || !user.pixKeyType) {
      return { configured: false, type: null, masked: null }
    }
    const decrypted = decryptSecret(user.pixKeyEncrypted)
    return { configured: true, type: user.pixKeyType, masked: maskPixKeyValue(user.pixKeyType, decrypted) }
  }),

  /**
   * CL-102 — valida por tipo, cifra com AES-256-GCM e grava. Retorna só a versão mascarada.
   *
   * ⚠️ A forma canônica gravada aqui (telefone como DDD+número, sem `+55`) NÃO é a que o
   * padrão EMV do BR Code exige (E.164). Isso é deliberado e a conversão acontece na
   * leitura, em `server/lib/pix-key.ts#normalizePixKeyForPayload` — que é idempotente e
   * também conserta as linhas gravadas antes dessa distinção existir. Não "unifique" os
   * dois formatos gravando E.164 aqui sem antes migrar as linhas existentes e conferir
   * `maskPixKeyValue`: já houve um bug em que o Pix do bolão falhava em runtime,
   * silenciosamente, para quem tinha cadastrado telefone.
   */
  set: protectedProcedure
    .input(z.object({ type: z.nativeEnum(PixKeyType), value: z.string().trim().min(1).max(140) }))
    .mutation(async ({ ctx, input }): Promise<PixKeyDTO> => {
      const normalized = validatePixKeyValue(input.type, input.value)
      const encrypted = encryptSecret(normalized)
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { pixKeyEncrypted: encrypted, pixKeyType: input.type },
      })
      return { configured: true, type: input.type, masked: maskPixKeyValue(input.type, normalized) }
    }),

  /** Não pedida explicitamente no escopo, mas "gerenciar chave Pix" (CL-102) implica poder removê-la. */
  remove: protectedProcedure.mutation(async ({ ctx }): Promise<PixKeyDTO> => {
    await ctx.prisma.user.update({
      where: { id: ctx.session.user.id },
      data: { pixKeyEncrypted: null, pixKeyType: null },
    })
    return { configured: false, type: null, masked: null }
  }),
})

// ─── Preferências de notificação (CL-103) ───────────────────────────────────────────

export interface NotificationPreferenceDTO {
  emailEnabled: boolean
  pushEnabled: boolean
  whatsappEnabled: boolean
  onlyWhenPrized: boolean
  accumulatedThresholdCents: bigint | null
  cutoffReminder: boolean
  marketingOptIn: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

/** Espelha os `@default` de `NotificationPreference` no schema — devolvido quando o usuário nunca salvou preferências. */
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceDTO = {
  emailEnabled: true,
  pushEnabled: true,
  whatsappEnabled: false,
  onlyWhenPrized: false,
  accumulatedThresholdCents: null,
  cutoffReminder: true,
  marketingOptIn: false,
  quietHoursStart: null,
  quietHoursEnd: null,
}

function toPreferenceDTO(pref: NotificationPreference): NotificationPreferenceDTO {
  return {
    emailEnabled: pref.emailEnabled,
    pushEnabled: pref.pushEnabled,
    whatsappEnabled: pref.whatsappEnabled,
    onlyWhenPrized: pref.onlyWhenPrized,
    accumulatedThresholdCents: pref.accumulatedThresholdCents,
    cutoffReminder: pref.cutoffReminder,
    marketingOptIn: pref.marketingOptIn,
    quietHoursStart: pref.quietHoursStart,
    quietHoursEnd: pref.quietHoursEnd,
  }
}

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.')

const notificationPreferencesInput = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  onlyWhenPrized: z.boolean(),
  accumulatedThresholdCents: z.bigint().nonnegative().nullable(),
  cutoffReminder: z.boolean(),
  marketingOptIn: z.boolean(),
  quietHoursStart: timeOfDaySchema.nullable(),
  quietHoursEnd: timeOfDaySchema.nullable(),
})

const notificationPreferencesRouter = router({
  get: protectedProcedure.query(async ({ ctx }): Promise<NotificationPreferenceDTO> => {
    const pref = await ctx.prisma.notificationPreference.findUnique({
      where: { userId: ctx.session.user.id },
    })
    return pref ? toPreferenceDTO(pref) : DEFAULT_NOTIFICATION_PREFERENCES
  }),

  /**
   * CL-103 — canais, "só quando premiado", horário de silêncio e limiar de acumulado.
   * Push e WhatsApp são reforçados contra o plano no SERVIDOR (nunca confiar só na UI
   * escondendo o toggle) — docs/05 §5.2/§5.4: push é Premium+, WhatsApp é G10 (Pro).
   */
  update: protectedProcedure
    .input(notificationPreferencesInput)
    .mutation(async ({ ctx, input }): Promise<NotificationPreferenceDTO> => {
      const ent = await ctx.getEntitlements()
      if (input.pushEnabled) guardOrThrow(hasChannel(ent, 'push'))
      if (input.whatsappEnabled) guardOrThrow(hasChannel(ent, 'whatsapp'))

      const userId = ctx.session.user.id
      const data = {
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
        whatsappEnabled: input.whatsappEnabled,
        onlyWhenPrized: input.onlyWhenPrized,
        accumulatedThresholdCents: input.accumulatedThresholdCents,
        cutoffReminder: input.cutoffReminder,
        marketingOptIn: input.marketingOptIn,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
      }

      const pref = await ctx.prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      })
      return toPreferenceDTO(pref)
    }),
})

// ─── Uso vs. limites do plano (CL-104) ───────────────────────────────────────────────

function toLimitDTO(limit: Limit): number | null {
  return limit === UNLIMITED ? null : limit
}

const usageRouter = router({
  /**
   * CL-104 — jogos ativos, scans OCR e mensagens de IA do mês corrente (`UsageCounter`)
   * comparados ao teto do plano (`resolveEntitlements`, já memoizado por request em
   * `ctx.getEntitlements`). `pools`/`historyDays`/`maxAutoCheckLotteries` vêm de bônus
   * para a tela de assinatura (CL-105/106/107) não precisar de uma segunda leitura —
   * "ativo" para bolão aqui é "nem CLOSED, nem CANCELED, nem SETTLED" (não há um router
   * de bolões ainda no código-fonte para herdar essa definição; assunção documentada).
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    const period = currentPeriod(now)
    const ent = await ctx.getEntitlements()

    const [activeBets, activePools, ocrCounter, aiCounter] = await Promise.all([
      ctx.prisma.bet.count({ where: { userId, isActive: true, deletedAt: null } }),
      ctx.prisma.pool.count({
        where: {
          ownerId: userId,
          status: { notIn: [PoolStatus.CLOSED, PoolStatus.CANCELED, PoolStatus.SETTLED] },
        },
      }),
      ctx.prisma.usageCounter.findUnique({
        where: { userId_metric_period: { userId, metric: 'ocr_scans', period } },
      }),
      ctx.prisma.usageCounter.findUnique({
        where: { userId_metric_period: { userId, metric: 'ai_messages', period } },
      }),
    ])

    return {
      period,
      activeBets: { used: activeBets, limit: toLimitDTO(ent.maxActiveBets) },
      pools: { used: activePools, limit: toLimitDTO(ent.maxPools) },
      ocrScans: { used: ocrCounter?.used ?? 0, limit: ent.ocrScansPerMonth },
      aiMessages: { used: aiCounter?.used ?? 0, limit: ent.aiMessagesPerMonth },
      historyDays: toLimitDTO(ent.historyDays),
      maxAutoCheckLotteries: toLimitDTO(ent.maxAutoCheckLotteries),
    }
  }),
})

// ─── Exportar meus dados — LGPD (CL-108) ─────────────────────────────────────────────

/**
 * "nunca exponha PII de outros usuários": bolões que o usuário ORGANIZA trazem só os
 * campos financeiros/estruturais dos membros (cotas, valor, status) — nunca nome/telefone
 * de convidado nem o `userId` de outro participante. Bolões em que o usuário é membro
 * trazem só a própria participação, nunca a lista dos demais membros.
 */
const exportDataProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  const userId = ctx.session.user.id

  const [profile, bets, checks, ownedPools, memberships, subscription] = await Promise.all([
    ctx.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        timezone: true,
        avatarUrl: true,
        isAdult: true,
        termsAcceptedAt: true,
        pixKeyType: true,
        createdAt: true,
        lastSeenAt: true,
      },
    }),
    ctx.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        lottery: { select: { slug: true, name: true } },
        poolId: true,
        numbers: true,
        extraPicks: true,
        columns: true,
        matchPicks: true,
        costCents: true,
        contestFrom: true,
        contestTo: true,
        source: true,
        notes: true,
        isActive: true,
        createdAt: true,
      },
    }),
    ctx.prisma.betCheck.findMany({
      where: { bet: { userId } },
      orderBy: { checkedAt: 'desc' },
      select: {
        id: true,
        betId: true,
        hits: true,
        extraHits: true,
        prizeTier: true,
        prizeCents: true,
        checkedAt: true,
        contest: { select: { number: true, drawDate: true } },
      },
    }),
    ctx.prisma.pool.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        lottery: { select: { slug: true, name: true } },
        contestFrom: true,
        contestTo: true,
        totalShares: true,
        shareValueCents: true,
        totalCostCents: true,
        status: true,
        createdAt: true,
        members: { select: { id: true, shares: true, amountCents: true, status: true, joinedAt: true } },
      },
    }),
    ctx.prisma.poolMember.findMany({
      where: { userId, pool: { ownerId: { not: userId } } },
      select: {
        id: true,
        shares: true,
        amountCents: true,
        status: true,
        joinedAt: true,
        pool: { select: { id: true, name: true, status: true } },
      },
    }),
    ctx.prisma.subscription.findUnique({
      where: { userId },
      select: {
        status: true,
        billingCycle: true,
        paymentMethod: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        canceledAt: true,
        plan: { select: { slug: true, name: true } },
        invoices: {
          orderBy: { dueAt: 'desc' },
          select: {
            id: true,
            amountCents: true,
            status: true,
            method: true,
            dueAt: true,
            paidAt: true,
            invoiceUrl: true,
          },
        },
      },
    }),
  ])

  return {
    geradoEm: new Date(),
    perfil: profile,
    apostas: bets,
    conferencias: checks,
    boloes: { organizador: ownedPools, participante: memberships },
    faturas: subscription?.invoices ?? [],
  }
})

// ─── Excluir conta — LGPD (CL-109) ───────────────────────────────────────────────────

/** Exportado para a tela (`conta/privacidade/page.tsx`) e os testes usarem a MESMA frase. */
export const DELETE_ACCOUNT_CONFIRMATION_PHRASE = 'EXCLUIR MINHA CONTA'

/**
 * CL-109 — ANONIMIZA (nunca deleta linhas): e-mail vira `deleted+<id>@lotopro.invalid`
 * (único por construção — `id` é o cuid do usuário), nome vira "Usuário removido",
 * telefone/avatar/chave Pix somem, `deletedAt` é carimbado. `Bet`/`BetCheck`/`Pool`/
 * `PoolMember`/`Invoice` continuam intactos — inclusive a participação deste usuário em
 * bolões de OUTRAS pessoas, que dependem dessa linha para o rateio continuar batendo.
 *
 * "Encerra sessões": apaga todas as linhas de `Session` (todos os dispositivos) e de
 * `Account` (credencial de senha E vínculos OAuth) — sem isso, um login social com o
 * e-mail ORIGINAL do provedor continuaria funcionando mesmo com `User.email` trocado
 * (Better Auth casa OAuth por `Account.providerId+accountId`, não por e-mail).
 *
 * `passwordHash: null` + `role: CUSTOMER` — achado de auditoria (severidade média): a
 * credencial "de verdade" do Better Auth (`Account.password`) já era apagada acima, mas
 * `User.passwordHash` (legado/reserva, ver comentário no schema) e `User.role` ficavam
 * intactos. Uma conta ADMIN "excluída" continuava com `role: ADMIN` gravado para sempre —
 * defesa em profundidade contra qualquer caminho futuro (suporte, restauração, um outro
 * código que confie em `role` sem checar `deletedAt`) que reative acesso de backoffice para
 * uma identidade que deveria ter virado um CUSTOMER anônimo. MESMO padrão de
 * `admin.users.anonymize` (`routers/admin/users.ts`) — nunca reimplementado, só espelhado
 * aqui porque é o titular exercendo o próprio direito (rota diferente, mesma garantia).
 *
 * Cancelamento da assinatura no gateway (Asaas) fica FORA daqui de propósito: chamada
 * de rede externa dentro de `$transaction` é anti-padrão, e `billing.cancel` já existe
 * pronto para isso — a tela (`conta/privacidade/page.tsx`) chama `trpc.billing.cancel`
 * antes de `deleteAccount` quando há assinatura paga ativa. Ver relatório.
 *
 * ── Snapshot de chave Pix em `Pool.ownerPixKeyEnc`/`ownerPixKeyType` — achado de auditoria
 * (severidade média) ──────────────────────────────────────────────────────────────────
 * Quando um bolão é criado, a chave Pix do organizador é copiada para `Pool.ownerPixKeyEnc`/
 * `ownerPixKeyType` (snapshot — o rateio precisa continuar funcionando mesmo que o dono
 * troque a chave depois). Sem limpar esse snapshot aqui, a exclusão de conta era
 * INCOMPLETA: `User.pixKeyEncrypted` zerava, mas os bolões que este usuário organiza
 * continuavam com a chave cifrada intacta em `Pool` — o app seguiria montando um BR Code
 * Pix válido para os demais membros, pagando o titular que acabou de exercer o direito de
 * exclusão (docs/03 §3.5). Mesmo padrão de `admin.users.anonymize`
 * (`routers/admin/users.ts`) — nunca reimplementado, só espelhado aqui.
 */
const deleteAccountProcedure = protectedProcedure
  .input(z.object({ confirmation: z.string() }))
  .mutation(async ({ ctx, input }) => {
    if (input.confirmation.trim().toUpperCase() !== DELETE_ACCOUNT_CONFIRMATION_PHRASE) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Digite "${DELETE_ACCOUNT_CONFIRMATION_PHRASE}" para confirmar a exclusão.`,
      })
    }

    const userId = ctx.session.user.id
    const current = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { deletedAt: true },
    })
    if (current.deletedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Esta conta já foi excluída.' })
    }

    const anonymizedEmail = `deleted+${userId}@lotopro.invalid`
    const deletedAt = new Date()

    await ctx.prisma.$transaction([
      ctx.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          name: 'Usuário removido',
          phone: null,
          avatarUrl: null,
          image: null,
          pixKeyEncrypted: null,
          pixKeyType: null,
          passwordHash: null,
          // Defesa em profundidade: uma identidade anonimizada não deveria reter
          // privilégio de backoffice, mesmo que este ID um dia tenha tido um (mesmo
          // comentário/garantia de `admin.users.anonymize`).
          role: UserRole.CUSTOMER,
          deletedAt,
        },
      }),
      // Revoga o consentimento de marketing (docs/03 §3.5: base legal "consentimento,
      // opt-in separado e revogável") — as demais preferências não são PII por si só.
      ctx.prisma.notificationPreference.updateMany({
        where: { userId },
        data: { marketingOptIn: false },
      }),
      // ★ Achado de auditoria (severidade média, corrigido): limpa o snapshot de chave Pix
      // gravado em CADA bolão que este usuário organiza — sem isso a exclusão de conta é
      // incompleta (ver docblock acima). `updateMany` sem match nenhum (usuário nunca
      // organizou bolão) devolve `count: 0` sem erro.
      ctx.prisma.pool.updateMany({
        where: { ownerId: userId },
        data: { ownerPixKeyEnc: null, ownerPixKeyType: null },
      }),
      ctx.prisma.account.deleteMany({ where: { userId } }),
      ctx.prisma.session.deleteMany({ where: { userId } }),
    ])

    return { deletedAt, anonymizedEmail }
  })

// ─── Router ──────────────────────────────────────────────────────────────────────────

export const accountRouter = router({
  profile: profileRouter,
  pixKey: pixKeyRouter,
  notificationPreferences: notificationPreferencesRouter,
  usage: usageRouter,
  exportData: exportDataProcedure,
  deleteAccount: deleteAccountProcedure,
})

export type AccountRouter = typeof accountRouter

/**
 * Tabela de entitlements por plano — transcrição linha a linha de
 * docs/05-monetizacao-e-planos.md §5.2 ("Detalhamento de limites").
 *
 * Esta tabela é a FONTE DA VERDADE em runtime. O `entitlements` gravado em
 * `plans.entitlements` (Json) pelo seed é lido por `parseEntitlements`, que
 * normaliza o shape do seed para o contrato de docs/06 §6.9.
 */
import { z } from 'zod'
import {
  UNLIMITED,
  type Entitlements,
  type Feature,
  type NotificationChannel,
  type PlanSlug,
} from './types'

// ─── Tabela (docs/05 §5.2) ───────────────────────────────────────────────────

const FREE: Entitlements = {
  maxActiveBets: 20,
  maxAutoCheckLotteries: 2, // "2 (à escolha)"
  historyDays: 90,
  maxPools: 1,
  maxPoolParticipants: 5,
  ocrScansPerMonth: 3,
  aiMessagesPerMonth: 0,
  maxClosureNumbers: 16, // "Até 16 dezenas"
  channels: ['email'],
  // "A4 com marca d'água" NÃO é a feature `export` (que é exportação plena);
  // "Recibo digital de bolão: ❌" no Free.
  features: new Set<Feature>(),
}

const PREMIUM: Entitlements = {
  maxActiveBets: UNLIMITED,
  maxAutoCheckLotteries: UNLIMITED, // "Todas"
  historyDays: UNLIMITED, // "Completo"
  maxPools: 5,
  maxPoolParticipants: 30,
  ocrScansPerMonth: 30,
  aiMessagesPerMonth: 0, // Assistente IA é exclusivo do Pro
  maxClosureNumbers: 20, // "Até 20 dezenas"
  channels: ['email', 'push'],
  features: new Set<Feature>(['export', 'pool_receipt']),
}

const PRO: Entitlements = {
  maxActiveBets: UNLIMITED,
  maxAutoCheckLotteries: UNLIMITED,
  historyDays: UNLIMITED,
  maxPools: UNLIMITED,
  maxPoolParticipants: UNLIMITED,
  /** "Ilimitado (fair use 300/mês)" — o fair use é o teto contabilizável. */
  ocrScansPerMonth: 300,
  aiMessagesPerMonth: 150,
  maxClosureNumbers: UNLIMITED, // "Biblioteca completa + custom"
  channels: ['email', 'push', 'whatsapp'],
  features: new Set<Feature>([
    'backtesting',
    'ai_assistant',
    'api_access',
    'export',
    'pool_receipt',
  ]),
}

/** "todos os recursos Pro para os usuários finais" (docs/05 §5.2, White-label). */
const WHITELABEL: Entitlements = cloneEntitlements(PRO)

export const ENTITLEMENTS: Record<PlanSlug, Entitlements> = {
  free: FREE,
  premium: PREMIUM,
  pro: PRO,
  whitelabel: WHITELABEL,
}

export const PLAN_SLUGS = ['free', 'premium', 'pro', 'whitelabel'] as const

export const planSlugSchema = z.enum(PLAN_SLUGS)

export function isPlanSlug(value: unknown): value is PlanSlug {
  return planSlugSchema.safeParse(value).success
}

/**
 * Entitlements do plano — usar quando o `entitlements` do banco não estiver
 * disponível ou for considerado degradado. Devolve uma CÓPIA: a tabela é
 * compartilhada entre requisições.
 */
export function getEntitlements(slug: PlanSlug): Entitlements {
  return cloneEntitlements(ENTITLEMENTS[slug])
}

function cloneEntitlements(source: Entitlements): Entitlements {
  return {
    ...source,
    channels: [...source.channels],
    features: new Set(source.features),
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const channelSchema = z.enum(['email', 'push', 'whatsapp'])
const featureSchema = z.enum([
  'backtesting',
  'ai_assistant',
  'api_access',
  'export',
  'pool_receipt',
])

const quotaSchema = z.number().int().nonnegative()
const limitSchema = z.union([quotaSchema, z.literal(UNLIMITED)])

/** Shape canônico (docs/06 §6.9), com `features` como array no JSON. */
export const entitlementsSchema = z.object({
  maxActiveBets: limitSchema,
  maxAutoCheckLotteries: limitSchema,
  historyDays: limitSchema,
  maxPools: limitSchema,
  maxPoolParticipants: limitSchema,
  ocrScansPerMonth: quotaSchema,
  aiMessagesPerMonth: quotaSchema,
  maxClosureNumbers: limitSchema,
  channels: z.array(channelSchema),
  features: z.union([z.array(featureSchema), z.set(featureSchema)]),
})

/**
 * Shape gravado hoje por `packages/db/src/seed-data/plans.ts` (`PlanEntitlements`):
 * `null` no lugar de `'unlimited'`, nomes de chave diferentes e features
 * espalhadas em booleanos. Divergência registrada no relatório; o seed não é
 * editado por este módulo.
 */
const seedEntitlementsSchema = z
  .object({
    activeBetsLimit: quotaSchema.nullable(),
    autoCheckLotteries: quotaSchema.nullable(),
    historyDays: quotaSchema.nullable(),
    notifications: z.array(z.enum(['EMAIL', 'PUSH', 'WHATSAPP'])),
    closureMaxPicks: quotaSchema.nullable(),
    exportFormats: z.array(z.string()),
    ocrScansPerMonth: quotaSchema.nullable(),
    ocrFairUsePerMonth: quotaSchema.nullable(),
    poolsActiveLimit: quotaSchema.nullable(),
    poolMembersPerPoolLimit: quotaSchema.nullable(),
    poolDigitalReceipt: z.boolean(),
    backtesting: z.boolean(),
    aiAssistant: z.boolean(),
    aiMessagesPerMonth: quotaSchema,
    personalApi: z.boolean(),
  })
  .passthrough()

/** Sem teto declarado e sem fair use: a cota não restringe nada na prática. */
const NO_QUOTA_CAP = Number.MAX_SAFE_INTEGER

// ─── Parse / serialize ───────────────────────────────────────────────────────

export interface SerializedEntitlements {
  maxActiveBets: number | 'unlimited'
  maxAutoCheckLotteries: number | 'unlimited'
  historyDays: number | 'unlimited'
  maxPools: number | 'unlimited'
  maxPoolParticipants: number | 'unlimited'
  ocrScansPerMonth: number
  aiMessagesPerMonth: number
  maxClosureNumbers: number | 'unlimited'
  channels: NotificationChannel[]
  features: Feature[]
}

/**
 * Valida e normaliza o `entitlements` vindo do banco/seed.
 * Aceita o shape canônico (docs/06 §6.9) e o shape atual do seed.
 * Lança `ZodError` se o JSON não for reconhecível — o chamador decide entre
 * 4xx e fallback para `getEntitlements(slug)`.
 */
export function parseEntitlements(json: unknown): Entitlements {
  if (isRecord(json) && !('maxActiveBets' in json) && 'activeBetsLimit' in json) {
    return fromSeedShape(seedEntitlementsSchema.parse(json))
  }
  const parsed = entitlementsSchema.parse(json)
  return {
    maxActiveBets: parsed.maxActiveBets,
    maxAutoCheckLotteries: parsed.maxAutoCheckLotteries,
    historyDays: parsed.historyDays,
    maxPools: parsed.maxPools,
    maxPoolParticipants: parsed.maxPoolParticipants,
    ocrScansPerMonth: parsed.ocrScansPerMonth,
    aiMessagesPerMonth: parsed.aiMessagesPerMonth,
    maxClosureNumbers: parsed.maxClosureNumbers,
    channels: [...parsed.channels],
    features: new Set(parsed.features),
  }
}

/** `parseEntitlements` sem exceção — para middleware que precisa degradar. */
export function safeParseEntitlements(
  json: unknown,
): { ok: true; value: Entitlements } | { ok: false; error: z.ZodError } {
  try {
    return { ok: true, value: parseEntitlements(json) }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error }
    throw error
  }
}

/** Shape canônico pronto para `JSON.stringify` / coluna `Json` do Prisma. */
export function serializeEntitlements(ent: Entitlements): SerializedEntitlements {
  return {
    maxActiveBets: ent.maxActiveBets,
    maxAutoCheckLotteries: ent.maxAutoCheckLotteries,
    historyDays: ent.historyDays,
    maxPools: ent.maxPools,
    maxPoolParticipants: ent.maxPoolParticipants,
    ocrScansPerMonth: ent.ocrScansPerMonth,
    aiMessagesPerMonth: ent.aiMessagesPerMonth,
    maxClosureNumbers: ent.maxClosureNumbers,
    channels: [...ent.channels],
    // Ordem estável: o JSON gravado não pode variar por ordem de inserção.
    features: [...ent.features].sort(),
  }
}

// ─── Interno ─────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fromSeedShape(seed: z.infer<typeof seedEntitlementsSchema>): Entitlements {
  const features = new Set<Feature>()
  if (seed.backtesting) features.add('backtesting')
  if (seed.aiAssistant) features.add('ai_assistant')
  if (seed.personalApi) features.add('api_access')
  if (seed.poolDigitalReceipt) features.add('pool_receipt')
  // "A4 com marca d'água" (Free) não conta como exportação plena.
  if (seed.exportFormats.some((format) => !format.includes('watermark'))) {
    features.add('export')
  }

  return {
    maxActiveBets: seed.activeBetsLimit ?? UNLIMITED,
    maxAutoCheckLotteries: seed.autoCheckLotteries ?? UNLIMITED,
    historyDays: seed.historyDays ?? UNLIMITED,
    maxPools: seed.poolsActiveLimit ?? UNLIMITED,
    maxPoolParticipants: seed.poolMembersPerPoolLimit ?? UNLIMITED,
    // "Ilimitado (fair use N)" → o fair use é o teto real contabilizável.
    ocrScansPerMonth: seed.ocrScansPerMonth ?? seed.ocrFairUsePerMonth ?? NO_QUOTA_CAP,
    aiMessagesPerMonth: seed.aiMessagesPerMonth,
    maxClosureNumbers: seed.closureMaxPicks ?? UNLIMITED,
    channels: seed.notifications.map(toChannel),
    features,
  }
}

function toChannel(value: 'EMAIL' | 'PUSH' | 'WHATSAPP'): NotificationChannel {
  return value.toLowerCase() as NotificationChannel
}

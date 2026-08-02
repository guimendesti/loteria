/**
 * Os 4 planos (docs/05-monetizacao-e-planos.md §5.2) com `entitlements` derivados linha a linha
 * da tabela "Detalhamento de limites" (Free / Premium / Pro) e da subseção "Plano
 * Lotérica / White-label".
 *
 * `entitlements` ainda não tem um contrato formal em `packages/core` (não existe
 * `packages/core/src/entitlements` nesta revisão do monorepo — o comentário do schema em
 * docs/07 §7.4 já antecipa esse módulo). A forma abaixo é a leitura mais direta da tabela de
 * docs/05 e deve ser o ponto de partida quando esse módulo for criado; os nomes de chave usam
 * `null` para "ilimitado"/"completo" e uma união de literais de string onde a tabela descreve um
 * nível qualitativo (ex.: `statsLevel`).
 */
import type { Prisma } from '@prisma/client'

export interface PlanEntitlements {
  /** Jogos ativos simultâneos. null = ilimitado. */
  activeBetsLimit: number | null
  /** Modalidades com conferência automática. null = todas. */
  autoCheckLotteries: number | null
  /** Histórico de jogos, em dias. null = completo. */
  historyDays: number | null
  notifications: Array<'EMAIL' | 'PUSH' | 'WHATSAPP'>
  accumulatedAlerts: 'email' | 'email_push' | 'custom_rules'
  cutoffReminder: boolean
  statsLevel: 'basic' | 'full' | 'full_comparative'
  generator: 'simple' | 'advanced_filters' | 'unlimited_saved_filters'
  /** Fechamentos: nº máximo de dezenas na cartela-base. null = biblioteca completa + custom. */
  closureMaxPicks: number | null
  exportFormats: string[]
  /** OCR de comprovante por mês. null = ilimitado (fair use). */
  ocrScansPerMonth: number | null
  ocrFairUsePerMonth: number | null
  walletHistory: 'current_month' | 'full' | 'full_comparative_csv'
  /** Bolões ativos simultâneos. null = ilimitado. */
  poolsActiveLimit: number | null
  /** Participantes por bolão. null = ilimitado. */
  poolMembersPerPoolLimit: number | null
  poolDigitalReceipt: boolean
  backtesting: boolean
  aiAssistant: boolean
  aiMessagesPerMonth: number
  personalApi: boolean
  support: 'knowledge_base' | 'email_48h' | 'priority_12h_whatsapp'
  /** Free exibe anúncios/branding do LotoPro; planos pagos não. */
  ads: boolean
  /** Só preenchido no plano whitelabel — ver docs/05 §5.2 "Plano Lotérica / White-label". */
  whitelabel?: {
    customDomain: boolean
    ownBrandingPanel: boolean
    userManagementPanel: boolean
    aggregatedReports: boolean
    contract: 'annual_sla'
    includedUsers: number
  }
}

export interface PlanSeed {
  slug: 'free' | 'premium' | 'pro' | 'whitelabel'
  name: string
  priceMonthlyCents: bigint
  priceYearlyCents: bigint
  entitlements: PlanEntitlements
  isPublic: boolean
  displayOrder: number
}

const freeEntitlements: PlanEntitlements = {
  activeBetsLimit: 20,
  autoCheckLotteries: 2, // à escolha do usuário
  historyDays: 90,
  notifications: ['EMAIL'],
  accumulatedAlerts: 'email',
  cutoffReminder: false,
  statsLevel: 'basic',
  generator: 'simple',
  closureMaxPicks: 16,
  exportFormats: ['a4_watermark'],
  ocrScansPerMonth: 3,
  ocrFairUsePerMonth: null,
  walletHistory: 'current_month',
  poolsActiveLimit: 1,
  poolMembersPerPoolLimit: 5,
  poolDigitalReceipt: false,
  backtesting: false,
  aiAssistant: false,
  aiMessagesPerMonth: 0,
  personalApi: false,
  support: 'knowledge_base',
  ads: true,
}

const premiumEntitlements: PlanEntitlements = {
  activeBetsLimit: null,
  autoCheckLotteries: null,
  historyDays: null,
  notifications: ['EMAIL', 'PUSH'],
  accumulatedAlerts: 'email_push',
  cutoffReminder: true,
  statsLevel: 'full',
  generator: 'advanced_filters',
  closureMaxPicks: 20,
  exportFormats: ['a4', 'pdf', 'csv', 'xlsx'],
  ocrScansPerMonth: 30,
  ocrFairUsePerMonth: null,
  walletHistory: 'full',
  poolsActiveLimit: 5,
  poolMembersPerPoolLimit: 30,
  poolDigitalReceipt: true,
  backtesting: false,
  aiAssistant: false,
  aiMessagesPerMonth: 0,
  personalApi: false,
  support: 'email_48h',
  ads: false,
}

const proEntitlements: PlanEntitlements = {
  activeBetsLimit: null,
  autoCheckLotteries: null,
  historyDays: null,
  notifications: ['EMAIL', 'PUSH', 'WHATSAPP'],
  accumulatedAlerts: 'custom_rules',
  cutoffReminder: true,
  statsLevel: 'full_comparative',
  generator: 'unlimited_saved_filters',
  closureMaxPicks: null, // biblioteca completa + custom
  exportFormats: ['a4', 'pdf', 'csv', 'xlsx', 'batch'],
  ocrScansPerMonth: null, // "ilimitado"
  ocrFairUsePerMonth: 300,
  walletHistory: 'full_comparative_csv',
  poolsActiveLimit: null,
  poolMembersPerPoolLimit: null,
  poolDigitalReceipt: true,
  backtesting: true,
  aiAssistant: true,
  aiMessagesPerMonth: 150,
  personalApi: true,
  support: 'priority_12h_whatsapp',
  ads: false,
}

const whitelabelEntitlements: PlanEntitlements = {
  ...proEntitlements, // "todos os recursos Pro para os usuários finais"
  whitelabel: {
    customDomain: true,
    ownBrandingPanel: true,
    userManagementPanel: true,
    aggregatedReports: true,
    contract: 'annual_sla',
    includedUsers: 200, // faixa inicial — escalonado, ver docs/05 §5.2
  },
}

export const plans: PlanSeed[] = [
  {
    slug: 'free',
    name: 'Apostador',
    priceMonthlyCents: 0n,
    priceYearlyCents: 0n, // sem plano anual
    entitlements: freeEntitlements,
    isPublic: true,
    displayOrder: 1,
  },
  {
    slug: 'premium',
    name: 'Estrategista',
    priceMonthlyCents: 2490n, // R$ 24,90
    priceYearlyCents: 24900n, // R$ 249,00 (17% off — 2 meses grátis)
    entitlements: premiumEntitlements,
    isPublic: true,
    displayOrder: 2,
  },
  {
    slug: 'pro',
    name: 'Bolão Master',
    priceMonthlyCents: 5990n, // R$ 59,90
    priceYearlyCents: 59900n, // R$ 599,00 (17% off)
    entitlements: proEntitlements,
    isPublic: true,
    displayOrder: 3,
  },
  {
    slug: 'whitelabel',
    name: 'White-label',
    // "sob consulta"; valor abaixo é o piso público (a partir de R$ 349/mês, até 200 usuários).
    priceMonthlyCents: 34900n, // R$ 349,00
    priceYearlyCents: 418800n, // R$ 349,00 × 12 — contrato anual com SLA
    entitlements: whitelabelEntitlements,
    isPublic: false, // vendido sob consulta comercial, não self-service
    displayOrder: 4,
  },
]

// Ajuda o seed.ts a satisfazer o tipo `Json` do Prisma sem `any`.
export type PlanEntitlementsJson = Prisma.InputJsonValue

/**
 * Contrato de entitlements (regras de plano).
 *
 * Fonte da verdade:
 * - docs/06-arquitetura-tecnica.md §6.9 — shape de `Entitlements`
 * - docs/05-monetizacao-e-planos.md §5.2 — valores por plano
 * - docs/05-monetizacao-e-planos.md §5.4 — gatilhos de paywall (G1–G10)
 *
 * Este módulo é PURO: não conhece banco, requisição, usuário ou sessão.
 * A verificação acontece no servidor (middleware tRPC) — ver CLAUDE.md.
 */

// ─── Identificadores ─────────────────────────────────────────────────────────

export type PlanSlug = 'free' | 'premium' | 'pro' | 'whitelabel'

/** Sentinela de "sem teto" — mantida como literal para sobreviver ao round-trip JSON. */
export const UNLIMITED = 'unlimited'
export type Unlimited = typeof UNLIMITED

/** Limite numérico ou ausência de teto. */
export type Limit = number | Unlimited

export type NotificationChannel = 'email' | 'push' | 'whatsapp'

export type Feature =
  | 'backtesting'
  | 'ai_assistant'
  | 'api_access'
  | 'export'
  | 'pool_receipt'

// ─── Entitlements ────────────────────────────────────────────────────────────

/**
 * docs/06 §6.9. Duas diferenças conscientes em relação ao rascunho do doc
 * (reportadas ao orquestrador):
 *
 * 1. `maxClosureNumbers` é `Limit`, não `number`: o Pro tem "biblioteca completa
 *    + custom" (docs/05 §5.2), ou seja, sem teto. Um `number` obrigaria a
 *    inventar um valor arbitrário para o Pro.
 * 2. `channels`/`features` são somente-leitura: a tabela `ENTITLEMENTS` é um
 *    singleton compartilhado; mutação acidental vazaria entre requisições.
 *    `readonly T[]` e `ReadonlySet<T>` aceitam `T[]`/`Set<T>` na construção.
 *
 * `ocrScansPerMonth` e `aiMessagesPerMonth` continuam `number` de propósito:
 * são cotas contabilizadas em `usage_counters` e precisam de teto concreto
 * (o "ilimitado" do Pro é, na prática, o fair use de 300/mês — docs/05 §5.2).
 */
export interface Entitlements {
  /** Jogos ativos simultâneos. */
  maxActiveBets: Limit
  /** Modalidades com conferência automática. */
  maxAutoCheckLotteries: Limit
  /** Janela de histórico consultável, em dias. */
  historyDays: Limit
  /** Bolões ativos simultâneos (como organizador). */
  maxPools: Limit
  /** Participantes por bolão. */
  maxPoolParticipants: Limit
  /** Cota mensal de OCR de comprovante. */
  ocrScansPerMonth: number
  /** Cota mensal de mensagens do assistente de IA. */
  aiMessagesPerMonth: number
  /** Máximo de dezenas na cartela-base de um fechamento. */
  maxClosureNumbers: Limit
  /** Canais de notificação habilitados. */
  channels: readonly NotificationChannel[]
  /** Recursos booleanos habilitados. */
  features: ReadonlySet<Feature>
}

// ─── Gatilhos de paywall (docs/05 §5.4) ──────────────────────────────────────

/**
 * | Gate | Gatilho                                        | Upsell            |
 * |------|------------------------------------------------|-------------------|
 * | G1   | 21º jogo ativo                                 | Premium           |
 * | G2   | conferência automática na 3ª modalidade        | Premium           |
 * | G3   | 6º participante no bolão                       | Premium / avulso  |
 * | G4   | 2º bolão                                       | Premium           |
 * | G5   | esgotou os scans OCR do mês                    | Pacote / Premium  |
 * | G6   | fechamento acima do teto de dezenas            | Premium           |
 * | G7   | histórico além da janela do plano              | Premium           |
 * | G8   | backtesting                                    | Pro               |
 * | G9   | 6º bolão ou mais de 30 participantes           | Pro               |
 * | G10  | notificação por WhatsApp                       | Pro               |
 */
export type PaywallGate =
  | 'G1' | 'G2' | 'G3' | 'G4' | 'G5'
  | 'G6' | 'G7' | 'G8' | 'G9' | 'G10'

/**
 * Decisão de um guard. `gate` só existe quando a decisão é negativa E docs/05
 * §5.4 define um gatilho para ela (é a chave do evento no PostHog).
 * `limit`/`current` só aparecem quando são números concretos — em plano sem
 * teto, `limit` é omitido.
 */
export interface GuardResult {
  allowed: boolean
  gate?: PaywallGate
  limit?: number
  current?: number
}

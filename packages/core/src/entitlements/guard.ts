/**
 * Decisões de plano — funções PURAS.
 *
 * Nenhuma delas toca banco, sessão ou relógio global: o chamador (middleware
 * tRPC) traz o `Entitlements` do plano e o número atual (contagem ou consumo do
 * mês). Cada bloqueio devolve o gatilho de docs/05 §5.4, que é a chave do
 * evento de paywall no PostHog (docs/06 §6.9).
 *
 * Convenção de todos os `can*`: o número recebido é o estado ANTES da ação.
 * Free com `maxActiveBets: 20` → 19 jogos permite criar (o 20º); 20 jogos
 * bloqueia (seria o 21º — G1, exatamente como descrito em §5.4).
 */
import {
  UNLIMITED,
  type Entitlements,
  type Feature,
  type GuardResult,
  type Limit,
  type NotificationChannel,
  type PaywallGate,
} from './types'

const MS_PER_DAY = 86_400_000

// ─── Contagens ───────────────────────────────────────────────────────────────

/** G1 — "Tentou cadastrar o 21º jogo ativo". */
export function canCreateBet(ent: Entitlements, currentActiveBets: number): GuardResult {
  return checkCount(ent.maxActiveBets, currentActiveBets, 'G1')
}

/** G2 — "Tentou ativar conferência na 3ª modalidade". */
export function canEnableAutoCheck(ent: Entitlements, currentLotteries: number): GuardResult {
  return checkCount(ent.maxAutoCheckLotteries, currentLotteries, 'G2')
}

/**
 * G4 — "Criou o 2º bolão" (Free, teto 1 → Premium).
 * G9 — "Criou o 6º bolão" (Premium, teto 5 → Pro).
 */
export function canCreatePool(ent: Entitlements, currentPools: number): GuardResult {
  return checkCount(ent.maxPools, currentPools, poolGate(ent.maxPools))
}

/**
 * G3 — "Convidou o 6º participante" (Free, teto 5 → Premium ou Bolão avulso).
 * G9 — "Passou de 30 participantes" (Premium, teto 30 → Pro).
 *
 * `current` é o número de participantes já no bolão, incluindo o organizador.
 */
export function canAddPoolParticipant(ent: Entitlements, current: number): GuardResult {
  return checkCount(ent.maxPoolParticipants, current, participantGate(ent.maxPoolParticipants))
}

// ─── Cotas mensais (usage_counters) ──────────────────────────────────────────

/** G5 — "Esgotou os scans OCR do mês". */
export function canUseOcr(ent: Entitlements, usedThisMonth: number): GuardResult {
  return checkQuota(ent.ocrScansPerMonth, usedThisMonth, 'G5')
}

/**
 * Assistente de IA: 150 mensagens/mês no Pro, 0 nos demais (docs/05 §5.2).
 * docs/05 §5.4 NÃO define gatilho para IA — o bloqueio volta sem `gate`.
 * (Pendência reportada: criar um G11 no doc, tanto para "plano sem IA" quanto
 * para "cota esgotada", que têm upsells diferentes — Pro vs. add-on §5.3.)
 */
export function canUseAi(ent: Entitlements, usedThisMonth: number): GuardResult {
  return checkQuota(ent.aiMessagesPerMonth, usedThisMonth, undefined)
}

// ─── Fechamentos ─────────────────────────────────────────────────────────────

/**
 * Teto de dezenas na cartela-base do fechamento: 16 (Free), 20 (Premium),
 * sem teto no Pro ("biblioteca completa + custom").
 */
export function maxClosureAllowed(ent: Entitlements): Limit {
  return ent.maxClosureNumbers
}

/** G6 — "Tentou fechamento acima de 16 dezenas". */
export function canUseClosure(ent: Entitlements, requestedNumbers: number): GuardResult {
  const limit = ent.maxClosureNumbers
  if (limit === UNLIMITED) return { allowed: true, current: requestedNumbers }
  if (requestedNumbers <= limit) return { allowed: true, limit, current: requestedNumbers }
  return { allowed: false, gate: 'G6', limit, current: requestedNumbers }
}

// ─── Features e canais ───────────────────────────────────────────────────────

/** Gatilhos de §5.4 associados a features. As demais não têm gate no doc. */
const FEATURE_GATES: Partial<Record<Feature, PaywallGate>> = {
  backtesting: 'G8',
}

/** G8 quando a feature negada é `backtesting`. */
export function hasFeature(ent: Entitlements, feature: Feature): GuardResult {
  if (ent.features.has(feature)) return { allowed: true }
  const gate = FEATURE_GATES[feature]
  return gate === undefined ? { allowed: false } : { allowed: false, gate }
}

/** Gatilhos de §5.4 associados a canais. E-mail e push não têm gate. */
const CHANNEL_GATES: Partial<Record<NotificationChannel, PaywallGate>> = {
  whatsapp: 'G10',
}

/** G10 quando o canal negado é WhatsApp. */
export function hasChannel(ent: Entitlements, channel: NotificationChannel): GuardResult {
  if (ent.channels.includes(channel)) return { allowed: true }
  const gate = CHANNEL_GATES[channel]
  return gate === undefined ? { allowed: false } : { allowed: false, gate }
}

// ─── Histórico ───────────────────────────────────────────────────────────────

/**
 * Data mais antiga visível no plano; `null` quando o histórico é completo.
 * Free = `now - 90 dias`. Downgrade NUNCA deleta: o excedente é ocultado
 * (docs/05 §5.4, regras de UX).
 */
export function historyCutoff(ent: Entitlements, now: Date): Date | null {
  const days = ent.historyDays
  if (days === UNLIMITED) return null
  return new Date(now.getTime() - days * MS_PER_DAY)
}

/**
 * G7 — "Consultou histórico com mais de 90 dias".
 * `from` é a data mais antiga que a consulta quer alcançar.
 */
export function canQueryHistory(ent: Entitlements, from: Date, now: Date): GuardResult {
  const cutoff = historyCutoff(ent, now)
  const requestedDays = Math.max(0, Math.ceil((now.getTime() - from.getTime()) / MS_PER_DAY))
  if (cutoff === null) return { allowed: true, current: requestedDays }
  const limit = ent.historyDays === UNLIMITED ? requestedDays : ent.historyDays
  if (from.getTime() >= cutoff.getTime()) {
    return { allowed: true, limit, current: requestedDays }
  }
  return { allowed: false, gate: 'G7', limit, current: requestedDays }
}

// ─── Auxiliares ──────────────────────────────────────────────────────────────

/**
 * Quanto ainda cabe antes do bloqueio; `null` quando não há teto.
 * Serve à regra de UX de §5.4 ("este é seu último jogo no plano gratuito"):
 * `remaining(canCreateBet(ent, n)) === 1`.
 */
export function remaining(result: GuardResult): number | null {
  if (result.limit === undefined || result.current === undefined) return null
  return Math.max(0, result.limit - result.current)
}

// ─── Interno ─────────────────────────────────────────────────────────────────

/** Ação que CRIA mais um item: permitida enquanto `current < limit`. */
function checkCount(limit: Limit, current: number, gate: PaywallGate): GuardResult {
  if (limit === UNLIMITED) return { allowed: true, current }
  if (current < limit) return { allowed: true, limit, current }
  return { allowed: false, gate, limit, current }
}

/** Cota mensal: permitida enquanto `used < limit`. Cota 0 bloqueia sempre. */
function checkQuota(limit: number, used: number, gate: PaywallGate | undefined): GuardResult {
  if (used < limit) return { allowed: true, limit, current: used }
  return gate === undefined
    ? { allowed: false, limit, current: used }
    : { allowed: false, gate, limit, current: used }
}

/** §5.4: teto 1 é o Free (G4 → Premium); qualquer outro teto é o Premium (G9 → Pro). */
function poolGate(limit: Limit): PaywallGate {
  return limit !== UNLIMITED && limit <= 1 ? 'G4' : 'G9'
}

/** §5.4: teto 5 é o Free (G3 → Premium); teto 30 é o Premium (G9 → Pro). */
function participantGate(limit: Limit): PaywallGate {
  return limit !== UNLIMITED && limit <= 5 ? 'G3' : 'G9'
}

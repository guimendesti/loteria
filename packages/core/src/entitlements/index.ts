/**
 * Entitlements — regras de plano (docs/05 §5.2 e §5.4, docs/06 §6.9).
 *
 * Uso típico no middleware tRPC:
 * ```ts
 * const ent = parseEntitlements(plan.entitlements)
 * const decision = canCreateBet(ent, activeBetsCount)
 * if (!decision.allowed) throw paywall(decision) // decision.gate === 'G1'
 * ```
 */
export * from './types'
export * from './plans'
export * from './guard'
export * from './usage'

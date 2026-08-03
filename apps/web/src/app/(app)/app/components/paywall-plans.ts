/**
 * Preços exibidos no `PaywallDialog` (docs/05 §5.2 — "Mensal").
 *
 * TODO: substituir por `trpc.billing.plans` assim que esse router (de outro
 * agente, em paralelo) estiver registrado em `server/routers/_app.ts`. Até lá,
 * este objeto estático evita acoplar o paywall a um router que ainda não existe.
 */
export interface PaywallPlanPrice {
  name: string
  monthlyLabel: string
}

export const PAYWALL_PLAN_PRICES = {
  premium: { name: 'Premium', monthlyLabel: 'R$ 24,90/mês' },
  pro: { name: 'Pro', monthlyLabel: 'R$ 59,90/mês' },
} as const satisfies Record<'premium' | 'pro', PaywallPlanPrice>

export type PaywallPlanSlug = keyof typeof PAYWALL_PLAN_PRICES

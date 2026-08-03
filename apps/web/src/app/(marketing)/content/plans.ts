/**
 * LP-02 — Dados dos planos públicos, transcritos linha a linha de
 * docs/05-monetizacao-e-planos.md §5.2 ("Detalhamento de limites").
 *
 * TODO(billing): quando o router `billing.plans` existir (Onda 5, em andamento em paralelo —
 * ver ORQUESTRACAO.md), trocar este array estático por dados vindos do servidor
 * (`trpc.billing.plans.list` ou equivalente lido direto do banco via `@lotopro/db` num
 * Server Component, como já é feito em `resultados/[modalidade]`). Até lá, esta é a fonte
 * da verdade da página `/planos` — mantenha em sincronia com `packages/db/src/seed-data/plans.ts`
 * (que é a fonte da verdade do banco) e com `packages/core/src/entitlements/plans.ts` (a fonte
 * da verdade em runtime) se algum valor mudar.
 *
 * Valores em CENTAVOS (`number`, não `bigint`): esta é copy estática de marketing, não um
 * cálculo de domínio que precise de precisão arbitrária (CLAUDE.md §5 é sobre o dinheiro que
 * circula no domínio — apostas, rateio de bolão — não sobre a tabela de preço público exibida
 * aqui). Todos os valores cabem longe de `Number.MAX_SAFE_INTEGER`.
 */

export type PlanId = 'free' | 'premium' | 'pro'

export interface PlanRow {
  /** Rótulo da linha na tabela comparativa. */
  label: string
  values: Record<PlanId, string>
}

export interface PlanDefinition {
  id: PlanId
  /** Nome comercial (docs/05 §5.2). */
  commercialName: string
  /** Nome do nível (Free / Premium / Pro), usado como selo. */
  tier: string
  priceMonthlyCents: number
  /** null = sem plano anual (Free). */
  priceYearlyCents: number | null
  /** Persona-alvo (docs/05 §5.2), para reforçar "para quem é". */
  personaHint: string
  highlights: string[]
  ctaLabel: string
  featured?: boolean
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    commercialName: 'Apostador',
    tier: 'Free',
    priceMonthlyCents: 0,
    priceYearlyCents: null,
    personaHint: 'Para quem joga sem complicação',
    highlights: [
      '20 jogos ativos simultâneos',
      'Conferência automática em 2 modalidades',
      '1 bolão com até 5 participantes',
    ],
    ctaLabel: 'Começar grátis',
  },
  {
    id: 'premium',
    commercialName: 'Estrategista',
    tier: 'Premium',
    priceMonthlyCents: 2490,
    priceYearlyCents: 24900,
    personaHint: 'Para quem joga toda semana e não quer perder nada',
    highlights: [
      'Jogos e histórico ilimitados',
      'Conferência automática em todas as modalidades, com push',
      '5 bolões, até 30 participantes cada',
    ],
    ctaLabel: 'Assinar Premium',
    featured: true,
  },
  {
    id: 'pro',
    commercialName: 'Bolão Master',
    tier: 'Pro',
    priceMonthlyCents: 5990,
    priceYearlyCents: 59900,
    personaHint: 'Para quem organiza bolão e leva estatística a sério',
    highlights: [
      'Bolões e participantes ilimitados',
      'Backtesting histórico e assistente de análise com IA',
      'Notificação por WhatsApp e suporte prioritário',
    ],
    ctaLabel: 'Assinar Pro',
  },
]

/** Economia do plano anual vs. 12× o mensal (docs/05 §5.2: "17% (2 meses grátis)"). */
export const ANNUAL_DISCOUNT_LABEL = '17% de desconto (2 meses grátis)'

/** Tabela comparativa completa — docs/05 §5.2, "Detalhamento de limites". */
export const PLAN_COMPARISON_ROWS: PlanRow[] = [
  {
    label: 'Jogos ativos simultâneos',
    values: { free: '20', premium: 'Ilimitado', pro: 'Ilimitado' },
  },
  {
    label: 'Modalidades com conferência automática',
    values: { free: '2 (à escolha)', premium: 'Todas', pro: 'Todas' },
  },
  {
    label: 'Histórico de jogos',
    values: { free: '90 dias', premium: 'Completo', pro: 'Completo' },
  },
  {
    label: 'Notificações',
    values: { free: 'E-mail', premium: 'E-mail + Push', pro: 'E-mail + Push + WhatsApp' },
  },
  {
    label: 'Alertas de acumulado',
    values: { free: 'E-mail', premium: 'E-mail + push', pro: 'Regras customizadas' },
  },
  {
    label: 'Alerta de fechamento de apostas',
    values: { free: '—', premium: 'Sim', pro: 'Sim' },
  },
  {
    label: 'Estatísticas',
    values: { free: 'Básicas (frequência, atraso)', premium: 'Completas + gráficos + ciclos', pro: 'Completas + comparativos' },
  },
  {
    label: 'Gerador de jogos',
    values: { free: 'Aleatório simples', premium: '+ filtros avançados', pro: '+ filtros salvos ilimitados' },
  },
  {
    label: 'Fechamentos',
    values: { free: 'Até 16 dezenas', premium: 'Até 20 dezenas', pro: 'Biblioteca completa + custom' },
  },
  {
    label: 'Impressão / exportação',
    values: { free: 'A4 com marca d’água', premium: 'Todos os formatos', pro: '+ exportação em lote' },
  },
  {
    label: 'OCR de comprovante',
    values: { free: '3/mês', premium: '30/mês', pro: 'Ilimitado (fair use 300/mês)' },
  },
  {
    label: 'Carteira / ROI',
    values: { free: 'Mês corrente', premium: 'Histórico completo + gráficos', pro: '+ comparativo entre estratégias + CSV' },
  },
  {
    label: 'Bolões ativos',
    values: { free: '1', premium: '5', pro: 'Ilimitado' },
  },
  {
    label: 'Participantes por bolão',
    values: { free: '5', premium: '30', pro: 'Ilimitado' },
  },
  {
    label: 'Recibo digital de bolão',
    values: { free: '—', premium: 'Sim', pro: 'Sim' },
  },
  {
    label: 'Backtesting histórico',
    values: { free: '—', premium: '—', pro: 'Sim' },
  },
  {
    label: 'Assistente de análise com IA',
    values: { free: '—', premium: '—', pro: '150 mensagens/mês' },
  },
  {
    label: 'API pessoal',
    values: { free: '—', premium: '—', pro: 'Sim' },
  },
  {
    label: 'Suporte',
    values: { free: 'Base de conhecimento', premium: 'E-mail (48h)', pro: 'Prioritário (12h) + WhatsApp' },
  },
  {
    label: 'Anúncios/branding próprio',
    values: { free: 'Sim', premium: 'Não', pro: 'Não' },
  },
]

/** docs/05 §5.5 — incentivo do Pix Automático. */
export const PIX_AUTOMATIC_DISCOUNT_LABEL = '5% de desconto adicional para quem assina com Pix Automático.'

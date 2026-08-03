/**
 * Contratos do billing (docs/05 §5.2/§5.4/§5.5, docs/07 §7.4, docs/08 CL-104..CL-107).
 *
 * ⛔ REGRA INVIOLÁVEL (CLAUDE.md §2 e §1): o valor de uma assinatura é função APENAS de
 * (plano × ciclo × meio de pagamento). Nada aqui — nem em `service.ts`, `webhook.ts` ou
 * `billing-dunning.ts` — pode ler aposta, bolão ou prêmio para compor preço. Receita é
 * assinatura de software; a plataforma não toca em dinheiro de aposta (zero custódia).
 *
 * ── Por que uma porta local em vez de importar `AsaasClient` ───────────────────────────
 *
 * `apps/web/package.json` NÃO declara `@lotopro/integrations` (só core/db/ui) e
 * `next.config.mjs` não o lista em `transpilePackages`. Enquanto o orquestrador não fizer
 * essa costura, nenhum import do pacote resolve a partir de `apps/web`. A porta abaixo
 * espelha o contrato público de `packages/integrations/src/asaas` campo a campo, com
 * assinaturas DELIBERADAMENTE permissivas (retornos `unknown` onde o contrato não fixa a
 * forma, campos opcionais/anuláveis onde o cliente real pode ser mais restrito), de modo
 * que a classe `AsaasClient` real seja estruturalmente atribuível a `BillingGateway` sem
 * nenhum adapter. Ver `gateway.ts` (composition root) e o relatório de wiring.
 */

/** `billingType` do Asaas. Mapeado de/para `PaymentMethod` do Prisma em `service.ts`. */
export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO'

/** `cycle` do Asaas. Mapeado de/para `BillingCycle` do Prisma em `service.ts`. */
export type AsaasCycle = 'MONTHLY' | 'YEARLY'

/**
 * Pagamento do Asaas normalizado pelo cliente de `@lotopro/integrations` (valor já em
 * centavos inteiros — CLAUDE.md §5, nunca `float` no nosso lado).
 *
 * Campos anuláveis/opcionais porque um pagamento avulso não tem `subscription`, um
 * pagamento não liquidado não tem `paymentDate`, etc. — e porque um tipo mais frouxo aqui
 * aceita qualquer refinamento que o cliente real faça.
 */
export interface AsaasPaymentLike {
  id: string
  subscription?: string | null
  customer?: string | null
  /** 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | ... */
  status: string
  valueCents: bigint
  /** 'YYYY-MM-DD' */
  dueDate: string
  /** 'YYYY-MM-DD' — presente só quando liquidado. */
  paymentDate?: string | null
  billingType?: string | null
  invoiceUrl?: string | null
  externalReference?: string | null
}

export interface CreateCustomerInput {
  name: string
  email: string
  cpfCnpj?: string
  externalReference?: string
}

export interface CreateSubscriptionInput {
  customerId: string
  billingType: AsaasBillingType
  valueCents: bigint
  /** 'YYYY-MM-DD' — data da PRIMEIRA cobrança. */
  nextDueDate: string
  cycle: AsaasCycle
  description?: string
  externalReference: string
}

export interface UpdateSubscriptionInput {
  valueCents?: bigint
  billingType?: AsaasBillingType
}

export interface GatewaySubscriptionResult {
  id: string
  /** 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | ... — ver `mapGatewaySubscriptionStatus`. */
  status: string
}

/**
 * Porta do gateway de pagamento. Métodos em sintaxe de método (não campo-função) de
 * propósito: TypeScript checa parâmetros de método de forma bivariante, o que torna a
 * `AsaasClient` real atribuível mesmo se refinar tipos de entrada.
 */
export interface BillingGateway {
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>
  createSubscription(input: CreateSubscriptionInput): Promise<GatewaySubscriptionResult>
  updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<unknown>
  cancelSubscription(id: string): Promise<{ deleted: boolean }>
  getSubscription(id: string): Promise<unknown>
  getPayment(id: string): Promise<AsaasPaymentLike>
  listPaymentsBySubscription(id: string): Promise<AsaasPaymentLike[]>
}

/**
 * Erro de domínio do billing. O serviço é framework-free (não conhece tRPC); o router
 * traduz `code` para `TRPCError` em `routers/billing.ts` (`billingErrorToTRPC`).
 */
export type BillingErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'GATEWAY_ERROR'

export class BillingError extends Error {
  readonly code: BillingErrorCode

  constructor(code: BillingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BillingError'
    this.code = code
  }
}

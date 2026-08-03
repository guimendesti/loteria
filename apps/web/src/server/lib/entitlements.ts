/**
 * Entitlements do usuário — ponte entre o banco (`Subscription`/`Plan`) e o
 * módulo puro `@lotopro/core` (`packages/core/src/entitlements`, docs/06 §6.9).
 *
 * `resolveEntitlements` é a única função deste arquivo que toca o Prisma; o
 * resto (`applyHistoryCutoff`, `incrementUsage`) são helpers finos em cima do
 * core, extraídos aqui para serem reaproveitados pelos routers (`bets.ts`) e
 * testados sem precisar montar um contexto tRPC completo.
 */
import {
  getEntitlements as getStaticEntitlements,
  historyCutoff,
  isPlanSlug,
  isUsageMetric,
  parseEntitlements,
  currentPeriod,
  type Entitlements,
  type PlanSlug,
  type UsageMetric,
} from '@lotopro/core'
import { SubStatus, type PrismaClient } from '@lotopro/db'

const ACTIVE_STATUSES: SubStatus[] = [SubStatus.ACTIVE, SubStatus.TRIALING]

/**
 * Resolve os entitlements vigentes do usuário:
 * - Sem `Subscription` ACTIVE/TRIALING (nunca assinou, cancelou, expirou, em
 *   atraso) → plano Free (tabela estática de `@lotopro/core`). Isso também
 *   cobre downgrade: docs/05 §5.4 é explícito que downgrade nunca apaga
 *   dados, só bloqueia criação de novos/oculta o excedente — a fonte da
 *   verdade dos LIMITES é sempre "qual plano vale agora", nunca o que o
 *   usuário teve no passado.
 * - Com assinatura ativa → `Plan.entitlements` (Json), normalizado por
 *   `parseEntitlements`. Se o JSON gravado no banco não for reconhecível
 *   (ZodError), cai para a tabela estática do `slug` do plano — nunca deixa
 *   um plano pago quebrado bloquear o usuário sem aviso — e loga o erro para
 *   investigação (dado de produção inconsistente merece alarme).
 */
export async function resolveEntitlements(prisma: PrismaClient, userId: string): Promise<Entitlements> {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    include: { plan: true },
  })

  if (!subscription) return getStaticEntitlements('free')

  const fallbackSlug: PlanSlug = isPlanSlug(subscription.plan.slug) ? subscription.plan.slug : 'free'

  try {
    return parseEntitlements(subscription.plan.entitlements)
  } catch (error) {
    console.error(
      `[entitlements] Plan "${subscription.plan.slug}" (id=${subscription.plan.id}) tem ` +
        'entitlements inválidos em banco; usando fallback estático do slug.',
      error,
    )
    return getStaticEntitlements(fallbackSlug)
  }
}

// ─── Histórico (G7) ────────────────────────────────────────────────────────

export interface HistoryCutoffFilter {
  /** `undefined` quando o plano tem histórico completo (nada a filtrar). */
  createdAt?: { gte: Date }
  /** `true` quando o plano do usuário tem corte de histórico — liga o upsell G7 na UI. */
  historyLimited: boolean
}

/**
 * G7 (docs/05 §5.4) — recorte de `where.createdAt` para listagens de jogos.
 * Puro (sem Prisma): devolve o fragmento de `Prisma.BetWhereInput` a mesclar
 * no `where` de `bets.list`, mais a flag `historyLimited` que o router repassa
 * na resposta para a UI mostrar o banner de upsell (docs/09 C6). Extraído do
 * router para ser testável sem montar um contexto tRPC/Prisma real.
 */
export function applyHistoryCutoff(ent: Entitlements, now: Date): HistoryCutoffFilter {
  const cutoff = historyCutoff(ent, now)
  if (cutoff === null) return { historyLimited: false }
  return { createdAt: { gte: cutoff }, historyLimited: true }
}

// ─── Usage counters (docs/07 §7.4) ──────────────────────────────────────────

/**
 * Incremento atômico de `UsageCounter` (chave única `[userId, metric, period]`,
 * período mensal em America/Sao_Paulo — ver `packages/core/src/entitlements/usage.ts`).
 * Devolve o consumo já atualizado.
 *
 * ⚠️ Sem consumidor real ainda (OCR/assistente de IA são features futuras) —
 * a ordem correta quando existirem é: ler o consumo → `canUseOcr`/`canUseAi`
 * → executar a ação → só então incrementar (nunca antes de saber que a ação
 * vai acontecer, e nunca em duas queries separadas — o `upsert` abaixo é a
 * escrita atômica).
 */
export async function incrementUsage(
  prisma: PrismaClient,
  userId: string,
  metric: UsageMetric,
  now: Date,
): Promise<number> {
  if (!isUsageMetric(metric)) {
    throw new RangeError(`incrementUsage: métrica de uso desconhecida "${metric}".`)
  }

  const period = currentPeriod(now)
  const counter = await prisma.usageCounter.upsert({
    where: { userId_metric_period: { userId, metric, period } },
    create: { userId, metric, period, used: 1 },
    update: { used: { increment: 1 } },
  })
  return counter.used
}

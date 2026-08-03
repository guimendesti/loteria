/**
 * SY-13 — `POST /api/webhooks/asaas`.
 *
 * Casca HTTP: extrai token e corpo, delega TODA a decisão para
 * `server/lib/billing/webhook.ts` (testado sem rede) e devolve o status. Nada de regra
 * de negócio aqui.
 *
 * Autenticação: token estático no header `asaas-access-token`, configurado no painel do
 * Asaas e em `ASAAS_WEBHOOK_TOKEN`. Sem a env, o handler falha FECHADO (todo request vira
 * 401) — um deploy sem a variável não abre o endpoint.
 *
 * Processamento é SÍNCRONO nesta fase: os efeitos são poucos UPDATEs indexados
 * (`Invoice.gatewayInvoiceId` unique, `Subscription.gatewaySubscriptionId`). Se o volume
 * crescer ou o handler ganhar trabalho pesado (e-mail, PDF), o caminho natural é gravar
 * `WebhookEvent` e enfileirar o processamento — a idempotência por `(provider,
 * externalId)` já está pronta para isso.
 */
import { prisma } from '@lotopro/db'
import {
  ASAAS_TOKEN_HEADER,
  createAsaasWebhookHandler,
} from '@/server/lib/billing/webhook'
import { createWebhookPrismaAdapter } from '@/server/lib/billing/prisma-adapter'

// Prisma exige runtime Node (não Edge).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { outcome: 'invalid', message: 'Corpo do webhook não é JSON válido.' },
      { status: 400 },
    )
  }

  const handle = createAsaasWebhookHandler({
    prisma: createWebhookPrismaAdapter(prisma),
    expectedToken: process.env['ASAAS_WEBHOOK_TOKEN'] ?? '',
    logger: {
      warn: (message, meta) => {
        console.warn(message, meta ?? {})
      },
    },
  })

  const result = await handle({
    token: request.headers.get(ASAAS_TOKEN_HEADER) ?? request.headers.get('access_token'),
    body,
  })

  return Response.json(
    { outcome: result.outcome, message: result.message },
    { status: result.httpStatus },
  )
}

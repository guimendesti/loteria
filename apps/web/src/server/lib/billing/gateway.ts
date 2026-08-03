/**
 * COMPOSITION ROOT do gateway de pagamento — o ÚNICO arquivo de `apps/web` que conhece a
 * existência do cliente Asaas concreto. Todo o resto do billing depende só da porta
 * `BillingGateway` (`types.ts`), e por isso é testável sem rede e sem o pacote.
 *
 * WIRING CONCLUÍDO (S3, orquestrador): `@lotopro/integrations` é dependência do app,
 * está em `transpilePackages`, e o import é estático. Só as mutations que chamam
 * `getBillingGateway()` exigem ASAAS_API_KEY no ambiente.
 */
import { AsaasClient } from '@lotopro/integrations'
import { BillingError, type BillingGateway } from './types'

/**
 * Assinatura assumida do construtor (o contrato público do cliente descreve os métodos,
 * não a construção). Se o pacote expuser uma factory em vez de classe, este é o único
 * ponto a ajustar.
 */
let cached: Promise<BillingGateway> | null = null

async function createGateway(): Promise<BillingGateway> {
  const apiKey = process.env['ASAAS_API_KEY']
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new BillingError(
      'GATEWAY_ERROR',
      'Pagamentos indisponíveis: ASAAS_API_KEY não está configurada no ambiente.',
    )
  }

  return new AsaasClient({ apiKey })
}

/**
 * Instância única do gateway (memoizada). Falha em cache NÃO é memoizada: se a chave for
 * corrigida no ambiente, a próxima chamada tenta de novo em vez de repetir o erro.
 */
export function getBillingGateway(): Promise<BillingGateway> {
  if (cached === null) {
    cached = createGateway().catch((error: unknown) => {
      cached = null
      throw error
    })
  }
  return cached
}

/** Só para teste: descarta a instância memoizada. */
export function resetBillingGatewayCache(): void {
  cached = null
}

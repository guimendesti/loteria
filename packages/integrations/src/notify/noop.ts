/**
 * SY-04 — canal de push (Web Push / VAPID): implementação NULA.
 *
 * DECISÃO (pedida no escopo): implementar Web Push do zero, sem a lib `web-push`, é
 * inviável neste território — o protocolo exige (RFC 8291/8292): assinatura JWT ES256 com
 * a chave privada VAPID, criptografia do payload em `aes128gcm` derivada de ECDH com a
 * `p256dh`/`auth` da subscription, e o header `Crypto-Key`/`Authorization` correspondente.
 * Reimplementar isso à mão é reinventar uma lib inteira de criptografia — não vale o risco
 * de um bug de segurança sutil por economizar uma dependência.
 *
 * O que fica pronto aqui é o DESIGN: a interface `PushSender` (packages/integrations/src/notify/types.ts)
 * é o contrato estável que `apps/worker/src/jobs/notify.ts` consome via injeção de
 * dependência. Quando `web-push` for instalada pelo orquestrador, uma `WebPushSender`
 * real implementa a mesma interface e substitui `NoopPushSender` em
 * `apps/worker/src/index.ts` — nada em `jobs/notify.ts` muda.
 *
 * DECISÃO DE STATUS (pedida no escopo — `Notification.status` não tem um valor tipo
 * "SENT_SKIPPED"): `jobs/notify.ts` grava `FAILED` (não `QUEUED`) quando este sender é
 * quem atende. Motivo: `QUEUED` sugere "vai ser processado depois", mas não existe nenhum
 * worker/cron que volte a este registro — deixá-lo `QUEUED` para sempre é enganoso para
 * quem olha o histórico de notificações de um usuário (docs/08 BO-51, "para depurar 'não
 * recebi'"). `FAILED` com `error` explícito é honesto e continua fora do caminho da
 * idempotência (a `dedupeKey` do job cobre o retry do BullMQ, não uma tentativa de reenvio
 * por outro canal).
 */
import type { PushMessage, PushSendResult, PushSender } from './types'

export const PUSH_NOT_CONFIGURED_ERROR = 'push não configurado — implementação real (web-push/VAPID) pendente'

export class NoopPushSender implements PushSender {
  readonly name = 'noop'

  async send(_message: PushMessage): Promise<PushSendResult> {
    return { ok: false, error: PUSH_NOT_CONFIGURED_ERROR }
  }
}

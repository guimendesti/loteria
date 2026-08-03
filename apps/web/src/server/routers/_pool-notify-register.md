# Integração pendente: `pool.ts` → fila `pool-notify` do worker

Este agente (Onda 8, território `apps/web/src/app/j/[inviteCode]/**` +
`apps/worker/src/jobs/pool-notify.ts`) **não edita `apps/web/src/server/routers/pool.ts`**
(território de outro agente nesta mesma onda, ver `docs/contracts/onda8-bolao.md`). O job que
consome os eventos de notificação de bolão já está pronto e testado
(`apps/worker/src/jobs/pool-notify.ts`, 9 testes em `apps/worker/test/pool-notify.test.ts`) —
falta só `pool.ts` ENFILEIRAR os eventos quando as mutations correspondentes rodam.

## Por que enfileirar em vez de chamar direto

`apps/web` e `apps/worker` são processos separados (mesma restrição já documentada em
`apps/web/src/server/routers/admin/config.ts`, seção "BO-41 — enfileira re-sync no BullMQ do
worker"). O padrão do repo é abrir uma `Queue` BullMQ local em `apps/web` apontando para o
MESMO nome de fila que o worker consome — copie o `getResyncQueue`/`enqueueSyncResults`
daquele arquivo, trocando só o nome da fila e o payload.

## Contrato da fila `pool-notify`

Nome da fila: `'pool-notify'` (constante `QUEUE_NAMES.POOL_NOTIFY` em
`apps/worker/src/queues.ts` — não importável de `apps/web`, copie a string literal como o
`admin/config.ts` já faz para `'sync-results'`).

O payload é uma união discriminada por `event` (schema completo, com Zod, em
`apps/worker/src/jobs/pool-notify.ts` → `poolNotifyJobSchema`/`PoolNotifyJobData` — cole a
mesma forma em `apps/web`, não precisa ser literalmente o mesmo import):

```ts
type PoolNotifyJobPayload =
  | { event: 'member.joined'; poolId: string; poolMemberId: string }
  | { event: 'payment.declared'; poolId: string; poolMemberId: string; poolPaymentId: string }
  | { event: 'payment.confirmed'; poolId: string; poolMemberId: string; poolPaymentId: string }
  | { event: 'receipt.attached'; poolId: string; attachedAt: string } // ISO
  | { event: 'payout.computed'; poolId: string; contestId: string }
```

## Onde enfileirar cada evento (dentro de `pool.ts`)

| Evento | Mutation | Quando |
|---|---|---|
| `member.joined` | `pool.join` | **Só** no join self-service (participante entrando pelo convite). **Não** enfileirar em `pool.members.addGuest` — quem chama é o próprio dono, ele já sabe. |
| `payment.declared` | `pool.payments.declare` | Sempre que o membro declara pagamento (`MEMBER_DECLARED`). |
| `payment.confirmed` | `pool.members.confirmPayment` | Sempre que o dono confirma (`OWNER_MANUAL`). |
| `receipt.attached` | `pool.attachReceipt` | Depois de gravar `Pool.receiptUrl`/`receiptUploadedAt`. Use `attachedAt: pool.receiptUploadedAt.toISOString()` (o `dedupeScope` do lado do worker usa esse valor — um reattach de verdade, com timestamp novo, vira uma notificação nova; retry da mesma request, mesmo timestamp, não duplica). |
| `payout.computed` | `pool.payout.compute` | Depois de persistir as linhas de `PoolPayout` do concurso, com o `contestId` usado no cálculo. |

Enfileire DEPOIS de a mutation persistir com sucesso (não antes, e não dentro da mesma
transação Prisma — é uma chamada de rede à parte). Falha ao enfileirar (Redis fora do ar) não
deve derrubar a mutation em si — mesmo tratamento de `admin/config.ts`
(`PRECONDITION_FAILED` só se REDIS_URL não estiver configurado; erro de rede real do Redis,
avalie logar e seguir, já que a notificação é "nice to have", a mutation em si (o dinheiro/
estado) já está gravada).

## Idempotência — nada a fazer do lado do produtor

O job consumidor já lida com reenvio: BullMQ `jobId` (chave natural do evento) + a coluna
`Notification.dedupeKey` (camada 2, em `apps/worker/src/jobs/notify.ts`). Enfileirar o mesmo
evento duas vezes (ex.: retry de rede da própria mutation) não duplica e-mail. Não precisa
gerar nenhum `jobId` do lado de `pool.ts` — o worker já cuida disso ao processar.

## Depois de aplicar

Rode `pnpm -F @lotopro/worker test` para confirmar que o contrato do payload continua batendo
com `apps/worker/test/pool-notify.test.ts`, e apague este arquivo.

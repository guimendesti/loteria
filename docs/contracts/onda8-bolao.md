# Contrato da Onda 8 — Bolão Manager

> **Congelado pelo orquestrador.** Nenhum agente edita este arquivo. Ele existe para
> que os 4 territórios da onda sejam implementados **em paralelo** sem esperar uns
> pelos outros: o agente de UI codifica contra esta assinatura antes de o router
> existir, e o router codifica contra os tipos de `@lotopro/core` antes de eles
> existirem.

## Regra jurídica que atravessa tudo (docs/03)

O LotoPro **nunca custodia dinheiro de bolão**. Todo Pix é P2P entre pessoas
físicas: participante → organizador (cota) e organizador → participante (rateio).
Não existe saldo, carteira, split, escrow ou "receber pelo LotoPro". A UI precisa
deixar isso explícito; o backend nunca cria um caminho onde nosso PSP toca esse valor.

Consequência prática: `confirmPayment` é **declaração humana**, não conciliação
bancária. Quem confirma é o organizador (`OWNER_MANUAL`) ou o participante
declarando que pagou (`MEMBER_DECLARED`). Nunca inferimos pagamento.

## Tipos (já em `packages/core/src/types.ts` — não redefinir)

`PixKeyKind`, `PixPayloadInput`, `PixPayload`, `ShareMath`, `PayoutShare`, `PayoutResult`.

## Schema (já em `packages/db/prisma/schema.prisma` — **não alterar**)

`Pool`, `PoolMember`, `PoolPayment`, `PoolPayout` + enums `PoolStatus`,
`MemberStatus`, `PaymentConfirmation`, `PayoutStatus`. Se algo parecer faltar,
**pare e reporte** — o orquestrador é o único dono do schema.

## Máquina de estados do bolão

```
DRAFT ──publicar──> OPEN ──fechar──> CLOSED ──registrar aposta──> BET_PLACED ──conferir──> SETTLED
  │                   │                 │                              │
  └───────────────────┴─────────────────┴──────────────────────────────┴──> CANCELED
```

- `DRAFT` → só o dono vê; link de convite ainda não vale.
- `OPEN` → aceita entradas até `totalShares` esgotarem.
- `CLOSED` → não aceita mais ninguém; aguardando o dono apostar na lotérica.
- `BET_PLACED` → exige `receiptUrl` (comprovante oficial). **Transição bloqueada sem ele.**
- `SETTLED` → houve conferência do(s) concurso(s); rateio calculado.
- Transições inválidas → `TRPCError BAD_REQUEST`. Nunca pular estado.

## Contrato tRPC `pool.*` (namespace novo em `_app.ts` — o orquestrador liga o seam)

Todo procedure é `protectedProcedure`, **exceto** `joinPreview` (público).
`ctx.session.user.id` é o ator. Autorização: dono = `pool.ownerId === actor`;
membro = existe `PoolMember` com `userId === actor`.

| Procedure | Tipo | Input | Output | Quem pode |
|---|---|---|---|---|
| `pool.create` | mutation | `{ lotterySlug, name, description?, contestFrom, contestTo, totalShares, totalCostCents, rulesAccepted: true }` | `{ poolId, inviteCode, share: ShareMath }` | qualquer autenticado |
| `pool.list` | query | `{ scope: 'organizing'\|'participating'\|'all', status?: PoolStatus }` | `PoolCard[]` | autenticado |
| `pool.detail` | query | `{ poolId }` | `PoolDetail` | dono ou membro |
| `pool.updateStatus` | mutation | `{ poolId, status: PoolStatus }` | `{ status }` | dono |
| `pool.attachReceipt` | mutation | `{ poolId, receiptUrl }` | `{ ok: true }` | dono |
| `pool.members.addGuest` | mutation | `{ poolId, guestName, guestPhone?, shares }` | `{ memberId }` | dono |
| `pool.members.remove` | mutation | `{ memberId }` | `{ ok: true }` | dono |
| `pool.members.confirmPayment` | mutation | `{ memberId }` | `{ status: MemberStatus }` | dono |
| `pool.payments.declare` | mutation | `{ memberId, proofUrl? }` | `{ status: MemberStatus }` | o próprio membro |
| `pool.payments.pixPayload` | query | `{ memberId }` | `PixPayload` | dono ou o próprio membro |
| `pool.joinPreview` | **public** query | `{ inviteCode }` | `JoinPreview` | qualquer um |
| `pool.join` | mutation | `{ inviteCode, shares }` | `{ poolId, memberId }` | autenticado |
| `pool.payout.compute` | mutation | `{ poolId, contestId }` | `PayoutResult` | dono |
| `pool.payout.list` | query | `{ poolId }` | `PayoutRow[]` | dono ou membro |
| `pool.payout.markPaid` | mutation | `{ payoutId }` | `{ status: PayoutStatus }` | dono |

### Shapes de leitura (serializados via superjson — `bigint` chega como `bigint`)

```ts
type PoolCard = {
  id: string; name: string; status: PoolStatus
  lottery: { slug: string; name: string }
  contestFrom: number; contestTo: number
  totalShares: number; sharesTaken: number
  shareValueCents: bigint
  role: 'OWNER' | 'MEMBER'
  /** Só para o dono: quantos membros ainda não pagaram */
  pendingPayments: number | null
}

type PoolMemberRow = {
  id: string; displayName: string          // user.name ?? guestName
  userId: string | null; shares: number
  amountCents: bigint; status: MemberStatus
  paymentDeclaredAt: Date | null; proofUrl: string | null
}

type PoolDetail = PoolCard & {
  description: string | null
  inviteCode: string | null                // null quando o ator não é o dono
  inviteExpiresAt: Date | null
  receiptUrl: string | null
  ownerPixKeyMasked: string | null         // ex.: "***@gmail.com" — NUNCA a chave inteira
  members: PoolMemberRow[]
  share: ShareMath
  bets: { id: string; contestNumber: number; numbers: number[] }[]
}

type JoinPreview = {
  poolName: string; ownerName: string
  lottery: { slug: string; name: string }
  contestFrom: number; contestTo: number
  shareValueCents: bigint
  sharesAvailable: number
  status: PoolStatus
  expired: boolean
}

type PayoutRow = {
  id: string; memberName: string; contestNumber: number
  sharesRatio: string                      // Decimal → string (nunca number)
  amountCents: bigint; status: PayoutStatus
}
```

## Addendum v2 — lacunas achadas durante a implementação

O agente de UI implementou contra a v1 e encontrou 5 buracos reais. Decisões:

1. **`PayoutRow` ganha `memberId: string`** — sem ele o participante não consegue
   destacar a própria linha no rateio. `PayoutRow.memberId` + `isMine: boolean`.
2. **Pix do rateio (organizador → participante)** — nova query
   `pool.payout.pixPayload { payoutId } → PixPayload | null`, **só para o dono**.
   Gera o EMV com a chave do **participante** (`User.pixKeyEncrypted`, que já existe).
   Retorna `null` quando o membro é convidado sem conta ou não cadastrou chave —
   a UI então explica que o repasse é combinado fora do app. Continua sendo P2P:
   nós só montamos o código, não movemos valor.
3. **`PoolCard` ganha `ownerName: string`** — na aba "Participando" é preciso ver
   quem organiza (docs/09 C5).
4. **`pool.leave` (mutation, membro)** — sair do bolão enquanto `status === 'OPEN'`
   **e** o pagamento ainda não foi confirmado pelo dono. Confirmado/pago → erro
   orientando a falar com o organizador (não podemos desfazer um Pix que já ocorreu).
   Libera as cotas de volta dentro da mesma transação.
5. **`displayName` é `string`, nunca `null`** — o router resolve
   `user.name ?? guestName ?? 'Participante'`.

## Invariantes que os testes devem provar

1. **Dinheiro fecha**: `soma(payout.amountCents) + remainderCents === grossPrizeCents`. Sempre. Property-based.
2. **Cota arredonda para cima**: `shareValueCents × totalShares >= totalCostCents`. O `surplusCents` é exibido, nunca escondido.
   Limite universal da sobra (resto de divisão com teto): `0 <= surplusCents < totalShares`.
   ⚠️ Uma versão anterior deste contrato afirmava `surplus < shareValue`. **É falso** — contraexemplo:
   custo 1 centavo em 100 cotas → cota = 1, sobra = 99. Vale no domínio realista (cota de valor
   não trivial), não em geral. Não reintroduza essa forma.
3. **Não vende cota a mais**: `soma(members.shares) <= totalShares` sob concorrência (transação + recheck).
4. **CRC16 do Pix**: payload gerado bate com vetores conhecidos do padrão EMV/BR Code.
5. **`inviteCode` não vaza**: `pool.detail` chamado por membro comum retorna `inviteCode: null`.
6. **Chave Pix não vaza**: só a versão mascarada sai do servidor; `ownerPixKeyEnc` nunca.
7. **Transição de estado**: `BET_PLACED` sem `receiptUrl` → erro.

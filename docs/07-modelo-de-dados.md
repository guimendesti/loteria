# 07 — Modelo de Dados

## 7.1 Decisões de modelagem

| # | Decisão | Racional |
|---|---|---|
| M1 | **Modalidade é linha em tabela, com config em JSONB** | Adicionar loteria = INSERT, não deploy (princípio A1) |
| M2 | **Dinheiro em centavos (`BigInt`)** | Nunca `float`. Evita erro de arredondamento em rateio de prêmio |
| M3 | **Dezenas em `SMALLINT[]` nativo do Postgres** | Operadores de array (`@>`, `&&`) permitem consulta e interseção eficientes |
| M4 | **Campo extra polimórfico em JSONB** | Trevo, mês, time e colunas do Super Sete não cabem num array de dezenas |
| M5 | **`tenant_id` em todas as tabelas de usuário desde o dia 1** | White-label B2B sem refatoração (princípio A5) |
| M6 | **`bet_checks` é imutável e idempotente** | Auditoria; reprocessamento seguro |
| M7 | **Bolão nunca guarda saldo** | Só registra intenção e confirmação de Pix P2P (princípio A2 / [03](03-marco-legal-e-compliance.md)) |
| M8 | **Soft delete por `deleted_at` em dados de usuário** | LGPD: exclusão anonimiza sem quebrar bolões de terceiros |
| M9 | **Preços versionados por vigência** | O reajuste da Caixa não pode corromper histórico de gastos |
| M10 | **IDs: `cuid2`** | Ordenável, curto, não sequencial (não vaza volume de negócio) |

---

## 7.2 Diagrama de entidades

```
┌──────────┐      ┌──────────┐
│ tenants  │◄─────│  users   │──────┐
└──────────┘      └────┬─────┘      │
                       │            │
      ┌────────────────┼────────────┼──────────────┬─────────────┐
      ▼                ▼            ▼              ▼             ▼
┌───────────┐   ┌────────────┐ ┌─────────┐  ┌───────────┐ ┌──────────────┐
│subscriptions│  │    bets    │ │  pools  │  │strategies │ │notification_ │
└─────┬─────┘   └──────┬─────┘ └────┬────┘  └───────────┘ │ preferences  │
      │                │            │                     └──────────────┘
      ▼                │            ▼
┌───────────┐          │      ┌──────────────┐   ┌────────────────┐
│  invoices │          │      │ pool_members │──►│ pool_payments  │
└───────────┘          │      └──────────────┘   └────────────────┘
                       │            │
                       │            ▼
                       │      ┌──────────────┐
                       │      │ pool_payouts │
                       │      └──────────────┘
                       ▼
                ┌─────────────┐        ┌─────────────┐
                │ bet_checks  │◄───────│  contests   │◄──── ┌───────────┐
                └─────────────┘        └──────┬──────┘      │ lotteries │
                                              │             └─────┬─────┘
                                              ▼                   ▼
                                    ┌──────────────────┐   ┌──────────────┐
                                    │ contest_prizes   │   │ prize_tiers  │
                                    └──────────────────┘   │ price_tiers  │
                                                           │ closure_     │
                                                           │  matrices    │
                                                           └──────────────┘
```

---

## 7.3 Schema — Núcleo de loterias (dados de referência)

### `lotteries`

```prisma
model Lottery {
  id             String   @id @default(cuid())
  slug           String   @unique          // "megasena"
  name           String                    // "Mega-Sena"
  caixaApiSlug   String                    // slug usado na API da Caixa
  format         LotteryFormat             // PICK_N | COLUMNS | MATCH_LIST
  universeMin    Int                       // 1
  universeMax    Int                       // 60
  picksMin       Int                       // 6
  picksMax       Int                       // 20
  drawsPerContest Int     @default(1)      // Dupla Sena = 2
  extraField     Json?                     // { kind: "CLOVER", min: 1, max: 6, picksMin: 2, picksMax: 6 }
  drawSchedule   Json                      // v2: { entries: [{ day: 0..6, time: "HH:mm", cutoffMinutes }] } — horário POR DIA (domingo 11h ≠ semana 20h), tz America/Sao_Paulo implícito
  colorToken     String                    // "lottery-megasena"
  isActive       Boolean  @default(true)
  displayOrder   Int
  createdAt      DateTime @default(now())

  contests       Contest[]
  priceTiers     PriceTier[]
  prizeTiers     PrizeTier[]
  closureMatrices ClosureMatrix[]
  bets           Bet[]
  pools          Pool[]
}

enum LotteryFormat { PICK_N  COLUMNS  MATCH_LIST }
```

### `price_tiers` (versionado)

```prisma
model PriceTier {
  id          String    @id @default(cuid())
  lotteryId   String
  picks       Int                     // nº de dezenas
  extraPicks  Int?                    // nº de trevos (+Milionária)
  priceCents  BigInt                  // 600 = R$ 6,00
  validFrom   DateTime
  validUntil  DateTime?               // null = vigente

  lottery     Lottery @relation(fields: [lotteryId], references: [id])
  @@index([lotteryId, picks, validFrom])
}
```

> ⚠️ **Nunca fazer UPDATE de preço.** Reajuste = fechar `validUntil` do registro atual e INSERT de um novo.
> Isso preserva a integridade do histórico de gastos do usuário (M9).

### `prize_tiers`

```prisma
model PrizeTier {
  id            String  @id @default(cuid())
  lotteryId     String
  tier          Int                   // 1 = faixa principal
  label         String                // "Sena", "15 acertos", "20 acertos"
  hits          Int                   // acertos necessários
  extraHits     Int?                  // trevos necessários (+Milionária)
  drawIndex     Int?                  // Dupla Sena: 1º ou 2º sorteio
  isSpecialRule Boolean @default(false) // Lotomania: 0 acertos premia

  lottery       Lottery @relation(fields: [lotteryId], references: [id])
  @@unique([lotteryId, tier])
}
```

### `contests`

```prisma
model Contest {
  id                String   @id @default(cuid())
  lotteryId         String
  number            Int
  drawDate          DateTime
  numbers           Int[]                     // dezenas sorteadas (ordenadas)
  numbersDrawOrder  Int[]                     // ordem de extração
  extraResult       Json?                     // { clovers: [2,5] } | { month: 7 } | { team: "..." }
  secondaryNumbers  Int[]                     // Dupla Sena — 2º sorteio
  isAccumulated     Boolean  @default(false)
  isSpecial         Boolean  @default(false)
  collectedCents    BigInt?                   // valorArrecadado
  accumulatedNextCents BigInt?
  estimatedNextCents   BigInt?
  drawLocation      String?
  rawPayload        Json                      // payload original da API — auditoria e reprocessamento
  settledAt         DateTime?                 // quando a conferência foi disparada
  createdAt         DateTime @default(now())

  lottery           Lottery @relation(fields: [lotteryId], references: [id])
  prizes            ContestPrize[]
  checks            BetCheck[]

  @@unique([lotteryId, number])
  @@index([lotteryId, drawDate(sort: Desc)])
  @@index([settledAt])
}
```

`rawPayload` é essencial: se descobrirmos um bug no parser meses depois, reprocessamos sem chamar a API.

### `contest_prizes`

```prisma
model ContestPrize {
  id           String @id @default(cuid())
  contestId    String
  tier         Int
  label        String
  winnersCount Int
  prizeCents   BigInt

  contest      Contest @relation(fields: [contestId], references: [id])
  @@unique([contestId, tier])
}
```

### `closure_matrices`

```prisma
model ClosureMatrix {
  id             String   @id @default(cuid())
  lotteryId      String
  poolSize       Int                    // dezenas escolhidas (ex.: 18)
  picksPerBet    Int                    // dezenas por jogo (ex.: 15)
  guaranteeHits  Int                    // garante N pontos...
  ifHits         Int                    // ...se acertar M das escolhidas
  betCount       Int                    // nº de jogos gerados
  matrix         Json                   // [[1,2,3,...], ...] índices 1..poolSize
  source         String                 // proveniência
  verifiedAt     DateTime?              // ⚠️ null = NUNCA expor ao usuário
  createdAt      DateTime @default(now())

  lottery        Lottery @relation(fields: [lotteryId], references: [id])
  @@unique([lotteryId, poolSize, picksPerBet, guaranteeHits, ifHits])
  @@index([lotteryId, poolSize])
}
```

A matriz guarda **índices posicionais** (1..poolSize), não dezenas. Em runtime, mapeia-se para as dezenas
que o usuário escolheu. Uma matriz serve para qualquer conjunto de dezenas do mesmo tamanho.

---

## 7.4 Schema — Usuários e assinaturas

```prisma
model Tenant {
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  type          TenantType @default(PLATFORM)   // PLATFORM | WHITE_LABEL
  branding      Json?                            // logo, cores, domínio
  isActive      Boolean @default(true)
  createdAt     DateTime @default(now())

  users         User[]
}
enum TenantType { PLATFORM  WHITE_LABEL }

model User {
  id              String   @id @default(cuid())
  tenantId        String
  email           String
  emailVerifiedAt DateTime?
  name            String
  phone           String?
  passwordHash    String?                        // null se só OAuth
  avatarUrl       String?
  role            UserRole @default(CUSTOMER)
  isAdult         Boolean  @default(false)       // declaração obrigatória
  pixKeyEncrypted String?                        // AES-256-GCM — só para organizador de bolão
  pixKeyType      PixKeyType?
  timezone        String   @default("America/Sao_Paulo")
  lastSeenAt      DateTime?
  deletedAt       DateTime?                      // soft delete / anonimização LGPD
  createdAt       DateTime @default(now())

  tenant          Tenant @relation(fields: [tenantId], references: [id])
  subscription    Subscription?
  bets            Bet[]
  ownedPools      Pool[]        @relation("PoolOwner")
  poolMemberships PoolMember[]
  strategies      Strategy[]
  notificationPreference NotificationPreference?
  usageCounters   UsageCounter[]

  @@unique([tenantId, email])
  @@index([tenantId, deletedAt])
}
enum UserRole  { CUSTOMER  SUPPORT  FINANCE  ADMIN }
enum PixKeyType { CPF  CNPJ  EMAIL  PHONE  RANDOM }

model Plan {
  id            String @id @default(cuid())
  slug          String @unique              // "free" | "premium" | "pro" | "whitelabel"
  name          String
  priceMonthlyCents BigInt
  priceYearlyCents  BigInt
  entitlements  Json                         // ver packages/core/entitlements
  isPublic      Boolean @default(true)
  displayOrder  Int

  subscriptions Subscription[]
}

model Subscription {
  id                  String   @id @default(cuid())
  userId              String   @unique
  planId              String
  status              SubStatus
  billingCycle        BillingCycle
  paymentMethod       PaymentMethod
  gatewaySubscriptionId String?              // ID no Asaas
  currentPeriodStart  DateTime
  currentPeriodEnd    DateTime
  trialEndsAt         DateTime?
  cancelAtPeriodEnd   Boolean  @default(false)
  canceledAt          DateTime?
  cancelReason        String?
  createdAt           DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  plan    Plan    @relation(fields: [planId], references: [id])
  invoices Invoice[]

  @@index([status, currentPeriodEnd])
}
enum SubStatus     { TRIALING  ACTIVE  PAST_DUE  CANCELED  EXPIRED }
enum BillingCycle  { MONTHLY  YEARLY }
enum PaymentMethod { PIX_AUTOMATIC  CREDIT_CARD  BOLETO }

model Invoice {
  id             String @id @default(cuid())
  subscriptionId String
  amountCents    BigInt
  status         InvoiceStatus
  method         PaymentMethod
  gatewayInvoiceId String? @unique
  dueAt          DateTime
  paidAt         DateTime?
  attempts       Int      @default(0)
  failureReason  String?
  createdAt      DateTime @default(now())

  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  @@index([status, dueAt])
}
enum InvoiceStatus { PENDING  PAID  FAILED  REFUNDED  CANCELED }

model UsageCounter {
  id        String @id @default(cuid())
  userId    String
  metric    String                    // "ocr_scans" | "ai_messages" | "backtests"
  period    String                    // "2026-08"
  used      Int    @default(0)
  updatedAt DateTime @updatedAt

  user      User @relation(fields: [userId], references: [id])
  @@unique([userId, metric, period])
}
```

---

## 7.5 Schema — Apostas

```prisma
model Bet {
  id             String   @id @default(cuid())
  tenantId       String
  userId         String
  lotteryId      String
  poolId         String?                       // null = aposta pessoal
  batchId        String?                       // agrupa jogos gerados juntos
  strategyId     String?
  numbers        Int[]                         // dezenas escolhidas
  extraPicks     Json?                         // { clovers: [2,5] } | { month: 7 } | { team: "..." }
  columns        Json?                         // Super Sete: [[1],[2,3],...]
  matchPicks     Json?                         // Loteca
  costCents      BigInt                        // congelado na criação (usa price_tier vigente)
  contestFrom    Int                           // vale a partir deste concurso
  contestTo      Int                           // até este (inclusive) — multi-concurso
  source         BetSource @default(MANUAL)    // MANUAL | GENERATED | OCR | IMPORT | CLOSURE
  receiptUrl     String?                       // comprovante no R2
  notes          String?
  isActive       Boolean  @default(true)
  deletedAt      DateTime?
  createdAt      DateTime @default(now())

  user           User     @relation(fields: [userId], references: [id])
  lottery        Lottery  @relation(fields: [lotteryId], references: [id])
  pool           Pool?    @relation(fields: [poolId], references: [id])
  strategy       Strategy? @relation(fields: [strategyId], references: [id])
  checks         BetCheck[]

  // ★ índice crítico da conferência
  @@index([lotteryId, isActive, contestFrom, contestTo])
  @@index([userId, createdAt(sort: Desc)])
  @@index([poolId])
  @@index([tenantId])
}
enum BetSource { MANUAL  GENERATED  OCR  IMPORT  CLOSURE }

model BetCheck {
  id           String   @id @default(cuid())
  betId        String
  contestId    String
  hits         Int
  hitNumbers   Int[]
  extraHits    Int?
  prizeTier    Int?                            // null = não premiado
  prizeCents   BigInt   @default(0)
  drawIndex    Int?                            // Dupla Sena
  checkedAt    DateTime @default(now())

  bet          Bet     @relation(fields: [betId], references: [id])
  contest      Contest @relation(fields: [contestId], references: [id])

  @@unique([betId, contestId, drawIndex])      // ★ idempotência
  @@index([contestId, prizeTier])
}

model Strategy {
  id          String  @id @default(cuid())
  userId      String
  lotteryId   String
  name        String
  filters     Json                             // { evenOdd:{min,max}, sum:{min,max}, primes:{...}, repeats:{...} }
  isFavorite  Boolean @default(false)
  createdAt   DateTime @default(now())

  user        User @relation(fields: [userId], references: [id])
  bets        Bet[]
  @@index([userId, lotteryId])
}
```

**Modelo multi-concurso:** `contestFrom`/`contestTo` evita criar N linhas para um jogo que vale N concursos.
A conferência varre `WHERE lotteryId = ? AND isActive AND contestFrom <= N AND contestTo >= N` — um único
índice resolve.

---

## 7.6 Schema — Bolões

> ⚠️ **Nenhum campo desta seção representa saldo custodiado pelo LotoPro.** `pool_payments` e `pool_payouts`
> registram transferências P2P que ocorrem **fora** do sistema.

```prisma
model Pool {
  id                String   @id @default(cuid())
  tenantId          String
  ownerId           String
  lotteryId         String
  name              String
  description       String?
  contestFrom       Int
  contestTo         Int
  totalShares       Int                        // total de cotas
  shareValueCents   BigInt                     // valor por cota
  totalCostCents    BigInt                     // custo total dos jogos
  inviteCode        String   @unique           // código do link de convite
  inviteExpiresAt   DateTime?
  status            PoolStatus @default(DRAFT)
  ownerPixKeyType   PixKeyType?                // snapshot no momento da criação
  ownerPixKeyEnc    String?
  receiptUrl        String?                    // comprovante oficial da aposta
  receiptUploadedAt DateTime?
  rulesAcceptedAt   DateTime?                  // organizador aceitou os termos de responsabilidade
  closedAt          DateTime?
  createdAt         DateTime @default(now())

  owner             User    @relation("PoolOwner", fields: [ownerId], references: [id])
  lottery           Lottery @relation(fields: [lotteryId], references: [id])
  members           PoolMember[]
  bets              Bet[]
  payouts           PoolPayout[]

  @@index([ownerId, status])
  @@index([inviteCode])
}
enum PoolStatus { DRAFT  OPEN  CLOSED  BET_PLACED  SETTLED  CANCELED }

model PoolMember {
  id           String   @id @default(cuid())
  poolId       String
  userId       String?                          // null = convidado sem conta ainda
  guestName    String?
  guestPhone   String?
  shares       Int
  amountCents  BigInt                           // shares × shareValueCents
  status       MemberStatus @default(INVITED)
  joinedAt     DateTime?
  createdAt    DateTime @default(now())

  pool         Pool  @relation(fields: [poolId], references: [id])
  user         User? @relation(fields: [userId], references: [id])
  payments     PoolPayment[]
  payouts      PoolPayout[]

  @@unique([poolId, userId])
  @@index([poolId, status])
}
enum MemberStatus { INVITED  JOINED  PAID  CONFIRMED  REMOVED }

// Registro de um Pix P2P participante → organizador. O LotoPro NÃO processa este valor.
model PoolPayment {
  id             String   @id @default(cuid())
  poolMemberId   String
  amountCents    BigInt
  pixPayload     String?                        // copia-e-cola gerado (EMV), chave do ORGANIZADOR
  pixTxid        String?                        // identificador do payload
  confirmedBy    PaymentConfirmation?           // OWNER_MANUAL | MEMBER_DECLARED
  confirmedAt    DateTime?
  proofUrl       String?                        // comprovante enviado pelo participante
  createdAt      DateTime @default(now())

  poolMember     PoolMember @relation(fields: [poolMemberId], references: [id])
  @@index([poolMemberId])
}
enum PaymentConfirmation { OWNER_MANUAL  MEMBER_DECLARED }

// Cálculo do rateio. Também não é movimentação financeira nossa.
model PoolPayout {
  id             String   @id @default(cuid())
  poolId         String
  poolMemberId   String
  contestId      String
  grossPrizeCents BigInt                        // prêmio total do bolão no concurso
  sharesRatio    Decimal  @db.Decimal(10,8)     // cotas do membro / total
  amountCents    BigInt                         // valor devido a este membro
  pixPayload     String?                        // Pix organizador → membro
  status         PayoutStatus @default(PENDING)
  paidAt         DateTime?
  createdAt      DateTime @default(now())

  pool           Pool       @relation(fields: [poolId], references: [id])
  poolMember     PoolMember @relation(fields: [poolMemberId], references: [id])
  @@unique([poolMemberId, contestId])
  @@index([poolId, status])
}
enum PayoutStatus { PENDING  DECLARED_PAID  CONFIRMED }
```

### Regra de rateio (implementação obrigatória)

```
valor_do_membro = floor(prêmio_total × cotas_do_membro / cotas_totais)
resto = prêmio_total − Σ valores
→ o resto (centavos) vai para o organizador, com nota explícita na UI
```

Trabalhar **sempre em centavos inteiros** e distribuir o resto explicitamente. Nunca arredondar por membro
de forma independente — isso gera divergência de centavos que, num bolão, vira discussão.

---

## 7.7 Schema — Notificações, auditoria e operação

```prisma
model NotificationPreference {
  id                String @id @default(cuid())
  userId            String @unique
  emailEnabled      Boolean @default(true)
  pushEnabled       Boolean @default(true)
  whatsappEnabled   Boolean @default(false)
  onlyWhenPrized    Boolean @default(false)    // notificar só se ganhou
  accumulatedThresholdCents BigInt?            // alerta de acumulado
  cutoffReminder    Boolean @default(true)
  marketingOptIn    Boolean @default(false)    // LGPD: opt-in separado
  quietHoursStart   String?                    // "22:00"
  quietHoursEnd     String?

  user              User @relation(fields: [userId], references: [id])
}

model Notification {
  id         String   @id @default(cuid())
  userId     String
  channel    NotificationChannel
  type       String                             // "bet.prized" | "contest.accumulated" | ...
  title      String
  body       String
  payload    Json?
  status     NotificationStatus @default(QUEUED)
  sentAt     DateTime?
  readAt     DateTime?
  error      String?
  createdAt  DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([status, createdAt])
}
enum NotificationChannel { EMAIL  PUSH  WHATSAPP  IN_APP }
enum NotificationStatus  { QUEUED  SENT  FAILED  READ }

model PushSubscription {
  id        String @id @default(cuid())
  userId    String
  endpoint  String @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  actorRole  String?
  action     String                             // "user.plan_changed" | "pool.deleted" | ...
  entityType String
  entityId   String
  before     Json?
  after      Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorId, createdAt(sort: Desc)])
}

model WebhookEvent {
  id           String   @id @default(cuid())
  provider     String                           // "asaas"
  externalId   String
  eventType    String
  payload      Json
  processedAt  DateTime?
  error        String?
  createdAt    DateTime @default(now())

  @@unique([provider, externalId])             // ★ idempotência de webhook
}

model FeatureFlag {
  id          String  @id @default(cuid())
  key         String  @unique
  description String?
  isEnabled   Boolean @default(false)
  rolloutPct  Int     @default(0)
  targetPlans String[]
  updatedAt   DateTime @updatedAt
}
```

---

## 7.8 Views materializadas (estatísticas)

Estatísticas sobre milhares de concursos não podem ser calculadas a cada request.

```sql
-- Frequência e atraso por dezena, por modalidade
CREATE MATERIALIZED VIEW mv_number_stats AS
SELECT
  c.lottery_id,
  n AS number,
  COUNT(*)                                          AS total_draws,
  MAX(c.number)                                     AS last_contest,
  (SELECT MAX(number) FROM contests c2
    WHERE c2.lottery_id = c.lottery_id) - MAX(c.number) AS delay,
  COUNT(*) FILTER (WHERE c.draw_date > NOW() - INTERVAL '1 year') AS draws_last_year
FROM contests c, UNNEST(c.numbers) AS n
GROUP BY c.lottery_id, n;

CREATE UNIQUE INDEX ON mv_number_stats (lottery_id, number);
```

Views adicionais: `mv_pair_frequency` (pares que saem juntos), `mv_sum_distribution`,
`mv_evenodd_distribution`, `mv_user_monthly_spend`.

**Refresh:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` disparado pelo worker após cada novo concurso.

---

## 7.9 Índices críticos (resumo)

| Índice | Query que serve |
|---|---|
| `bets(lotteryId, isActive, contestFrom, contestTo)` | ★ Conferência em lote — o índice mais importante do sistema |
| `bets(userId, createdAt DESC)` | Listagem do painel |
| `bet_checks(betId, contestId, drawIndex)` UNIQUE | Idempotência da conferência |
| `bet_checks(contestId, prizeTier)` | "Quem ganhou neste concurso?" (notificação) |
| `contests(lotteryId, number)` UNIQUE | Upsert de sincronização |
| `contests(lotteryId, drawDate DESC)` | Histórico e estatísticas |
| `pools(inviteCode)` | Resolução do link de convite |
| `subscriptions(status, currentPeriodEnd)` | Cron de renovação e dunning |
| `webhook_events(provider, externalId)` UNIQUE | Idempotência de webhook |

---

## 7.10 Estimativa de volume (24 meses)

| Tabela | Registros | Observação |
|---|---|---|
| `contests` | ~30 mil | Histórico completo de 11 modalidades; cresce ~1.500/ano |
| `contest_prizes` | ~180 mil | |
| `users` | ~55 mil | Cenário base de [05](05-monetizacao-e-planos.md) |
| `bets` | ~3 milhões | Média de 55 apostas/usuário |
| **`bet_checks`** | **~25 milhões** | ★ Maior tabela. Cada aposta multi-concurso gera N checks |
| `pools` | ~40 mil | |
| `pool_members` | ~350 mil | |
| `notifications` | ~15 milhões | |

**Ações de escala previstas (não no MVP, mas planejadas):**
- **Particionar `bet_checks`** por `contest_id` range ou por mês quando passar de ~10 milhões.
- **Arquivar `notifications`** com mais de 6 meses para storage frio.
- Considerar `pg_partman` para automação do particionamento.

---

## 7.11 Seeds obrigatórios

| Seed | Conteúdo |
|---|---|
| `lotteries` | 11 modalidades com config completa |
| `price_tiers` | Tabela de preços 2026 com `validFrom` |
| `prize_tiers` | Faixas de premiação por modalidade |
| `plans` | free, premium, pro, whitelabel com entitlements |
| `closure_matrices` | Biblioteca inicial (Lotofácil 16–20 dezenas prioritário) |
| `tenants` | Tenant `platform` padrão |
| `contests` | **Backfill histórico completo** — job separado, não seed (ver [06](06-arquitetura-tecnica.md)) |

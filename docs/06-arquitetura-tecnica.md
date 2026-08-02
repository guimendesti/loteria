# 06 — Arquitetura Técnica

## 6.1 Princípios de arquitetura

| # | Princípio | Consequência prática |
|---|---|---|
| A1 | **Modalidade é dado, não código** | Adicionar uma loteria estadual = inserir uma linha, não fazer deploy |
| A2 | **Zero custódia de valores** | Nenhum endpoint movimenta dinheiro de aposta (ver [03](03-marco-legal-e-compliance.md)) |
| A3 | **Resultado apurado é imutável** | Cache eterno; conferência é idempotente e auditável |
| A4 | **Trabalho pesado vai para fila** | Conferência, fechamento, backtesting e OCR nunca bloqueiam request |
| A5 | **Multi-tenant desde o schema** | White-label B2B não exige refatoração depois |
| A6 | **Um monorepo, TypeScript ponta a ponta** | Menos boilerplate, tipos compartilhados, velocidade de entrega |
| A7 | **Entitlements centralizados** | Um único módulo decide o que cada plano pode fazer |
| A8 | **Provedor de dados abstraído** | Trocar a fonte de resultados não toca no domínio |

---

## 6.2 Stack recomendada

### Decisão principal: monólito modular Next.js + workers separados

**Escolhido:** Next.js 15 (App Router) full-stack com tRPC, mais um serviço de workers Node separado.

**Por quê, e não NestJS + SPA separada:**

| Critério | Next.js + tRPC | NestJS + React SPA |
|---|---|---|
| Velocidade de entrega (time pequeno) | ✅ Muito maior — sem DTOs duplicados, sem cliente HTTP manual | ❌ Mais boilerplate |
| SEO da landing | ✅ SSR/SSG nativo | ❌ Precisa de solução à parte |
| Tipagem ponta a ponta | ✅ Automática via tRPC | ~ Manual ou via codegen |
| Domínio rico (conferência, fechamento) | ✅ Isolado em `packages/core`, testável, independente do framework | ✅ |
| Futuro app mobile | ✅ tRPC + rota REST pública para o app | ✅ |
| Custo de tokens de desenvolvimento | ✅ **Significativamente menor** | ❌ Mais arquivos, mais camadas |

A lógica de negócio vive em `packages/core` — **puro TypeScript, sem dependência de framework**.
Se um dia for preciso migrar para NestJS ou expor uma API dedicada, o domínio vai junto sem reescrita.

### Stack completa

| Camada | Escolha | Justificativa |
|---|---|---|
| **Monorepo** | Turborepo + pnpm | Cache de build, workspaces |
| **Linguagem** | TypeScript (strict) | Tipagem ponta a ponta |
| **Framework web** | Next.js 15 (App Router, RSC) | SSR para SEO + SPA para painéis |
| **RPC** | tRPC v11 | Tipos compartilhados sem codegen |
| **UI** | Tailwind CSS v4 + shadcn/ui + Radix | Velocidade + acessibilidade nativa |
| **Estado servidor** | TanStack Query (via tRPC) | Cache, revalidação, otimista |
| **Formulários** | React Hook Form + Zod | Validação compartilhada cliente/servidor |
| **Gráficos** | Recharts | Suficiente; leve; sem licença |
| **ORM** | Prisma | Migrations, tipos, produtividade |
| **Banco** | PostgreSQL 16 (Neon) | JSONB para configs de modalidade, arrays nativos, window functions para estatística |
| **Cache / filas** | Redis (Upstash) + BullMQ | Filas com retry, cron, dead-letter |
| **Workers** | Serviço Node dedicado (Railway) | Conferência, sync, OCR, fechamento, notificações |
| **Auth** | Better Auth | Self-hosted (sem custo por MAU), suporta organizações (multi-tenant), 2FA, OAuth |
| **Pagamentos** | **Asaas** | Pix Automático + cartão + boleto; nacional; webhooks (ver [05](05-monetizacao-e-planos.md)) |
| **Storage** | Cloudflare R2 | Comprovantes; sem egress fee; S3-compatible |
| **E-mail** | Resend + React Email | DX excelente; templates em componentes |
| **Push** | Web Push (VAPID) via PWA | Sem dependência de app store no MVP |
| **WhatsApp** | Meta Cloud API (oficial) | ⚠️ **Nunca** usar API não-oficial (Z-API/Evolution) — risco de ban e de compliance |
| **IA** | Anthropic SDK (`@anthropic-ai/sdk`) | OCR e assistente (ver [11](11-guia-de-modelos-ia.md)) |
| **Observabilidade** | Sentry (erros) + PostHog (produto, funil, flags) | PostHog também cobre feature flags e A/B |
| **Testes** | Vitest (unit) + Playwright (E2E) | |
| **CI/CD** | GitHub Actions | lint → typecheck → test → migrate → deploy |
| **Deploy** | Vercel (web) + Railway (workers) + Neon (DB) + Upstash (Redis) | |

---

## 6.3 Estrutura do monorepo

```
lotopro/
├── apps/
│   ├── web/                    # Next.js — landing + painel cliente + backoffice
│   │   └── src/app/
│   │       ├── (marketing)/    # landing, planos, blog, SEO
│   │       ├── (auth)/         # login, cadastro, recuperação
│   │       ├── (app)/          # painel do cliente  [protegido]
│   │       └── (admin)/        # backoffice          [protegido + RBAC]
│   └── worker/                 # Node + BullMQ — jobs e crons
├── packages/
│   ├── core/                   # ★ DOMÍNIO PURO — sem framework
│   │   ├── lottery/            # motor de modalidades, validação de aposta
│   │   ├── checking/           # conferência, cálculo de acertos e faixas
│   │   ├── generator/          # geração, filtros estatísticos
│   │   ├── closure/            # fechamentos / matrizes de garantia
│   │   ├── pool/               # bolão: cotas, rateio
│   │   ├── stats/              # frequência, atraso, ciclos
│   │   └── entitlements/       # regras de plano — fonte única da verdade
│   ├── db/                     # Prisma schema, migrations, seeds
│   ├── api/                    # routers tRPC
│   ├── ui/                     # design system compartilhado
│   ├── integrations/           # caixa-api, asaas, resend, r2, anthropic, whatsapp
│   └── config/                 # eslint, tsconfig, tailwind compartilhados
└── turbo.json
```

**Regra de dependência:** `core` não importa nada de `apps`, `db` ou `integrations`.
Ele recebe dados e devolve resultados. Isso o torna 100% testável sem infraestrutura.

---

## 6.4 Diagrama de componentes

```
                       ┌─────────────────────────────┐
   Navegador / PWA ───►│  Next.js (Vercel)           │
                       │  ├─ (marketing) SSG/ISR     │──► SEO
                       │  ├─ (auth) Better Auth      │
                       │  ├─ (app) painel cliente    │
                       │  ├─ (admin) backoffice      │
                       │  └─ tRPC routers            │
                       └──────┬───────────┬──────────┘
                              │           │
                 ┌────────────▼──┐   ┌────▼──────────┐
                 │ PostgreSQL    │   │ Redis         │
                 │ (Neon)        │   │ (Upstash)     │
                 └────────────▲──┘   └────▲──────────┘
                              │           │ BullMQ
                       ┌──────┴───────────┴──────────┐
                       │  Worker (Railway)           │
                       │  ├─ sync-results  (cron)    │──► API Caixa
                       │  ├─ check-bets    (evento)  │
                       │  ├─ notify        (evento)  │──► Resend / Push / WhatsApp
                       │  ├─ ocr-receipt   (fila)    │──► Anthropic (Haiku vision)
                       │  ├─ closure-calc  (fila)    │
                       │  ├─ backtest      (fila)    │
                       │  └─ billing-dunning (cron)  │──► Asaas
                       └─────────────────────────────┘
                                     │
                       ┌─────────────▼───────────────┐
                       │ Cloudflare R2 (comprovantes)│
                       └─────────────────────────────┘

  Webhooks de entrada: Asaas (pagamento) ──► /api/webhooks/asaas
```

---

## 6.5 O motor de modalidades (peça central)

Toda modalidade é uma linha na tabela `lotteries`, com a configuração em colunas + JSONB:

```ts
// packages/core/lottery/types.ts
type LotteryConfig = {
  slug: string                     // "megasena"
  name: string                     // "Mega-Sena"
  caixaApiSlug: string             // "megasena"
  universeMin: number              // 1
  universeMax: number              // 60
  picksMin: number                 // 6
  picksMax: number                 // 20
  drawsPerContest: number          // 1 (Dupla Sena = 2)
  extraField: ExtraFieldConfig | null
  format: 'PICK_N' | 'COLUMNS' | 'MATCH_LIST'  // Super Sete = COLUMNS, Loteca = MATCH_LIST
  priceTable: PriceTier[]          // versionado por vigência
  prizeTiers: PrizeTierConfig[]
  drawSchedule: DrawSchedule       // dias + horário + horário de corte
  colorToken: string               // token do design system
}

type ExtraFieldConfig =
  | { kind: 'CLOVER';  min: number; max: number; picksMin: number; picksMax: number } // +Milionária
  | { kind: 'MONTH' }                                                                  // Dia de Sorte
  | { kind: 'TEAM'; source: 'timemania_teams' }                                        // Timemania
```

**Interface do domínio (contratos estáveis):**

```ts
interface LotteryEngine {
  validateBet(config: LotteryConfig, bet: BetInput): ValidationResult
  priceBet(config: LotteryConfig, bet: BetInput, at: Date): Money
  check(config: LotteryConfig, bet: Bet, result: ContestResult): CheckOutcome
  generate(config: LotteryConfig, params: GeneratorParams): BetInput[]
}
```

**Ganho:** adicionar +Milionária, Loteca ou uma loteria estadual futura é escrever uma config e, no máximo,
uma estratégia de `format`. Não é reescrever o sistema.

---

## 6.6 Integração com a API da Caixa

```ts
// packages/integrations/caixa/provider.ts
interface LotteryResultProvider {
  fetchLatest(slug: string): Promise<ContestResult>
  fetchByNumber(slug: string, n: number): Promise<ContestResult>
}
```

Implementações: `CaixaOfficialProvider` (primária) → `SelfHostedMirrorProvider` (fallback 1)
→ `ThirdPartyApiProvider` (fallback 2). Orquestradas por um `ResilientResultProvider` com circuit breaker.

**Cuidados obrigatórios (ver riscos em [01](01-pesquisa-de-mercado.md)):**

| Item | Tratamento |
|---|---|
| TLS não-padrão | `https.Agent` configurado explicitamente. **Validar em Linux/produção na Sprint 1** — o handshake falha em alguns ambientes. |
| Timeout | 10s, com retry exponencial (3 tentativas) |
| Rate limit | Máximo 1 req/modalidade/min na janela de sorteio; 1/h fora dela |
| Datas | Parser `DD/MM/AAAA` fixado em `America/Sao_Paulo` |
| Valores monetários | Converter para **centavos inteiros** na borda. Nunca `float` no banco. |
| Mudança de schema | Validar payload com Zod; se falhar, alertar via Sentry e cair para fallback |
| Idempotência | Chave `(lottery_slug, contest_number)`; upsert |

**Cron de sincronização:**

| Janela | Frequência |
|---|---|
| Dias de sorteio, 20:50–23:00 | a cada 5 min |
| Domingos, 10:40–13:00 | a cada 5 min |
| Demais horários | a cada 1 hora |
| Backfill histórico | job manual, uma vez, com throttle de 1 req/s |

---

## 6.7 Pipeline de conferência

Este é o fluxo mais crítico do produto. Precisa ser rápido, correto e idempotente.

```
1. sync-results detecta contest novo e persiste
       ↓
2. Emite evento `contest.settled` { lotteryId, contestNumber }
       ↓
3. check-bets consome:
   - SELECT bets ativas para (lottery, contest)  ← índice dedicado
   - Processa em lotes de 500
   - Para cada aposta: core.check() → hits, faixa, prêmio bruto
   - Grava em bet_checks (UNIQUE bet_id + contest_id → idempotente)
       ↓
4. Para bolões afetados: calcula rateio por cota → pool_payouts
       ↓
5. Emite `bet.checked` / `pool.settled`
       ↓
6. notify consome e envia conforme preferência e plano do usuário
```

**Metas de performance:**

| Métrica | Meta |
|---|---|
| Conferência de 100 mil apostas | < 60 segundos |
| Primeira notificação após publicação do resultado | < 3 minutos |
| Conferência individual (síncrona, sob demanda) | < 200 ms |

**Correção:** o cálculo de acertos é uma interseção de conjuntos — trivial. O que exige cuidado é
o mapeamento **acertos → faixa de premiação**, que varia por modalidade (ex.: Lotomania premia 0 acertos;
Dupla Sena tem dois sorteios; +Milionária cruza dezenas × trevos). Cada modalidade tem sua tabela de faixas
em `prize_tiers`, com **teste unitário obrigatório com casos reais do histórico**.

---

## 6.8 Motor de fechamentos

**Não gerar matrizes por força bruta em runtime.** Fechamentos ótimos são *covering designs* — problema
combinatório caro (C(25,15) ≈ 3,2 milhões só para Lotofácil).

**Abordagem:**

1. **Biblioteca curada e pré-computada** de matrizes por `(modalidade, dezenas_escolhidas, dezenas_por_jogo, garantia)`.
2. Cada matriz é **verificada exaustivamente uma vez, offline**, e marcada `verified_at`.
   Uma matriz não verificada **nunca** é exposta ao usuário.
3. Em runtime: buscar a matriz (índice em memória) e aplicar às dezenas do usuário — O(n) trivial.
4. Fechamentos customizados (fora da biblioteca) vão para **fila**, com heurística limitada por tempo, e
   resultado entregue por notificação. Exclusivo do Pro.

**Transparência obrigatória na UI:** antes de gerar, mostrar
*"18 dezenas · garantia de 14 pontos se acertar 15 · 12 jogos · custo R$ 42,00"*.
E o disclaimer: *"a garantia é condicional às dezenas escolhidas; não aumenta a chance de acerto."*

---

## 6.9 Entitlements (controle de plano)

Fonte única da verdade em `packages/core/entitlements`:

```ts
type Entitlements = {
  maxActiveBets: number | 'unlimited'
  maxAutoCheckLotteries: number | 'unlimited'
  historyDays: number | 'unlimited'
  maxPools: number | 'unlimited'
  maxPoolParticipants: number | 'unlimited'
  ocrScansPerMonth: number
  aiMessagesPerMonth: number
  maxClosureNumbers: number
  channels: ('email' | 'push' | 'whatsapp')[]
  features: Set<'backtesting' | 'ai_assistant' | 'api_access' | 'export' | 'pool_receipt'>
}
```

- Verificado no **servidor** (tRPC middleware), nunca só no cliente.
- Consumo (scans OCR, mensagens IA) contabilizado em `usage_counters` com janela mensal, incremento atômico.
- Downgrade **nunca deleta dados** — apenas bloqueia criação e oculta excedente.
- Ligado ao PostHog para medir qual gatilho de paywall converte melhor.

---

## 6.10 Segurança

| Área | Controle |
|---|---|
| Autenticação | Better Auth; senha com Argon2id; 2FA opcional (TOTP); OAuth Google |
| Sessão | Cookie httpOnly, Secure, SameSite=Lax; rotação em privilege escalation |
| Autorização | RBAC no backoffice (`viewer`, `support`, `finance`, `admin`); ABAC no bolão (owner/participante) |
| Rate limiting | Por IP e por usuário nas rotas de auth, OCR, IA e criação de bolão |
| **Chave Pix** | Criptografada em repouso (AES-256-GCM, chave em variável de ambiente/KMS). Nunca em log. Exibida mascarada no backoffice. |
| Comprovantes | Bucket privado; acesso só por URL assinada com TTL de 5 min; verificação de propriedade a cada acesso |
| Upload | Validação de MIME real (magic bytes), limite de 8 MB, reprocessamento da imagem para remover EXIF |
| Webhooks | Validação de assinatura HMAC do Asaas + idempotência por `event_id` |
| Injeção | Prisma (queries parametrizadas); zero SQL cru com interpolação |
| Segredos | Nunca no repositório; Vercel/Railway env; rotação documentada |
| Auditoria | `audit_logs` para toda ação de admin e toda mudança de plano/bolão |
| Headers | CSP, HSTS, X-Frame-Options, Referrer-Policy via middleware |
| Dependências | Dependabot + `pnpm audit` no CI |

**Prompt injection (assistente IA):** o conteúdo do usuário (nomes de bolão, notas) nunca é interpolado
como instrução. Vai como dado delimitado, com system prompt que declara explicitamente que conteúdo de
usuário não carrega autoridade de instrução.

---

## 6.11 Observabilidade

| Sinal | Ferramenta | Alerta |
|---|---|---|
| Erros de aplicação | Sentry | Slack/e-mail imediato em erro novo |
| **Falha de sync da Caixa** | Sentry + healthcheck | **P1** — alerta se nenhum resultado novo 30 min após horário previsto |
| Fila travada | BullMQ + dashboard | Alerta se fila > 1000 itens ou job > 5 min |
| Latência de conferência | Métrica custom | Alerta se p95 > 5 min |
| Funil de produto | PostHog | Dashboards de ativação, paywall, conversão |
| Financeiro | Backoffice | MRR, churn, falhas de cobrança |
| Custo de IA | Métrica custom por usuário | Alerta se usuário > 3× a média |
| Uptime | Better Stack / UptimeRobot | Página de status pública |

---

## 6.12 Ambientes e deploy

| Ambiente | Branch | Infra | Dados |
|---|---|---|---|
| `local` | — | Docker Compose (Postgres + Redis) | Seed sintético |
| `preview` | PR | Vercel Preview + Neon branch | Cópia anonimizada |
| `staging` | `develop` | Projeto separado | Anonimizado |
| `production` | `main` | Produção | Real |

**Pipeline (GitHub Actions):**
`lint → typecheck → test:unit → build → test:e2e (staging) → migrate → deploy`

**Migrations:** `prisma migrate deploy` em step separado, antes do deploy da app.
Toda migration precisa ser **backward-compatible** com a versão anterior da aplicação (expand/contract).

**Backup:** Neon PITR (7 dias) + dump diário para R2 com retenção de 30 dias.
**Teste de restore obrigatório antes do GA** (Sprint 8).

---

## 6.13 Performance

| Alvo | Meta |
|---|---|
| Landing — LCP | < 1,5 s (SSG + ISR) |
| Landing — Lighthouse | ≥ 95 em Performance, Acessibilidade, SEO |
| Painel — TTI | < 2,5 s |
| tRPC p95 | < 300 ms |
| Conferência em lote | 100k apostas < 60 s |
| Consulta de estatística (500 concursos) | < 500 ms (materialized view) |

**Estratégias:** RSC para reduzir JS no cliente; ISR na landing; índices compostos nas queries quentes;
materialized views para estatísticas (refresh após cada concurso); cache Redis para resultado de concurso
(TTL infinito, invalidação por evento).

---

## 6.14 O que ficou de fora (e por quê)

| Não faremos no MVP | Motivo |
|---|---|
| App nativo (React Native) | PWA cobre push e instalação; custo/benefício ruim antes do product-market fit |
| Microserviços | Complexidade sem ganho nesta escala |
| Kubernetes | Idem. Railway/Vercel resolvem |
| GraphQL | tRPC entrega tipagem melhor com menos código para consumidor interno |
| Event sourcing | Overkill; `audit_logs` + `bet_checks` imutáveis bastam |
| Multi-região | Público 100% Brasil |

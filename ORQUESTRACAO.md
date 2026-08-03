# ORQUESTRACAO.md — Estado da implementação e roteiro de sessões

> Atualizado a cada sessão. **Fonte da verdade sobre o que está feito e o que vem a seguir.**
> Modelos por demanda: [docs/11-guia-de-modelos-ia.md](docs/11-guia-de-modelos-ia.md).

## Protocolo (comprovado em 3 sessões)

- Ondas de subagentes; 1 agente = 1 território disjunto; contratos compartilhados escritos ANTES pelo
  orquestrador (types.ts congelado; contrato Asaas idêntico nos 2 prompts funcionou).
- Opus → arquitetura/algoritmos/dinheiro/segurança · Sonnet → implementação · Haiku → mecânico.
- Orquestrador: lockfile, schema Prisma, costura, wiring, commits por onda.
- Agente morto (watchdog OU limite de sessão) → retomar via SendMessage com lista cirúrgica.
  **Funcionou 5/5 vezes** (2 watchdog na S1, 3 limite de sessão na S3).
- Arquivo compartilhado (ex.: `_app.ts`) tem UM dono por onda; os demais entregam a linha
  de registro no relatório.
- ⚠️ Shadow database do Prisma NUNCA aponta para banco com dado (lição S3: wipe recuperado
  em 2 min porque migrations+seed+smoke são scriptados).

---

## ✅ SESSÃO 1 (Ondas 1–2) · ✅ SESSÃO 2 (Ondas 3a–3b) · ✅ SESSÃO 3 (Passo 0 + Ondas 5–6)

**Estado atual: 555 testes verdes (214 core · 6 db · 186 integrations · 64 worker · 85 web),
typecheck exit 0 nos 6 pacotes, 260 arquivos, 13 commits.**
Últimos: `c8b9edf` (passo 0), `50500b3`/`cadfe0e` (ondas 5–6).

### O que existe e funciona

| Área | Estado |
|---|---|
| Domínio (`core`) | 11 modalidades config-driven, validação, preço combinatório, conferência com decomposição multi-faixa, rateio exato, **entitlements G1–G10** |
| Dados (`db`) | Schema completo + auth + dedupe UNIQUE; 2 migrations; seed idempotente; teste de consistência seed↔core; **agendas confirmadas** (7 modalidades de domingo: Mega, Lotofácil, Quina, +Milionária, Timemania, Dia de Sorte, Federal) |
| Integrações | Caixa (parser + resiliente + fixtures reais + sanitização NUL), **Asaas** (cliente completo, webhook, dinheiro exato), Resend, **WebPush VAPID** |
| Worker | sync janelas dinâmicas → check-bets idempotente → notify (email real, push real, quiet hours, dedupe por UNIQUE) + accumulated-alert + **billing-dunning D+1/3/5/7** |
| Web (app) | Auth completo, Meus Jogos (4 telas), dashboard, **carteira ROI honesto**, resultados, **paywall G1/G7 com PaywallDialog**, conta⁽ᵖ⁾ |
| Web (billing) | plans/subscribe/changePlan/cancel/trial + **webhook Asaas fail-closed idempotente** |
| Web (marketing) | Home real, planos, recursos, **resultados públicos ISR (SEO)**, **conferidor sem login**, FAQ, legais⁽ʳᵉᵛ ᵖᵉⁿᵈ⁾, sitemap/robots |
| Infra dev | docker-compose (PG+Redis), .env com VAPID real, 11 concursos reais sincronizados |

⁽ᵖ⁾ = parcial · O produto está a um passo do MVP técnico: falta o BACKOFFICE.

### Pendências (fila da Sessão 4, em ordem)

| # | Pendência | Dono |
|---|---|---|
| P1 | **Backoffice v1** (Onda 7 — não coube na S3): BO-01..BO-50 P0 | Sonnet + Opus (RBAC/audit) |
| P2 | Schema billing: `gatewayCustomerId`, `pendingPlanId`, `SubStatus.PENDING`, `Invoice.invoiceUrl` (workarounds documentados em server/lib/billing) + migration | Orquestrador + Sonnet |
| P3 | Telas de conta/assinatura (`/app/conta/**` — CTAs do paywall já apontam para lá) + PaywallDialog no detalhe do jogo | Sonnet |
| P4 | `notify.ts`: templates billing.* (hoje fallback) + tratar `gone:` do push (deletar subscription) + campo tipado `shouldDeleteSubscription` no contrato PushSender | Sonnet |
| P5 | Registro de PushSubscription no cliente (service worker + prompt do PWA) — sem isso push real não tem destinatário | Sonnet |
| P6 | LP-05/06 (recursos/conferencia, fechamentos), LP-15 status page | Sonnet/Haiku |
| P7 | Onboarding guiado completo (CL-05), edição de dezenas (CL-15), busca por data (CL-71), `?concurso=` na listagem | Sonnet |
| P8 | Dunning: pró-rata de upgrade; extrair `resolveScheduledPlanSlug`/ciclo duplicados p/ `packages/core/billing` | Sonnet |
| P9 | Docs drift: docs/08 SY-13 diz "HMAC" (Asaas usa token em header); docs/07 BetCheck sem tierCounts; Tailwind v3 vs doc | Haiku |
| P10 | Backfill histórico completo (~7h, job noturno) — caminho validado | Guilherme dispara |
| P11 | Contas reais: Asaas sandbox (ASAAS_API_KEY/WEBHOOK_TOKEN), Resend (RESEND_API_KEY) — placeholders no .env | **Guilherme** |
| P12 | Teste de entitlements cross-package → mover p/ db; G11/G12 (IA) em docs/05 | Haiku |

---

## SESSÃO 4 — roteiro

**Prompt de retomada:**
> Leia ORQUESTRACAO.md e CLAUDE.md. Execute a Sessão 4: P2 (migration billing, inline) → Onda 7
> (backoffice, 2 agentes) ∥ Onda 7b (P3+P4+P5, 2 agentes) → checkpoint → se houver orçamento,
> Onda 8 (gerador+fechamentos). Mesmo protocolo.

**Onda 7 — Backoffice (2 agentes):**
| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| admin-core | `(admin)` + routers admin | Sonnet, RBAC revisado **Opus** | KPIs+funil (BO-01..05 com saúde do sistema), usuários (BO-10..15), auditoria transversal |
| admin-ops | `(admin)` (páginas distintas) + routers | Sonnet | Apostas+reprocesso (BO-20/21), financeiro (BO-30..36), config de modalidades (BO-40..42), suporte (BO-50) |

**Onda 7b (paralela) — Fechamento do ciclo do usuário (2 agentes):**
| Agente | Área | Entrega |
|---|---|---|
| conta | `(app)/app/conta/**` | P3: perfil, assinatura (usa billing.*), preferências, LGPD export/delete (CL-100..110) |
| push-client | `(app)` service worker + `apps/worker` notify | P4+P5: registro de PushSubscription, prompt PWA, templates billing, tratamento `gone:` |

**Onda 8 — Gerador e fechamentos (Épico 9)** — se couber; senão S5.
**Depois:** Onda 9 ★ Bolão Manager (Épico 10) → Onda 10 OCR/IA → Onda 11 hardening/GA.

## 🚀 PRODUÇÃO — no ar desde 03/08/2026

**https://loteria.iauai.online** · VPS `76.13.172.16` · diretório `/opt/lotopro`
Traefik compartilhado: rede `proxy-network`, certresolver `myresolver`, entrypoint `websecure`.
Certificado Let's Encrypt válido até **01/11/2026**.

Serviços: `postgres`, `redis`, `web`, `worker` (+ `migrate` one-shot antes dos demais).
Atualizar: `cd /opt/lotopro && git pull && docker compose -f docker-compose.prod.yml up -d --build`.

### Bugs de produção corrigidos durante o deploy

Nenhum destes aparecia em desenvolvimento — só o container/VPS os revelou.

| # | Bug | Causa raiz |
|---|---|---|
| 1 | `next build` falhava | `tailwind.config.ts` importava o índice do `@lotopro/ui`; o jiti não resolve JSX |
| 2 | Prisma quebrava em runtime | faltava `binaryTargets = debian-openssl-3.0.x` **e** o binário `openssl` na imagem (o Prisma o usa para detectar a libssl) |
| 3 | build exigia banco no ar | páginas públicas consultavam Prisma sem guard → build quebrava sem DB |
| 4 | worker em crash-loop | `z.string().min(1).optional()` rejeita string vazia, e o compose injeta `${VAR:-}` sempre |
| 5 | **API da Caixa responde 403 de IP de datacenter** | bloqueio por origem (não por header) → criado `CaixaMirrorProvider` como fallback. É o risco RT2 do doc 01, cuja mitigação já estava projetada |
| 7 | **cadastro 100% quebrado** | `User.tenantId` e FK obrigatoria e o Better Auth nao a preenchia (`input:false`, sem default) -> todo signup falhava com "Argument tenant is missing". Resolvido no hook `create.before` |
| 6 | web sem engine do Prisma | `output: standalone` não rastreia `.so.node` → cópia para caminho fixo + `PRISMA_QUERY_ENGINE_LIBRARY` |

### Contas de teste (criadas em 03/08/2026)

| Perfil | E-mail | Senha | Acesso |
|---|---|---|---|
| Cliente | `cliente@teste.com` | `Teste@2026` | `/app` ✅ · `/admin` bloqueado (redirect) |
| Administrador | `admin@teste.com` | `Admin@2026` | `/app` ✅ · `/admin` ✅ |

Ambas com `emailVerified = true` (verificação por e-mail pulada — sem Resend configurado).
O admin foi promovido por SQL: `update "User" set role='ADMIN' where email='admin@teste.com'`.
⚠️ São contas de **teste**. Trocar as senhas ou removê-las antes de qualquer uso real.

Recriar do zero (se o banco for resetado):
```bash
curl -X POST https://loteria.iauai.online/api/auth/sign-up/email -H "Content-Type: application/json" \
  -d '{"email":"cliente@teste.com","password":"Teste@2026","name":"Cliente Teste","isAdult":true}'
# depois promover o admin com o UPDATE acima
```

### Pendências de produção

- **P-prod-1** — sem `RESEND_API_KEY` real: e-mails não são enviados (placeholder no `.env`).
- **P-prod-2** — sem `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`: billing inativo; o worker loga aviso e não registra o dunning.
- **P-prod-3** — sem `GOOGLE_CLIENT_ID/SECRET`: login social indisponível (e-mail/senha funciona).
- **P-prod-4** — backfill histórico não rodado: só os 11 concursos mais recentes. O espelho tem rate limit; exige throttle maior que o do provider oficial.
- **P-prod-5** — o espelho é serviço de terceiro sem SLA. Se a Caixa mantiver o bloqueio por origem, avaliar proxy próprio fora de datacenter.
- **P-prod-6** — páginas ISR nascem "vazias" a cada rebuild (build sem banco) e só se preenchem na revalidação (≤5 min). Aceitável; se incomodar, criar rota de revalidação sob demanda e chamá-la no fim do deploy.

## Ambiente local

```bash
docker compose up -d && pnpm -F @lotopro/db seed
DATABASE_URL=postgresql://lotopro:lotopro@localhost:5432/lotopro pnpm -F @lotopro/worker exec tsx src/scripts/smoke-sync.ts
pnpm -r typecheck && pnpm -r test   # 555 testes
```

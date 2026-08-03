# ORQUESTRACAO.md — Estado da implementação e roteiro de sessões

> Atualizado a cada sessão. **Fonte da verdade sobre o que está feito e o que vem a seguir.**
> Modelos por demanda: [docs/11-guia-de-modelos-ia.md](docs/11-guia-de-modelos-ia.md).

## Protocolo (comprovado em 4 sessões, 25+ agentes)

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

## 📌 LEIA PRIMEIRO — estado em 03/08/2026

**Produção no ar:** https://loteria.iauai.online (ver seção PRODUÇÃO abaixo).
**Repositório:** `git@github.com:guimendesti/loteria.git` (branch `main`).
**Testes:** 627 verdes (160 core · 60 db · 195 integrations · 71 worker · 141 web) · typecheck exit 0.
**Backoffice `/admin` funcionando em produção** (RBAC validado autenticado). Contas de teste: ver PRODUÇÃO.

**Skills do projeto** (`.claude/skills/`) — conhecimento destilado, reaproveitável:
`deploy-monorepo-vps` (7 bugs de container/Traefik/Prisma já diagnosticados) ·
`orquestracao-ondas` (protocolo de subagentes + escolha de modelo) ·
`loterias-caixa-br` (domínio: API, bloqueios, cálculo, limites jurídicos).

**Sessão 4 (03/08) entregou:** backoffice completo (RBAC + auditoria + dashboard + usuários +
apostas/reprocesso + financeiro + config + suporte), área de conta do cliente (perfil, assinatura,
LGPD, cripto da chave Pix), push no cliente (SW + opt-in + limpeza de subscription morta),
templates de billing, correção de drift dos docs, página de status.

---

## ✅ SESSÃO 1 (Ondas 1–2) · ✅ SESSÃO 2 (Ondas 3a–3b) · ✅ SESSÃO 3 (Passo 0 + Ondas 5–6) · ✅ SESSÃO 4 (Onda 7)

Histórico das sessões 1–3 (fundação → apostas → monetização/landing). O estado consolidado
está na seção da Sessão 4, logo abaixo.

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

⁽ᵖ⁾ = parcial na S3; **completado na S4**.

### ✅ SESSÃO 4 (03/08) — Onda 7 + revisão de segurança

**627 testes verdes** (160 core · 60 db · 195 integrations · 71 worker · 141 web).
Commits: `0bfb043` (docs+db), `1831e6f` (onda 7), `+` correções de segurança, `+` fix do provider.

| Entrega | Estado |
|---|---|
| **Backoffice completo** | RBAC 2 níveis (rank + permissões finas), auditoria em toda mutation, dashboard com saúde do sistema, usuários com LGPD, apostas + **reprocessamento idempotente**, financeiro (MRR, faturas, replay de webhook), config de modalidades, suporte |
| **Conta do cliente** | perfil, assinatura, notificações, privacidade (export + anonimização em transação), cripto AES-256-GCM da chave Pix |
| **Push no cliente** | service worker, opt-in, deleção de subscription morta (404/410), templates de billing |
| **Skills** | `.claude/skills/`: deploy-monorepo-vps, orquestracao-ondas, loterias-caixa-br |

**Revisão adversarial (Opus) — 3 falhas ALTAS exploráveis, todas corrigidas:**
1. Escalada lateral SUPPORT⇄FINANCE (FINANCE podia apagar conferências de todos; SUPPORT mexia em cobrança) — permissões finas + testes de regressão.
2. `exportData` vazava `ownerPixKeyEnc` e **`inviteCode`** (credencial viva de entrada no bolão).
3. `anonymize` gravava e-mail/nome originais no `AuditLog`, que é legível → anonimização inefetiva (LGPD art. 16/18).

Mais 2 médias corrigidas pelo orquestrador: envs faltando no serviço `web` do compose
(`ENCRYPTION_KEY` → chave Pix nasceria morta) e auto-anonimização com lockout irreversível.
**Nenhum achado CRÍTICO** — nenhum CUSTOMER alcança o backoffice.

**Bug de produção #8** (só aparece implantado): `(admin)/layout.tsx` sem `TRPCReactProvider` →
**todas** as páginas de admin davam 500 (`Unable to find tRPC Context`). Typecheck e 627 testes
passavam. Reforça a regra: validar no ambiente real, autenticado, página por página.

### Pendências (fila da Sessão 5, em ordem)

| # | Pendência | Dono |
|---|---|---|
| P1 | **Bolão Manager** (Épico 10) — o diferencial central do produto, ainda não implementado. Onda dedicada: schema/rateio/Pix EMV/cripto com **Opus**, fluxos com Sonnet. Testar QR em 4+ bancos | Opus + Sonnet |
| P2 | **Gerador + fechamentos** (Épico 9): matrizes de garantia com verificação exaustiva offline | Opus + Sonnet |
| P3 | Achados MÉDIOS da revisão de segurança, reportados e não corrigidos: (a) `reprocessChecks` apaga BetCheck de apostas arquivadas e não recria (assimetria → perda de conferência); (b) `deleteAccount` não limpa `passwordHash` nem reseta role; (c) `push.subscribe` reatribui userId por endpoint; (d) `fixContest` não valida dezenas contra o universo da modalidade; (e) AuditLog sem ip/userAgent (contexto tRPC não expõe headers); (f) AdminNav não filtra itens por papel | Sonnet |
| P4 | `User.blockedAt` no schema — hoje `toggleBlock` só revoga sessões e retorna `implemented:false` (honesto, mas incompleto) | Orquestrador + Sonnet |
| P5 | `billing-dunning.ts` enfileira título inline divergente do doc → push/in-app mostram texto antigo; só o e-mail usa o template novo | Sonnet |
| P6 | Extrair a reconstrução de ContestResult (duplicada entre `worker/check-bets` e `admin/bets`) para `packages/core` | Sonnet |
| P7 | `billing.invoices.list` não seleciona `invoiceUrl` (coluna já existe) → sem link de download; falta mutation de troca de meio de pagamento (CL-107) | Sonnet |
| P8 | OCR + assistente IA (Épico 11) — prompts/guardrails com Opus, teste adversarial obrigatório | Opus + Sonnet |
| P9 | Hardening/GA (Épico 12): LGPD final, PWA, acessibilidade, teste de carga, restore de backup | Sonnet |
| P10 | Backfill histórico (~25k concursos) — espelho tem rate limit, exige throttle maior | Guilherme dispara |
| P11 | **Contas reais**: Resend (e-mail), Asaas sandbox (billing), Google OAuth — placeholders no .env de produção | **Guilherme** |
| P12 | Trocar/remover as contas de teste antes de uso real | **Guilherme** |

---

## SESSÃO 5 — roteiro

**Prompt de retomada (colar no Claude Code):**
> Leia ORQUESTRACAO.md e CLAUDE.md (as skills em .claude/skills/ trazem o protocolo e as lições).
> Execute a Sessão 5: Onda 8 = ★ Bolão Manager (P1), o diferencial central do produto.
> Mesmo protocolo: contratos antes de paralelizar, territórios disjuntos, commit por onda,
> checkpoint com revisão adversarial em Opus, deploy e validação autenticada em produção.

**Onda 8 — ★ Bolão Manager (Épico 10), o wedge do produto:**

| Agente | Território | Modelo | Entrega |
|---|---|---|---|
| pool-core | `packages/core/src/pool` + testes | **Opus** | Rateio já existe; faltam cotas/estados e o **payload Pix EMV (CRC16 + TLV)** — testar QR em 4+ bancos |
| pool-api | `apps/web/src/server/routers/pool.ts` + lib | **Opus** (dinheiro/cripto) | CRUD, convite, registro de pagamento P2P, rateio, recibo com hash |
| pool-ui | `apps/web/src/app/(app)/app/boloes/**` | Sonnet | Fluxos de organizador e participante (máx. 5 telas do convite ao "já paguei") |
| pool-public | `(marketing)/bolao/[codigo]` + `(auth)` | Sonnet | Página pública do convite + cadastro curto (AU-07) — **motor de viralidade** |

⚠️ Invioláveis do bolão (CLAUDE.md, docs/03): zero custódia; Pix P2P participante→organizador;
bolão privado por convite (sem diretório público); banner de não-responsabilidade em toda tela.

**Depois:** Onda 9 gerador+fechamentos (P2) · Onda 10 OCR+IA (P8) · Onda 11 hardening/GA (P9).

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

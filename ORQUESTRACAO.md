# ORQUESTRACAO.md — Estado da implementação e roteiro de sessões

> Atualizado a cada sessão. **Fonte da verdade sobre o que está feito, em andamento e o que vem a seguir.**
> Modelos por demanda: ver [docs/11-guia-de-modelos-ia.md](docs/11-guia-de-modelos-ia.md).

## Protocolo de orquestração

- Trabalho paralelizado em **ondas** de subagentes; cada agente é dono de um diretório disjunto.
- Opus 5 → arquitetura/algoritmos/segurança · Sonnet 5 → implementação padrão · Haiku 4.5 → mecânico.
- O orquestrador faz: scaffold, contratos, `pnpm install` (lockfile é EXCLUSIVO dele), integração,
  revisão, commits (1 por onda). Subagentes NUNCA rodam `pnpm install/add` nem saem do próprio diretório.
- `packages/core/src/types.ts` é o **contrato congelado** — mudanças só pelo orquestrador.
- Se um agente estagnar (watchdog 600s), retomá-lo via SendMessage com lista cirúrgica do que falta
  ("não re-leia o que está pronto") — funcionou 2/2 vezes na Sessão 1.

---

## ✅ SESSÃO 1 — 02/08/2026 (concluída)

**Resultado: Ondas 1 e 2 completas. Repositório 100% verde — 6 pacotes typecheck OK, 234 testes.**
Commits: `4ea5acb` (wave-1), `d5a6e38` (wave-2).

| Entrega | Estado |
|---|---|
| Monorepo pnpm + tsconfig + contrato de domínio (`packages/core/src/types.ts`) | ✅ |
| `packages/core` — 11 configs, validação, preço combinatório BigInt, conferência (todas as faixas), rateio exato | ✅ 131 testes |
| `packages/db` — schema Prisma (25 models + models de auth), seeds, teste de consistência seed↔core | ✅ validate+generate+4 testes |
| `packages/integrations` — parser Caixa (fixtures REAIS de 02/08), provider resiliente, circuit breaker | ✅ 84 testes |
| `packages/ui` — tokens, NumberBall, NumberGrid (teclado+ARIA), Badge | ✅ typecheck |
| `apps/web` — shell Next.js 15: marketing (9 seções + disclaimer legal), auth (Better Auth + Google + maioridade), (app)/(admin) protegidos, tRPC v11 | ✅ typecheck |
| `apps/worker` — BullMQ: sync com janelas quentes/frias, check-bets idempotente em lote, notify in-app, health, DI testável | ✅ 15 testes |

**Descoberta importante:** a API da Caixa responde 200 com `fetch` nativo do Node — o risco de TLS
(doc 01) era específico do curl. Validação em Linux continua pendente, mas o risco caiu muito.

**Custo de orquestração da sessão:** ~1,25M tokens de subagentes (7 execuções + 2 retomadas) + orquestrador.

### Pendências acumuladas (fila da Sessão 2, em ordem)

| # | Pendência | Dono | Quando |
|---|---|---|---|
| P1 | **Banco real**: docker-compose (Postgres+Redis), `prisma migrate dev`, seed, smoke do backfill | Orquestrador (inline) | S2 início |
| P2 | **Contrato v2** (orquestrador): `DrawSchedule` com horário POR DIA (domingo 11h vs semana 20h) + `tierCounts` no `CheckOutcome` (aposta múltipla premia em várias faixas — hoje só reporta a faixa agregada) + propagar em core/worker | **Opus** | S2 onda 3 |
| P3 | Cadastro: gravar `termsAcceptedAt` (coluna criada) no signUp; hoje o aceite é só client-side | web (Sonnet) | S2 |
| P4 | `Notification` sem chave de idempotência → retry duplica linhas | worker (Sonnet) | S2 |
| P5 | Providers de fallback da Caixa (mirror self-hosted / terceiro) — só a interface existe | integrations (Sonnet) | S3 |
| P6 | Confirmar QUAIS 7 modalidades migraram para domingo (hoje: só Mega marcada) | Pesquisa rápida | S2 |
| P7 | Better Auth busca email sem tenant — seguro com tenant único; rever no white-label | — | Fase 3 |
| P8 | Web usa Tailwind **3.4** (docs dizem v4) — decidir: migrar ou atualizar doc 06 | Decisão | S2 |
| P9 | Validar API Caixa em Linux (`src/caixa/smoke.ts`) quando houver ambiente | — | Deploy |
| P10 | `passwordHash` no User ficou legado (Better Auth usa Account.password) — remover na próxima migration de limpeza | — | S3 |

---

## SESSÃO 2 — roteiro (5h)

**Prompt de retomada (colar no Claude Code):**
> Leia ORQUESTRACAO.md e CLAUDE.md. Execute a Sessão 2: primeiro P1 e P2 (inline/Opus), depois as
> ondas 3 e 4 com os modelos indicados, mesmo protocolo (paralelo + checkpoint + commit por onda +
> atualizar ORQUESTRACAO.md ao final, reservando 15 min).

**Passo 0 (orquestrador, inline):** P1 (banco+migrations+seed+backfill smoke) e P2 (contrato v2).
P6 na pesquisa do P2. ~45 min.

**Onda 3 — Apostas ponta a ponta (3 agentes paralelos):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| api-bets | `packages/api` (novo) + wiring em apps/web/src/server | Sonnet | Routers tRPC de apostas: CRUD com validação do core, multi-concurso, custo, listagem com filtros/agrupamento (CL-10..17, CL-21) — o pacote novo exige que o ORQUESTRADOR crie package.json + install ANTES |
| ui-bets | `apps/web/src/app/(app)` | Sonnet | Telas Meus Jogos: seletor com NumberGrid + campos extras, listagem, detalhe com conferências, dashboard CL-01..04 real (dados via tRPC) |
| entitlements | `packages/core/entitlements` + middleware | **Opus** | Módulo entitlements (docs/05 §5.2) + middleware tRPC + usage_counters atômicos + testes |

**Onda 4 — Notificações e carteira (2 agentes, após onda 3):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| notify-channels | `apps/worker` + `packages/integrations/resend` | Sonnet | React Email templates, Web Push VAPID, preferências/quiet hours, idempotência (P4), alerta de acumulado (NT-01..06) |
| wallet | `apps/web` | Sonnet | Carteira CL-90..93 (gasto/prêmio/ROI honesto) + telas de resultados CL-70..75 |

**Meta da S2:** usuário cadastra jogo → worker sincroniza concurso real → conferência → notificação.
Épicos 1–5 substancialmente completos. Commit por onda + atualizar este arquivo.

---

## SESSÃO 3 — roteiro (5h)

**Mesmo prompt de retomada.**

**Onda 5 — Monetização:** asaas (`packages/integrations/asaas`, **Opus** — assinatura, Pix Automático,
webhook HMAC+idempotência) ∥ billing-ui (apps/web, Sonnet — checkout, PaywallDialog + G1–G10, trial).
**Onda 6 — Landing/SEO (paralela à 5):** landing (Sonnet — home real, planos, FAQ, legais,
resultados públicos LP-07 com ISR, conferidor público LP-08).
**Onda 7 — Backoffice v1:** admin (Sonnet; RBAC/audit com revisão **Opus**) — BO-01..BO-50 P0.

**Meta da S3: MVP técnico** (marco M5, exceto beta com usuários reais e parecer jurídico).

## Ondas futuras (S4+)

Onda 8: gerador+fechamentos (Épico 9) · Onda 9: ★ Bolão Manager (Épico 10, Pix EMV com Opus) ·
Onda 10: OCR+IA (Épico 11) · Onda 11: hardening/GA (Épico 12).

## Riscos operacionais da orquestração

| Risco | Mitigação |
|---|---|
| Sessão estoura no meio de onda | Commit por onda; agentes estagnados retomam via SendMessage com contexto |
| Agente estagna (watchdog 600s) | Retomar com lista cirúrgica do que falta — comprovado na S1 |
| Divergência de contrato | types.ts congelado; teste de consistência seed↔core pegou 11 divergências na S1 |
| Lockfile | Só o orquestrador instala; pacote novo = orquestrador cria package.json + install ANTES da onda |

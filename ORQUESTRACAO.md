# ORQUESTRACAO.md — Estado da implementação e roteiro de sessões

> Atualizado a cada sessão. **Fonte da verdade sobre o que está feito, em andamento e o que vem a seguir.**
> Modelos por demanda: ver [docs/11-guia-de-modelos-ia.md](docs/11-guia-de-modelos-ia.md).

## Protocolo de orquestração

- Trabalho paralelizado em **ondas** de subagentes, cada agente dono de um diretório disjunto (zero conflito).
- Opus 5 → arquitetura/algoritmos/segurança · Sonnet 5 → implementação padrão · Haiku 4.5 → mecânico.
- O orquestrador (sessão principal) faz: scaffold, contratos compartilhados, integração entre pacotes,
  revisão, commits. Subagentes nunca tocam em arquivos fora do próprio pacote.
- `packages/core/src/types.ts` é o **contrato congelado** — mudanças só pelo orquestrador.
- Regra de commit: 1 commit por onda concluída, mensagem `feat(wave-N): ...`.

---

## SESSÃO 1 — 02/08/2026 (esta)

**Budget:** iniciada com 24% consumido; ~3h45 restantes.

### Feito inline (orquestrador)
- [x] Git init + commit da documentação
- [x] Scaffold do monorepo (pnpm workspaces, tsconfig base, 4 pacotes)
- [x] **Contrato de domínio** `packages/core/src/types.ts` (congelado)
- [x] `pnpm install` raiz (deps de todos os pacotes)

### Onda 1 — em execução (4 agentes paralelos)

| Agente | Pacote | Modelo | Entrega |
|---|---|---|---|
| core-engines | `packages/core` | **Opus** | 11 configs de modalidade, validação, preço (combinatória BigInt), conferência (todas as faixas, Dupla Sena 2 sorteios, Lotomania 0 acertos, +Milionária trevos), rateio de bolão com resto exato, testes Vitest |
| db-schema | `packages/db` | Sonnet | Schema Prisma completo (doc 07), seeds das 11 modalidades + planos + preços/faixas, prisma validate |
| caixa-integration | `packages/integrations` | **Opus** | Schema Zod do payload, parser (float→centavos, DD/MM/AAAA→ISO), provider com timeout/retry/erro TLS tipado, ResilientProvider com circuit breaker, testes com fixtures |
| ui-kit | `packages/ui` | Sonnet | tokens.css/ts, NumberBall (estados + ícone, não só cor), NumberGrid (teclado + ARIA grid + aria-live), Badge |

### Onda 2 — planejada para esta sessão SE o budget permitir (senão → Sessão 2)

| Agente | Pacote | Modelo | Entrega |
|---|---|---|---|
| web-scaffold | `apps/web` | Sonnet | Next.js 15 + route groups (marketing/auth/app/admin) + Better Auth (e-mail/senha + Google) + tRPC wiring + layouts shell |
| worker-scaffold | `apps/worker` | Sonnet | BullMQ + Redis config, cron `sync-results` (janelas dinâmicas), job `check-bets` esqueleto consumindo core+integrations, healthcheck |

**Critério de decisão:** lançar Onda 2 somente se, ao fim da Onda 1, o consumo estimado da sessão
estiver abaixo de ~75%. Caso contrário, parar, commitar, e a Onda 2 abre a Sessão 2.

### Fim de sessão (obrigatório, reservar ~15 min)
- [ ] `pnpm -r typecheck && pnpm -r test` — estado verde ou pendências anotadas abaixo
- [ ] Commit(s) da(s) onda(s)
- [ ] Atualizar este arquivo (marcar feito, anotar pendências)

### Pendências desta sessão
_(preencher ao final)_

---

## SESSÃO 2 — roteiro (5h, começar colando o prompt abaixo)

**Prompt de retomada (colar no Claude Code):**
> Leia ORQUESTRACAO.md e CLAUDE.md. Execute a Sessão 2: resolva primeiro as pendências listadas,
> depois lance as ondas na sequência descrita, com os modelos indicados, controlando o budget como
> na Sessão 1 (ondas paralelas + checkpoint entre elas + commit por onda + atualização deste arquivo
> no final).

**Onda 2 (se não rodou na S1)** — web-scaffold + worker-scaffold (paralelos, Sonnet).

**Onda 3 — Apostas ponta a ponta (após Onda 2, pois depende de web+db):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| trpc-bets | `packages/api` + telas em `apps/web/(app)` | Sonnet | Routers de apostas (CRUD, multi-concurso, custo), telas Meus Jogos (CL-10..CL-22) usando NumberGrid, dashboard CL-01..04 |
| checking-pipeline | `apps/worker` | **Opus** | Pipeline completo §6.7: evento contest.settled → check-bets em lote idempotente → notificações in-app; testes de integração com SQLite/PG em Docker se disponível |
| entitlements | `packages/core/entitlements` + middleware | **Opus** | Módulo de entitlements (doc 05 §5.2) + middleware tRPC + usage_counters |

**Onda 4 — Notificações e carteira (paralela à 3 na segunda metade):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| notify | `apps/worker` + `packages/integrations/resend` | Sonnet | Templates React Email, Web Push VAPID, job notify com preferências/quiet hours (NT-01..NT-06) |
| wallet | `apps/web` | Sonnet | Carteira CL-90..93 + widget dashboard |

**Fim da S2:** typecheck/test verdes, commit, atualizar este arquivo.
Meta da S2: **Épicos 1–5 substancialmente completos** (fundação + núcleo + apostas + notificações + carteira).

---

## SESSÃO 3 — roteiro (5h)

**Mesmo prompt de retomada.**

**Onda 5 — Monetização (sequencial-crítica, Opus na frente):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| asaas | `packages/integrations/asaas` | **Opus** | Cliente Asaas (assinatura, Pix Automático, cartão), webhook HMAC+idempotência (M-03..M-05) |
| billing-ui | `apps/web` | Sonnet | Checkout, planos, upgrade/downgrade, PaywallDialog + gatilhos G1–G10, trial (M-06..M-10) |

**Onda 6 — Landing e SEO (paralela à 5):**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| landing | `apps/web/(marketing)` | Sonnet | Home (9 seções), planos, FAQ, páginas legais (copy revisar depois com Opus), resultados públicos LP-07 com ISR, conferidor público LP-08 |

**Onda 7 — Backoffice v1:**

| Agente | Área | Modelo | Entrega |
|---|---|---|---|
| admin | `apps/web/(admin)` | Sonnet | KPIs, saúde do sistema, usuários, reprocessar conferência, financeiro, RBAC+audit (B-01..B-09; RBAC com revisão Opus) |

**Fim da S3:** estado = MVP técnico (marco M5 exceto beta com usuários reais e parecer jurídico).

---

## Backlog de ondas futuras (S4+)

- Onda 8: Gerador + fechamentos (Opus para motor/matrizes, Sonnet UI) — Épico 9
- Onda 9: ★ Bolão Manager (Opus: schema/rateio/Pix EMV/cripto; Sonnet: fluxos) — Épico 10
- Onda 10: OCR + IA (Opus: prompts/guardrails; Sonnet: UI) — Épico 11
- Onda 11: Hardening/GA — Épico 12

## Riscos operacionais da orquestração

| Risco | Mitigação |
|---|---|
| Sessão estoura no meio de uma onda | Agentes commitam nada; orquestrador commita por onda. Se estourar, a onda re-roda na sessão seguinte (trabalho dos agentes fica no working tree — commitar o que estiver verde) |
| Agentes divergem do contrato | types.ts congelado; orquestrador revisa diffs antes do commit |
| Conflito de arquivos | 1 agente = 1 diretório; lockfile só é tocado pelo orquestrador |
| DATABASE_URL ausente | Prisma validate (sem migrate) até existir banco; anotar como pendência |

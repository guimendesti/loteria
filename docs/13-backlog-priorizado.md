# 13 — Backlog Priorizado

Formato: `[ID] Título — estimativa em pontos (1pt ≈ 2h) · sprint · modelo recomendado`
Prioridade: **P0** MVP · **P1** pós-MVP · **P2** fase 3.

---

## ÉPICO 1 — Fundação (S0) · 26 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| F-01 | Monorepo Turborepo + pnpm + tsconfig/eslint/prettier compartilhados | 3 | Sonnet 5 | P0 |
| F-02 | Next.js 15 com os 4 route groups e layouts | 3 | Sonnet 5 | P0 |
| F-03 | Prisma + Docker Compose (Postgres+Redis) + primeira migration | 2 | Sonnet 5 | P0 |
| F-04 | tRPC: contexto, middleware de auth, middleware de entitlement | 4 | **Opus 5** | P0 |
| F-05 | Better Auth: e-mail/senha, Google, verificação, recuperação (AU-01 a AU-06) | 5 | Sonnet 5 | P0 |
| F-06 | Design system: tokens, Tailwind v4, shadcn/ui base | 3 | Sonnet 5 | P0 |
| F-07 | Componentes `NumberBall` e `NumberGrid` com acessibilidade | 3 | Sonnet 5 | P0 |
| F-08 | CI/CD GitHub Actions + 3 ambientes | 2 | Sonnet 5 | P0 |
| F-09 | Sentry + PostHog | 1 | Haiku 4.5 | P0 |

---

## ÉPICO 2 — Núcleo de loterias (S1) · 42 pts ⚠️ maior risco técnico

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| N-01 | Schema: lotteries, contests, price_tiers, prize_tiers, contest_prizes | 4 | **Opus 5** | P0 |
| N-02 | `core/lottery`: motor configurável, validação de aposta, precificação | 6 | **Opus 5** | P0 |
| N-03 | Seeds das 11 modalidades + preços 2026 + faixas de premiação | 4 | Sonnet 5 | P0 |
| N-04 | `CaixaOfficialProvider` + **validação de TLS em Linux** ⚠️ | 4 | **Opus 5** | P0 |
| N-05 | `ResilientResultProvider` com fallback e circuit breaker | 3 | Opus 5 | P0 |
| N-06 | Worker + BullMQ + Redis (infra base) | 3 | Sonnet 5 | P0 |
| N-07 | Cron `sync-results` com janelas dinâmicas por modalidade | 3 | Sonnet 5 | P0 |
| N-08 | Job `backfill-history` + execução do backfill (~25 mil concursos) | 3 | Sonnet 5 | P0 |
| N-09 | `core/checking`: conferência e mapeamento acertos → faixa | 5 | **Opus 5** | P0 |
| N-10 | **Testes de conferência com casos reais nas 11 modalidades** | 4 | Sonnet 5 | P0 |
| N-11 | Job `check-bets` idempotente em lote | 3 | Opus 5 | P0 |

---

## ÉPICO 3 — Gestão de apostas (S2) · 34 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| A-01 | Schema `bets` + `bet_checks` com índices críticos | 3 | Opus 5 | P0 |
| A-02 | Cadastro de aposta com seletor de dezenas (CL-12) | 5 | Sonnet 5 | P0 |
| A-03 | Campos extras por modalidade (trevo/mês/time/colunas) (CL-12) | 4 | Sonnet 5 | P0 |
| A-04 | Aposta multi-concurso + cálculo de custo (CL-13/14) | 3 | Sonnet 5 | P0 |
| A-05 | Listagem com filtros e agrupamento por concurso (CL-10/11) | 4 | Sonnet 5 | P0 |
| A-06 | Editar, arquivar, duplicar jogo (CL-15 a CL-17) | 3 | Haiku 4.5 | P0 |
| A-07 | Anexar comprovante (upload R2) (CL-18) | 3 | Sonnet 5 | P0 |
| A-08 | Detalhe do jogo com histórico de conferências (CL-21/22) | 3 | Sonnet 5 | P0 |
| A-09 | Telas de resultados e conferência manual (CL-70 a CL-75) | 4 | Sonnet 5 | P0 |
| A-10 | Import CSV/Excel (CL-20) | 2 | Haiku 4.5 | P1 |

---

## ÉPICO 4 — Notificações (S2) · 18 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| NT-01 | Schema de notificações + preferências + push subscriptions | 2 | Sonnet 5 | P0 |
| NT-02 | Resend + React Email (templates de resultado e conferência) | 4 | Sonnet 5 | P0 |
| NT-03 | Web Push (VAPID) + registro de subscription | 4 | Sonnet 5 | P0 |
| NT-04 | Job `notify` com respeito a canal, plano, preferência e horário de silêncio | 4 | Sonnet 5 | P0 |
| NT-05 | Tela de preferências (CL-103) | 2 | Haiku 4.5 | P0 |
| NT-06 | Cron `accumulated-alert` (SY-10) | 2 | Haiku 4.5 | P0 |
| NT-07 | Cron `cutoff-reminder` (SY-11) | 2 | Haiku 4.5 | P1 |
| NT-08 | WhatsApp via Meta Cloud API | 5 | Sonnet 5 | P1 |

---

## ÉPICO 5 — Dashboard e Carteira (S2) · 14 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| D-01 | Dashboard com cards de resumo (CL-01 a CL-04) | 4 | Sonnet 5 | P0 |
| D-02 | Onboarding guiado, meta < 3 min (CL-05, fluxo F1) | 4 | Sonnet 5 | P0 |
| D-03 | Carteira: gasto, prêmios, ROI (CL-90 a CL-92) | 4 | Sonnet 5 | P0 |
| D-04 | Gráfico de evolução mensal (CL-93) | 2 | Sonnet 5 | P1 |
| D-05 | Limite de gasto autodeclarado (CL-95) | 2 | Sonnet 5 | P1 |
| D-06 | Exportação CSV (CL-94) | 1 | Haiku 4.5 | P1 |

---

## ÉPICO 6 — Monetização (S3) · 32 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| M-01 | Schema: plans, subscriptions, invoices, usage_counters | 3 | Opus 5 | P0 |
| M-02 | `core/entitlements` + middleware tRPC + contadores atômicos | 5 | **Opus 5** | P0 |
| M-03 | Integração Asaas: assinatura + Pix Automático | 6 | **Opus 5** | P0 |
| M-04 | Asaas: cartão de crédito e boleto | 3 | Sonnet 5 | P0 |
| M-05 | Webhook Asaas com HMAC + idempotência (SY-13) | 4 | **Opus 5** | P0 |
| M-06 | Checkout, upgrade, downgrade, cancelamento (CL-105/107) | 4 | Sonnet 5 | P0 |
| M-07 | `PaywallDialog` + 10 gatilhos G1–G10 instrumentados no PostHog | 4 | Sonnet 5 | P0 |
| M-08 | Trial de 14 dias sem cartão | 2 | Sonnet 5 | P0 |
| M-09 | Dunning (SY-09) | 3 | Sonnet 5 | P0 |
| M-10 | Histórico de faturas (CL-106) | 1 | Haiku 4.5 | P0 |
| M-11 | Add-ons: pacotes de OCR e IA | 2 | Sonnet 5 | P1 |
| M-12 | Bolão avulso R$ 14,90 | 3 | Sonnet 5 | P1 |

---

## ÉPICO 7 — Landing e SEO (S3) · 26 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| L-01 | Home com as 9 seções (LP-01) | 5 | Sonnet 5 · copy Opus 5 | P0 |
| L-02 | Página de planos (LP-02) | 3 | Sonnet 5 | P0 |
| L-03 | Páginas de recursos (LP-03/04) | 3 | Sonnet 5 | P0 |
| L-04 | **Resultados públicos por modalidade + ISR + sitemap + schema.org** (LP-07) | 5 | Sonnet 5 | P0 |
| L-05 | **Conferidor público sem login** (LP-08) | 4 | Sonnet 5 | P0 |
| L-06 | FAQ (LP-10) | 2 | Opus 5 (copy) | P0 |
| L-07 | Páginas legais: termos, privacidade, jogo responsável (LP-11 a LP-13) | 4 | **Opus 5** + jurídico | P0 |
| L-08 | Blog / CMS (LP-09) | 5 | Sonnet 5 | P1 |
| L-09 | Página de status (LP-15) | 2 | Haiku 4.5 | P1 |

---

## ÉPICO 8 — Backoffice (S4) · 34 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| B-01 | RBAC + `audit_logs` transversal | 4 | **Opus 5** | P0 |
| B-02 | Dashboard de KPIs e funil (BO-01 a BO-03) | 5 | Sonnet 5 | P0 |
| B-03 | **Saúde do sistema e alertas** (BO-04/05) | 4 | Sonnet 5 | P0 |
| B-04 | Gestão de usuários: listagem, detalhe, ações (BO-10 a BO-12) | 5 | Sonnet 5 | P0 |
| B-05 | LGPD: exportar e anonimizar usuário (BO-14/15) | 3 | Sonnet 5 | P0 |
| B-06 | Apostas + **reprocessar conferência** (BO-20/21) | 4 | Sonnet 5 | P0 |
| B-07 | Financeiro: assinaturas, faturas, retry, webhooks (BO-30 a BO-32, BO-36) | 5 | Sonnet 5 | P0 |
| B-08 | Config: CRUD de modalidades, re-sync, correção de concurso (BO-40 a BO-42) | 4 | Sonnet 5 | P0 |
| B-09 | Caixa de contato/suporte (BO-50) | 2 | Haiku 4.5 | P0 |
| B-10 | Impersonar usuário com auditoria (BO-13) | 3 | Opus 5 | P1 |
| B-11 | Feature flags (BO-45) | 2 | Sonnet 5 | P1 |
| B-12 | Editor de templates de notificação (BO-46) | 3 | Sonnet 5 | P1 |

---

## ÉPICO 9 — Gerador, fechamentos e estatísticas (S5) · 36 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| G-01 | Gerador aleatório (CL-30) | 2 | Sonnet 5 | P1 |
| G-02 | Filtros estatísticos completos (CL-31) | 5 | Sonnet 5 | P1 |
| G-03 | Estratégias salvas (CL-32) | 3 | Sonnet 5 | P1 |
| G-04 | Schema `closure_matrices` + motor de aplicação | 4 | **Opus 5** | P1 |
| G-05 | **Curadoria + verificação exaustiva da biblioteca (Lotofácil)** | 6 | **Opus 5** + Batch API | P1 |
| G-06 | Biblioteca das demais modalidades | 4 | Opus 5 + Batch API | P2 |
| G-07 | UI de fechamento com prévia de custo e garantia (CL-33/34) | 4 | Sonnet 5 | P1 |
| G-08 | Materialized views de estatística + refresh pós-concurso | 4 | **Opus 5** | P1 |
| G-09 | Telas de estatística (CL-80 a CL-83) | 5 | Sonnet 5 | P1 |
| G-10 | Impressão: volante oficial, A4, PDF (D8) | 4 | Sonnet 5 | P1 |
| G-11 | Disclaimers de aleatoriedade em todas as telas de análise | 1 | Haiku 4.5 | P0 |
| G-12 | Pares/trios e ciclos (CL-84/85) | 4 | Sonnet 5 | P2 |
| G-13 | Fechamento customizado assíncrono (CL-37) | 5 | Opus 5 | P2 |

---

## ÉPICO 10 — ★ Bolão Manager (S6) · 48 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| P-01 | Schema: pools, pool_members, pool_payments, pool_payouts | 4 | **Opus 5** | P1 |
| P-02 | `core/pool`: cotas e **rateio com resto em centavos** + testes de propriedade | 5 | **Opus 5** | P1 |
| P-03 | Chave Pix criptografada AES-256-GCM (CL-41) | 3 | **Opus 5** | P1 |
| P-04 | **Geração de payload Pix EMV + QR (CRC16/TLV)** ⚠️ | 5 | **Opus 5** | P1 |
| P-05 | Criar bolão + termo de responsabilidade (CL-40/42) | 4 | Sonnet 5 | P1 |
| P-06 | Link de convite + QR + compartilhar no WhatsApp (CL-43) | 3 | Sonnet 5 | P1 |
| P-07 | Página pública do bolão sem login (CL-55) | 3 | Sonnet 5 | P1 |
| P-08 | **Cadastro por convite** (AU-07) — fluxo de 5 telas | 4 | Sonnet 5 | P1 |
| P-09 | Entrar no bolão + escolher cotas + receber Pix (CL-56/57) | 4 | Sonnet 5 | P1 |
| P-10 | Declarar pagamento + anexar comprovante (CL-58) | 2 | Sonnet 5 | P1 |
| P-11 | Painel do organizador: participantes, pagamentos, fechar (CL-44 a CL-47) | 5 | Sonnet 5 | P1 |
| P-12 | **Anexar e exibir comprovante oficial da aposta** (CL-48/59) | 3 | Sonnet 5 | P1 |
| P-13 | Conferência de bolão + rateio automático (CL-49) | 4 | **Opus 5** | P1 |
| P-14 | Gerar Pix de devolução + marcar pago (CL-50) | 3 | Sonnet 5 | P1 |
| P-15 | Recibo digital com hash (CL-61) | 3 | Sonnet 5 | P1 |
| P-16 | Notificações de todos os eventos de bolão | 3 | Sonnet 5 | P1 |
| P-17 | Banner de compliance em todas as telas (CL-63) | 1 | Haiku 4.5 | P1 |
| P-18 | Cancelar bolão + sair do bolão (CL-51/62) | 2 | Haiku 4.5 | P1 |

---

## ÉPICO 11 — IA e OCR (S7) · 28 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| I-01 | Pipeline de upload + normalização de imagem (EXIF, resize) | 3 | Sonnet 5 | P1 |
| I-02 | **OCR via Haiku 4.5 vision + structured output** | 5 | **Opus 5** (design) | P1 |
| I-03 | Tela de confirmação pós-OCR (CL-19) | 3 | Sonnet 5 | P1 |
| I-04 | Contabilização de uso + paywall de OCR | 2 | Haiku 4.5 | P1 |
| I-05 | Motor de backtesting (job assíncrono) | 5 | **Opus 5** | P2 |
| I-06 | Relatório honesto de backtesting com disclaimers | 3 | Opus 5 (copy) | P2 |
| I-07 | Assistente IA: roteamento, caching, guardrails | 5 | **Opus 5** | P2 |
| I-08 | UI do chat + cota + medidor de uso | 3 | Sonnet 5 | P2 |
| I-09 | Monitoramento de custo de IA por usuário | 2 | Sonnet 5 | P2 |
| I-10 | **Teste adversarial de guardrails (30 prompts)** | 2 | Opus 5 | P2 |

---

## ÉPICO 12 — Hardening e GA (S8) · 30 pts

| ID | História | Pts | Modelo | Prio |
|---|---|---:|---|:---:|
| H-01 | Auditoria de segurança OWASP + revisão de autorização | 5 | **Opus 5** | P0 |
| H-02 | Teste de carga (100 mil apostas < 60 s) | 3 | Sonnet 5 | P0 |
| H-03 | Otimização de queries e índices | 4 | **Opus 5** | P0 |
| H-04 | LGPD: exportar dados, excluir conta (CL-108/109) | 4 | Sonnet 5 | P0 |
| H-05 | Jogo responsável: página de ajuda + alertas | 2 | Sonnet 5 | P0 |
| H-06 | PWA completo (manifest, SW, offline, install prompt) | 5 | Sonnet 5 | P1 |
| H-07 | Auditoria de acessibilidade + correções (checklist 9.7) | 4 | Sonnet 5 | P0 |
| H-08 | Teste de restore de backup | 1 | — | P0 |
| H-09 | Runbooks operacionais | 2 | Opus 5 | P0 |

---

## ÉPICO 13 — B2B White-label (pós-GA, T+3) · 34 pts · P2

| ID | História | Pts |
|---|---|---:|
| W-01 | Ativar isolamento multi-tenant em todas as queries | 6 |
| W-02 | Branding por tenant (logo, cores, subdomínio) | 5 |
| W-03 | Painel de gestão do tenant | 8 |
| W-04 | Relatórios agregados para o tenant | 4 |
| W-05 | Onboarding e faturamento B2B | 5 |
| W-06 | ⚖️ **Parecer jurídico específico para o B2B** | — |
| W-07 | SLA, contrato e suporte prioritário | 3 |
| W-08 | API pessoal (D10) com token e rate limit | 3 |

---

## Resumo de esforço

| Épico | Pontos | Horas (≈) | Sprint |
|---|---:|---:|---|
| 1 — Fundação | 26 | 52 | S0 |
| 2 — Núcleo de loterias | 42 | 84 | S1 |
| 3 — Gestão de apostas | 34 | 68 | S2 |
| 4 — Notificações | 18 | 36 | S2 |
| 5 — Dashboard e Carteira | 14 | 28 | S2 |
| 6 — Monetização | 32 | 64 | S3 |
| 7 — Landing e SEO | 26 | 52 | S3 |
| 8 — Backoffice | 34 | 68 | S4 |
| 9 — Gerador e fechamentos | 36 | 72 | S5 |
| 10 — **Bolão Manager** | **48** | **96** | S6 |
| 11 — IA e OCR | 28 | 56 | S7 |
| 12 — Hardening e GA | 30 | 60 | S8 |
| **Total até GA** | **368** | **~736 h** | S0–S8 |
| 13 — B2B (pós-GA) | 34 | 68 | T+3 |

> ⚠️ **736 h em 18 semanas = ~41 h/semana.** Isso é dedicação praticamente integral.
> Os épicos 2, 4 e 5 somam 74 pts para a S2 sozinha, acima da capacidade de 60 h/sprint —
> **é preciso decidir na Q3/Q9** se o MVP corta modalidades (só Mega + Lotofácil) ou se o prazo estica.
> Recomendação: manter as 9 modalidades de dezenas e aceitar **20 semanas em vez de 18**.

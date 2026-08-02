# 10 — Cronograma e Roadmap

## 10.1 Premissas de capacidade

| Premissa | Valor |
|---|---|
| Modelo de execução | **1 desenvolvedor sênior (Guilherme) + Claude Code** como par de programação |
| Sprint | 2 semanas |
| Capacidade por sprint | ~60 h efetivas de desenvolvimento |
| Duração total até GA | **18 semanas (9 sprints)** |
| MVP comercializável (beta fechado) | **Semana 10 (fim da S4)** |
| Design | Feito em paralelo com shadcn/ui + tokens; sem designer dedicado no MVP |
| Jurídico | Consultoria externa pontual, contratada na S3, entregue na S4 |

> ⚠️ Se o time crescer (ex.: +1 dev), a paralelização recomendada é: **dev 1 = domínio + workers**,
> **dev 2 = UI + backoffice**. As Sprints 5 e 6 são as mais paralelizáveis.

---

## 10.2 Visão geral

```
S0 │████│ Fundação                                    sem 1–2
S1 │████│ Núcleo de loterias + sync + conferência     sem 3–4
S2 │████│ Painel do cliente v1                        sem 5–6
S3 │████│ Monetização + landing                       sem 7–8
S4 │████│ Backoffice v1                    ★ MVP      sem 9–10
S5 │████│ Gerador, fechamentos, estatísticas          sem 11–12
S6 │████│ ★ BOLÃO MANAGER                             sem 13–14
S7 │████│ OCR + backtesting + assistente IA           sem 15–16
S8 │████│ Hardening, LGPD, PWA          ★ GA          sem 17–18
```

---

## 10.3 Sprints detalhadas

### S0 — Fundação (semanas 1–2)

**Objetivo:** repositório pronto para produzir features em velocidade máxima.

| # | Entrega | Modelo recomendado |
|---|---|---|
| S0.1 | Monorepo Turborepo + pnpm, workspaces, tsconfig, eslint, prettier | Sonnet 5 |
| S0.2 | Next.js 15 com App Router e os 4 route groups | Sonnet 5 |
| S0.3 | Prisma + Postgres local (Docker Compose) + primeira migration | Sonnet 5 |
| S0.4 | tRPC configurado (contexto, middlewares de auth e entitlement) | **Opus 5** (decisão estrutural) |
| S0.5 | Better Auth: e-mail/senha, Google, verificação, recuperação | Sonnet 5 |
| S0.6 | Design system base: tokens, Tailwind v4, shadcn/ui, `NumberBall`, `NumberGrid` | Sonnet 5 |
| S0.7 | CI/CD (GitHub Actions) + ambientes preview/staging/prod | Sonnet 5 |
| S0.8 | Sentry + PostHog | Haiku 4.5 |
| S0.9 | Layout do painel e do backoffice (shell, navegação, RBAC) | Sonnet 5 |

**Critério de aceite:** um usuário se cadastra, faz login, vê o painel vazio, e um admin acessa o backoffice.
Deploy automático funcionando nos três ambientes.

---

### S1 — Núcleo de loterias (semanas 3–4)

**Objetivo:** o coração do sistema. É a sprint de maior densidade técnica.

| # | Entrega | Modelo recomendado |
|---|---|---|
| S1.1 | Schema completo de loterias, concursos, faixas de preço e premiação | **Opus 5** |
| S1.2 | `packages/core/lottery` — motor configurável, validação, precificação | **Opus 5** |
| S1.3 | Seeds das 11 modalidades + faixas 2026 | Sonnet 5 |
| S1.4 | `CaixaOfficialProvider` + **validação do TLS em ambiente Linux** ⚠️ | **Opus 5** (risco técnico) |
| S1.5 | `ResilientResultProvider` com fallback e circuit breaker | Opus 5 |
| S1.6 | Worker + BullMQ + Redis; cron `sync-results` com janelas dinâmicas | Sonnet 5 |
| S1.7 | Job `backfill-history` e execução do backfill completo (~25 mil concursos) | Sonnet 5 |
| S1.8 | `packages/core/checking` — conferência e mapeamento de faixas | **Opus 5** |
| S1.9 | **Testes unitários de conferência com casos reais do histórico** (todas as 11 modalidades) | Sonnet 5 |
| S1.10 | Job `check-bets` idempotente, em lote | Opus 5 |

**Critério de aceite:** histórico completo importado; um concurso novo é detectado em < 5 min;
uma aposta de teste é conferida corretamente em todas as modalidades, validada contra o resultado oficial.

> ⚠️ **Risco concentrado nesta sprint.** S1.4 (TLS da Caixa) foi identificado como falha real durante a
> pesquisa. Se o handshake não funcionar em produção, o plano B (mirror open-source self-hospedado)
> precisa ser executado ainda na S1 — não empurrar para depois.

---

### S2 — Painel do cliente v1 (semanas 5–6)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S2.1 | CRUD de apostas com seletor de dezenas (CL-12) | Sonnet 5 |
| S2.2 | Aposta multi-concurso com cálculo de custo (CL-13/14) | Sonnet 5 |
| S2.3 | Campos extras por modalidade (trevo, mês, time, colunas) | Sonnet 5 |
| S2.4 | Listagem com filtros e agrupamento por concurso (CL-10/11) | Sonnet 5 |
| S2.5 | Duplicar e arquivar jogo (CL-16/17) | Haiku 4.5 |
| S2.6 | Telas de resultados e conferência (CL-70 a CL-75) | Sonnet 5 |
| S2.7 | Dashboard (CL-01 a CL-04) | Sonnet 5 |
| S2.8 | Notificações: e-mail (Resend + React Email) e push (Web Push) | Sonnet 5 |
| S2.9 | Preferências de notificação (CL-103) | Haiku 4.5 |
| S2.10 | Carteira v1: gasto, prêmios, ROI (CL-90 a CL-92) | Sonnet 5 |
| S2.11 | Onboarding guiado (F1) | Sonnet 5 |
| S2.12 | Alerta de acumulado (SY-10) | Haiku 4.5 |

**Critério de aceite:** um usuário cadastra 5 jogos em 3 modalidades, recebe push e e-mail após o sorteio
com o resultado correto, e vê seu gasto do mês.

---

### S3 — Monetização e landing (semanas 7–8)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S3.1 | Módulo `entitlements` + middleware tRPC + `usage_counters` | **Opus 5** |
| S3.2 | Integração Asaas: assinatura, Pix Automático, cartão | **Opus 5** (dinheiro = alto custo de erro) |
| S3.3 | Webhook Asaas com HMAC e idempotência (SY-13) | Opus 5 |
| S3.4 | Fluxo de checkout, upgrade, downgrade, cancelamento | Sonnet 5 |
| S3.5 | `PaywallDialog` + os 10 gatilhos (G1–G10) | Sonnet 5 |
| S3.6 | Trial de 14 dias sem cartão | Sonnet 5 |
| S3.7 | Dunning (SY-09) | Sonnet 5 |
| S3.8 | Landing: home, planos, recursos, FAQ | Sonnet 5 · **copy: Opus 5** |
| S3.9 | LP-07 resultados públicos + ISR + sitemap + schema.org | Sonnet 5 |
| S3.10 | LP-08 conferidor público sem login | Sonnet 5 |
| S3.11 | Páginas legais (termos, privacidade, jogo responsável) | **Opus 5** + revisão jurídica |
| S3.12 | ⚖️ **Contratar consultoria jurídica** (entrega na S4) | — |

**Critério de aceite:** usuário assina o Premium via Pix Automático, o webhook processa, os limites mudam
em tempo real, e a landing pontua ≥ 95 no Lighthouse.

---

### S4 — Backoffice v1 · ★ MVP (semanas 9–10)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S4.1 | Dashboard de KPIs (BO-01 a BO-03) | Sonnet 5 |
| S4.2 | **Saúde do sistema** (BO-04/05) | Sonnet 5 |
| S4.3 | Gestão de usuários (BO-10 a BO-12, BO-14/15) | Sonnet 5 |
| S4.4 | Gestão de apostas + **reprocessar conferência** (BO-20/21) | Sonnet 5 |
| S4.5 | Financeiro: assinaturas, faturas, retry, log de webhooks (BO-30 a BO-32, BO-36) | Sonnet 5 |
| S4.6 | Config: CRUD de modalidades, re-sync, correção de concurso (BO-40 a BO-42) | Sonnet 5 |
| S4.7 | RBAC + `audit_logs` em todas as ações de admin | Opus 5 |
| S4.8 | Suporte: caixa de contato (BO-50) | Haiku 4.5 |
| S4.9 | ⚖️ **Aplicar recomendações do parecer jurídico** | Opus 5 |
| S4.10 | Testes E2E dos fluxos críticos (Playwright) | Sonnet 5 |
| S4.11 | 🚀 **Deploy em produção + beta fechado (30–50 usuários)** | — |

**★ MARCO: MVP comercializável.** A partir daqui o produto pode receber dinheiro.

**Critério de aceite:** 30 usuários reais usando; nenhum bug P0 em 7 dias; ao menos 3 assinaturas pagas
processadas ponta a ponta; parecer jurídico aplicado.

---

### S5 — Gerador, fechamentos e estatísticas (semanas 11–12)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S5.1 | Gerador aleatório + filtros estatísticos (CL-30/31) | Sonnet 5 |
| S5.2 | Estratégias salvas (CL-32) | Sonnet 5 |
| S5.3 | **Motor de fechamentos** — aplicação de matriz, cálculo de custo e garantia | **Opus 5** (algoritmo) |
| S5.4 | **Curadoria e verificação da biblioteca de matrizes** (Lotofácil prioritário) | **Opus 5** + verificação exaustiva offline |
| S5.5 | UI de fechamento com prévia de custo e garantia (CL-33/34) | Sonnet 5 |
| S5.6 | Materialized views de estatística + refresh pós-concurso | Opus 5 |
| S5.7 | Telas de estatística: frequência, atraso, distribuições, mapa de calor (CL-80 a CL-83) | Sonnet 5 |
| S5.8 | Impressão/exportação: volante oficial, A4, PDF (CL/D8) | Sonnet 5 |
| S5.9 | Import CSV/Excel (CL-20) | Haiku 4.5 |
| S5.10 | Disclaimers de aleatoriedade em todas as telas de análise | Haiku 4.5 |

**Critério de aceite:** fechamento de 18 dezenas garantindo 14 pontos gera o conjunto correto, com a
garantia **verificada por teste exaustivo**; estatística de 3.000 concursos carrega em < 500 ms.

---

### S6 — ★ Bolão Manager (semanas 13–14)

**A sprint mais importante do projeto.**

| # | Entrega | Modelo recomendado |
|---|---|---|
| S6.1 | Schema de bolões (pools, members, payments, payouts) | **Opus 5** |
| S6.2 | `packages/core/pool` — cotas, **cálculo de rateio com resto em centavos** | **Opus 5** (correção crítica) |
| S6.3 | Criação de bolão + termo de responsabilidade (CL-40 a CL-42) | Sonnet 5 |
| S6.4 | Chave Pix criptografada (AES-256-GCM) | **Opus 5** (segurança) |
| S6.5 | **Geração de payload Pix EMV copia-e-cola + QR** | **Opus 5** (padrão BACEN, CRC16) |
| S6.6 | Link de convite + QR + compartilhamento WhatsApp (CL-43) | Sonnet 5 |
| S6.7 | Página pública do bolão (sem login) + fluxo AU-07 | Sonnet 5 |
| S6.8 | Fluxo do participante completo (CL-55 a CL-62) | Sonnet 5 |
| S6.9 | Painel do organizador (CL-44 a CL-51) | Sonnet 5 |
| S6.10 | Upload e exibição do comprovante oficial (CL-48/59) | Sonnet 5 |
| S6.11 | Conferência de bolão + rateio automático (CL-49) | Opus 5 |
| S6.12 | Recibo digital com hash (CL-61) | Sonnet 5 |
| S6.13 | Notificações de bolão (todos os eventos) | Sonnet 5 |
| S6.14 | Banner de compliance em toda tela de bolão (CL-63) | Haiku 4.5 |
| S6.15 | 🧪 **Teste de viralidade:** medir cadastros gerados por bolão criado | — |

**Critério de aceite:** um bolão real de 10 pessoas é criado, todos entram pelo link, pagam por Pix,
o organizador anexa o comprovante, o sistema confere e calcula o rateio com **soma exata em centavos**.
Métrica de viralidade ≥ 3,0 cadastros por bolão.

> ⚠️ **S6.5 (Pix EMV) é o item técnico mais subestimado.** O payload segue o padrão EMV®QRCPS do BACEN,
> com campos TLV aninhados e CRC16-CCITT. Errar aqui gera QR que não abre no app do banco.
> **Testar com pelo menos 4 bancos diferentes.**

---

### S7 — OCR, backtesting e IA (semanas 15–16)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S7.1 | Pipeline de upload + normalização de imagem (remoção de EXIF, resize) | Sonnet 5 |
| S7.2 | **OCR de comprovante** via Claude Haiku 4.5 vision + output estruturado | **Opus 5** (design do prompt e schema) |
| S7.3 | Tela de confirmação obrigatória pós-OCR (CL-19) | Sonnet 5 |
| S7.4 | Contabilização de uso de OCR + paywall | Haiku 4.5 |
| S7.5 | Motor de backtesting (job assíncrono) | **Opus 5** |
| S7.6 | Relatório de backtesting **honesto** com disclaimers | Opus 5 (copy) + Sonnet 5 (UI) |
| S7.7 | Assistente IA: roteamento Haiku/Sonnet, prompt caching, guardrails | **Opus 5** |
| S7.8 | UI do chat + cota mensal + medidor de uso | Sonnet 5 |
| S7.9 | Monitoramento de custo de IA por usuário + alertas | Sonnet 5 |
| S7.10 | Notificação por WhatsApp (Meta Cloud API) | Sonnet 5 |

**Critério de aceite:** OCR acerta ≥ 90% dos comprovantes de teste (amostra de 50 fotos reais em condições
variadas); custo médio por scan < R$ 0,02; assistente IA nunca afirma que uma escolha aumenta a chance
de ganhar (teste adversarial com 30 prompts).

---

### S8 — Hardening e GA (semanas 17–18)

| # | Entrega | Modelo recomendado |
|---|---|---|
| S8.1 | Auditoria de segurança (OWASP Top 10, revisão de autorização) | **Opus 5** |
| S8.2 | Teste de carga: 100 mil apostas conferidas em < 60 s | Sonnet 5 |
| S8.3 | Otimização de queries e índices | Opus 5 |
| S8.4 | LGPD: exportar dados, excluir conta, portal de privacidade (CL-108/109) | Sonnet 5 |
| S8.5 | Jogo responsável: limite de gasto, página de ajuda (CL-95, LP-11) | Sonnet 5 |
| S8.6 | PWA completo: manifest, service worker, offline, install prompt | Sonnet 5 |
| S8.7 | Auditoria de acessibilidade (checklist 9.7) + correções | Sonnet 5 |
| S8.8 | **Teste de restore de backup** | — |
| S8.9 | Runbooks operacionais (o que fazer quando a Caixa cai, fila trava, cobrança falha) | Opus 5 |
| S8.10 | Página de status + alertas de uptime | Haiku 4.5 |
| S8.11 | Revisão final de compliance (checklist 3.8) | **Opus 5** |
| S8.12 | 🚀 **Lançamento público (GA)** | — |

**★ MARCO: GA.**

---

## 10.4 Roadmap pós-GA

| Trimestre | Tema | Itens |
|---|---|---|
| **T+1** (mês 1–3) | Crescimento e retenção | SEO/conteúdo, A/B nos paywalls, otimização do funil de bolão, app de resultados como isca, programa de indicação |
| **T+2** (mês 4–6) | Aprofundamento | Fechamentos customizados, pares/trios, ciclos, API pessoal, Loteca e Federal completas |
| **T+3** (mês 7–9) | **B2B White-label** | Multi-tenant ativo, painel de gestão para lotéricas, contrato e SLA, ⚖️ parecer jurídico específico |
| **T+4** (mês 10–12) | Expansão | App nativo (React Native), loterias estaduais, avaliar afiliação com revendedor autorizado |

---

## 10.5 Marcos e critérios de saída

| Marco | Semana | Critério objetivo de saída |
|---|---|---|
| **M1 — Fundação** | 2 | Cadastro, login e deploy automático funcionando nos 3 ambientes |
| **M2 — Motor confiável** | 4 | Histórico completo importado; conferência correta nas 11 modalidades, validada contra resultados oficiais |
| **M3 — Produto usável** | 6 | Usuário cadastra jogo e recebe notificação correta pós-sorteio |
| **M4 — Produto vendável** | 8 | Assinatura processada ponta a ponta via Pix Automático |
| **M5 — ★ MVP / Beta** | 10 | 30 usuários reais, 3 assinaturas pagas, zero bug P0 em 7 dias, parecer jurídico aplicado |
| **M6 — Paridade competitiva** | 12 | Fechamento com garantia verificada + estatísticas completas |
| **M7 — ★ Diferenciação** | 14 | Bolão real de 10 pessoas concluído ponta a ponta; viralidade ≥ 3,0 |
| **M8 — Encantamento** | 16 | OCR ≥ 90% de acerto; assistente IA aprovado no teste adversarial |
| **M9 — ★ GA** | 18 | Checklist de compliance, segurança, acessibilidade e restore concluído |

---

## 10.6 Riscos de cronograma

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| TLS da API da Caixa não funcionar em produção | **Alta** | **Alto** | Plano B (mirror self-hospedado) já orçado na S1; não sair da S1 sem resolver |
| Biblioteca de matrizes de fechamento demorar mais que o previsto | Média | Médio | Entregar Lotofácil primeiro (80% do valor); demais modalidades incrementalmente |
| Payload Pix EMV com bug | Média | **Alto** | Testar com 4+ bancos ainda na S6; usar biblioteca validada em vez de implementar do zero |
| Parecer jurídico exigir mudança estrutural | Baixa | **Alto** | Contratar na S3 (não na S8); arquitetura já desenhada de forma conservadora |
| OCR com acurácia abaixo do aceitável | Baixa | Médio | Fallback para digitação manual sempre disponível; OCR nunca é caminho único |
| Custo de IA acima do orçado | Média | Médio | Cotas rígidas + roteamento por complexidade + caching desde a S7 |
| Escopo do Bolão Manager crescer | **Alta** | Médio | Congelar escopo da S6 no que está em [08](08-especificacao-funcional.md); extras vão para T+1 |

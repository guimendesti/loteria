# CLAUDE.md — LotoPro

Instruções para sessões futuras do Claude Code neste projeto.

## Estado atual

**Planejamento completo. Implementação não iniciada.**
Antes de escrever qualquer código, ler [README.md](README.md) e responder as perguntas bloqueantes
de [docs/12-riscos-e-decisoes-pendentes.md](docs/12-riscos-e-decisoes-pendentes.md) (Q1–Q4).

## O que é

SaaS de gestão, análise e colaboração para apostadores de loteria federal brasileira.
Receita = assinatura de software. **Não operamos loteria, não recebemos dinheiro de aposta.**

## ⛔ Regras invioláveis

1. **Zero custódia.** Nenhum endpoint pode receber, guardar ou repassar valor de aposta ou de bolão.
   Pix de bolão é sempre P2P: participante → organizador, direto, com a chave do organizador.
2. **Nunca prometer aumento de chance de ganhar.** Nem em código, nem em copy, nem em prompt de IA.
   Sorteios são independentes. Isso é CDC art. 37 (publicidade enganosa).
3. **Nunca sugerir vínculo com a Caixa.** Uso de marca apenas nominativo. Disclaimer de não-vínculo
   permanente no rodapé.
4. **Bolão é privado e por convite.** Nunca criar diretório público, marketplace ou busca de bolões.
5. **Dinheiro em centavos inteiros (`BigInt`).** Nunca `float`. O rateio de bolão precisa somar exato.
6. **Modalidade é dado, não código.** Adicionar loteria = INSERT + config, nunca `if (slug === 'megasena')`.
7. **Matriz de fechamento sem `verifiedAt` nunca é exposta ao usuário.**

Detalhes e fundamentos: [docs/03-marco-legal-e-compliance.md](docs/03-marco-legal-e-compliance.md).

## Stack

Next.js 15 (App Router) · TypeScript strict · tRPC v11 · Prisma · PostgreSQL 16 · Redis + BullMQ ·
Tailwind v4 + shadcn/ui · Better Auth · Asaas (Pix Automático) · Cloudflare R2 · Resend ·
Sentry + PostHog · Vitest + Playwright.

Deploy: Vercel (web) · Railway (worker) · Neon (DB) · Upstash (Redis).

## Estrutura

```
apps/web       Next.js — (marketing) (auth) (app) (admin)
apps/worker    BullMQ — sync, conferência, notificações, OCR, fechamentos
packages/core  ★ DOMÍNIO PURO, sem framework — lottery, checking, generator,
               closure, pool, stats, entitlements
packages/db    Prisma schema, migrations, seeds
packages/api   routers tRPC
packages/ui    design system
packages/integrations   caixa-api, asaas, resend, r2, anthropic, whatsapp
```

**`packages/core` não importa de `apps`, `db` ou `integrations`.** Recebe dados, devolve resultados.

## Convenções

- Componentes em PascalCase; hooks `use*`; rotas em kebab-case
- Validação com Zod, compartilhada entre cliente e servidor
- Entitlements sempre verificados **no servidor** (middleware tRPC), nunca só no cliente
- Trabalho pesado (conferência, OCR, fechamento, backtest) vai para fila, nunca para o request
- Migrations backward-compatible (expand/contract)
- Toda ação de admin gera `audit_log`
- Todo webhook é idempotente por `event_id`

## Modelos de IA (ver [docs/11-guia-de-modelos-ia.md](docs/11-guia-de-modelos-ia.md))

| Trabalho | Modelo | Effort |
|---|---|---|
| Arquitetura, algoritmos, segurança, pagamento, code review crítico | `claude-opus-5` | `xhigh` / `max` |
| Implementação padrão, telas, CRUD, testes | `claude-sonnet-5` | `high` / `medium` |
| Tarefas mecânicas, seeds, i18n, formatação | `claude-haiku-4-5` | — |
| Runtime: OCR de comprovante | `claude-haiku-4-5` | — |
| Runtime: assistente (roteado) | `claude-haiku-4-5` / `claude-sonnet-5` | — |

## Áreas de alto risco — sempre revisar com atenção extra

| Área | Por quê |
|---|---|
| `packages/integrations/caixa` | TLS não-padrão da API da Caixa; falha real observada na pesquisa |
| `packages/core/checking` | Mapeamento acertos → faixa varia por modalidade (Lotomania premia 0; Dupla Sena tem 2 sorteios) |
| `packages/core/pool` (rateio) | Soma em centavos precisa ser exata; resto vai para o organizador, explicitado na UI |
| Geração de payload Pix EMV | CRC16 + TLV aninhado; testar com 4+ bancos |
| `packages/core/closure` | Garantia matemática precisa ser verificada exaustivamente, offline |
| Webhooks do Asaas | HMAC + idempotência |

## Comandos (após a S0)

```bash
pnpm dev              # web + worker
pnpm db:migrate       # aplica migrations
pnpm db:seed          # modalidades, preços, planos
pnpm db:backfill      # importa histórico de concursos da Caixa
pnpm test             # Vitest
pnpm test:e2e         # Playwright
pnpm typecheck
pnpm lint
```

## Índice da documentação

Ver [README.md](README.md). Os mais consultados no dia a dia:
- [03 — Marco legal](docs/03-marco-legal-e-compliance.md) — **ler antes de qualquer decisão de produto**
- [07 — Modelo de dados](docs/07-modelo-de-dados.md)
- [08 — Especificação funcional](docs/08-especificacao-funcional.md) — IDs de requisito (CL-xx, BO-xx…)
- [13 — Backlog](docs/13-backlog-priorizado.md) — o que fazer agora

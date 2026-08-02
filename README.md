# LotoPro — Plataforma de Gestão de Apostas Lotéricas

> **Codinome do projeto:** LotoPro (nome comercial ainda a definir — ver [12-riscos-e-decisoes-pendentes.md](docs/12-riscos-e-decisoes-pendentes.md))
> **Status:** Planejamento concluído · Implementação não iniciada
> **Data do planejamento:** 02/08/2026
> **Responsável:** Guilherme (Devnology)

---

## O que é

SaaS B2C (com braço B2B) de **gestão, organização e inteligência de apostas** nas loterias federais da Caixa
(Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Timemania, Dia de Sorte, Super Sete, +Milionária, Loteca, Federal).

O sistema **não recebe dinheiro de apostas, não vende cotas e não intermedeia jogos**. O usuário aposta nos canais
oficiais da Caixa; o LotoPro é a camada de software que organiza, gera, confere, analisa e gerencia essas apostas —
incluindo bolões privados entre amigos. A receita vem de **assinatura de software**, não de aposta.

Essa distinção é o alicerce jurídico do produto e está detalhada em
[03-marco-legal-e-compliance.md](docs/03-marco-legal-e-compliance.md). **Leia esse documento antes de qualquer
decisão de produto.**

---

## Entregáveis do produto

| Superfície | Descrição |
|---|---|
| **Landing page** | Institucional + SEO + venda de planos + autenticação (login/cadastro/recuperação) |
| **Painel do cliente** | Gestão de jogos por modalidade e concurso, bolões, gerador, conferência, estatísticas, carteira |
| **Backoffice** | Gestão de usuários, assinaturas, apostas, métricas, suporte, financeiro, feature flags |
| **Workers** | Sincronização de resultados, conferência automática, notificações, fechamentos, OCR |

---

## Índice da documentação

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Pesquisa de mercado](docs/01-pesquisa-de-mercado.md) | Loterias federais, regras, preços, volume de mercado, APIs de dados |
| 02 | [Análise de concorrência](docs/02-analise-de-concorrencia.md) | Concorrentes diretos/indiretos, matriz comparativa, lacunas exploráveis |
| 03 | [Marco legal e compliance](docs/03-marco-legal-e-compliance.md) | Monopólio da Caixa, Lei 14.790/23, o que pode e o que não pode, LGPD, jogo responsável |
| 04 | [Produto, personas e diferenciais](docs/04-produto-personas-e-diferenciais.md) | Visão, personas, jobs-to-be-done, 10 diferenciais comercializáveis |
| 05 | [Monetização e planos](docs/05-monetizacao-e-planos.md) | Estrutura de planos, pricing, gatilhos de paywall, unit economics, projeção |
| 06 | [Arquitetura técnica](docs/06-arquitetura-tecnica.md) | Stack, infraestrutura, integrações, segurança, observabilidade, custos |
| 07 | [Modelo de dados](docs/07-modelo-de-dados.md) | Schema completo, entidades, índices, decisões de modelagem |
| 08 | [Especificação funcional](docs/08-especificacao-funcional.md) | Requisitos detalhados de landing, painel do cliente e backoffice |
| 09 | [Design system e UX](docs/09-design-system-e-ux.md) | Identidade, tokens, componentes, fluxos-chave, acessibilidade |
| 10 | [Cronograma e roadmap](docs/10-cronograma-e-roadmap.md) | 9 sprints, 18 semanas, marcos, critérios de aceite, capacidade |
| 11 | [Guia de modelos de IA](docs/11-guia-de-modelos-ia.md) | Qual modelo Claude usar por demanda (dev e runtime), economia de tokens |
| 12 | [Riscos e decisões pendentes](docs/12-riscos-e-decisoes-pendentes.md) | Matriz de riscos + perguntas que precisam de resposta do Guilherme |
| 13 | [Backlog priorizado](docs/13-backlog-priorizado.md) | Épicos e histórias com estimativas, prontos para execução |

---

## Resumo executivo em 10 linhas

1. O mercado lotérico brasileiro movimenta **~R$ 25 bilhões/ano** e cresceu 8,4% no 1T26.
2. A Caixa detém monopólio da operação; **não vamos operar loteria** — vamos vender software de gestão.
3. Os concorrentes de software são desktop-first, feios, licença anual e sem app/mobile decente.
4. **Nenhum concorrente resolve bem o bolão de loteria** — os apps de bolão do Brasil são todos de futebol.
5. Nosso *feature-killer* é o **Bolão Manager**: cotas, convite por link, Pix sem custódia, rateio automático.
6. Complementado por conferência automática multi-concurso, OCR de volante, fechamentos e backtesting honesto.
7. Freemium com 3 planos B2C (R$ 0 / R$ 24,90 / R$ 59,90) + 1 plano B2B white-label (a partir de R$ 349).
8. Stack: Next.js 15 + tRPC + Prisma + PostgreSQL + BullMQ, deploy Vercel/Neon/Railway.
9. Pagamentos via **Asaas com Pix Automático** (taxa 0,22–0,35% vs ~3,7% de cartão) — vantagem de margem relevante.
10. **MVP comercializável em 10 semanas**; GA em 18 semanas.

---

## Regras de ouro do projeto

1. **Nunca** custodiar dinheiro de aposta ou de bolão. Split de Pix é sempre P2P entre os participantes.
2. **Nunca** prometer aumento de chance de ganhar. Isso é publicidade enganosa (CDC art. 37).
   Vendemos organização, análise e conveniência — não sorte.
3. **Nunca** usar as marcas "Caixa", "Mega-Sena", "Lotofácil" etc. de forma que sugira vínculo oficial.
   Uso apenas nominativo e descritivo, com disclaimer permanente.
4. Toda modalidade é **configuração em banco**, não código. Isso permite adicionar loterias estaduais depois.
5. Todo dado de resultado vem da **API oficial da Caixa**, com fallback e cache. Nunca de scraping frágil.

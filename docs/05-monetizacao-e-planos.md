# 05 — Monetização, Planos e Unit Economics

## 5.1 Princípio de monetização (regra jurídica, não comercial)

> **A receita é 100% assinatura de software. O preço nunca varia em função de valor apostado,
> quantidade de dinheiro movimentado em bolão ou prêmios ganhos.**

Isso é o que separa juridicamente "vender software" de "explorar loteria"
(ver [03-marco-legal-e-compliance.md](03-marco-legal-e-compliance.md)). Qualquer ideia de monetização que
viole esse princípio — comissão sobre bolão, taxa por cota, percentual de prêmio — está **vetada**.

---

## 5.2 Estrutura de planos

### Visão geral

| | **Free** | **Premium** | **Pro** | **Lotérica** (B2B) |
|---|---|---|---|---|
| **Nome comercial** | Apostador | Estrategista | Bolão Master | White-label |
| **Mensal** | R$ 0 | **R$ 24,90** | **R$ 59,90** | sob consulta |
| **Anual** | — | **R$ 249** (R$ 20,75/mês) | **R$ 599** (R$ 49,92/mês) | a partir de **R$ 349/mês** |
| **Desconto anual** | — | 17% (2 meses grátis) | 17% | — |
| **Persona-alvo** | Antônio, entrada de Sandra | Márcia | Ricardo, Sandra | Lotérica |

### Detalhamento de limites

| Recurso | Free | Premium | Pro |
|---|---|---|---|
| **Jogos ativos simultâneos** | 20 | Ilimitado | Ilimitado |
| **Modalidades com conferência automática** | 2 (à escolha) | Todas | Todas |
| **Histórico de jogos** | 90 dias | Completo | Completo |
| **Notificações** | E-mail | E-mail + Push | E-mail + Push + **WhatsApp** |
| **Alertas de acumulado** | ✅ e-mail | ✅ + push | ✅ + regras customizadas |
| **Alerta de fechamento de apostas** | ❌ | ✅ | ✅ |
| **Estatísticas** | Básicas (frequência, atraso) | Completas + gráficos + ciclos | Completas + comparativos |
| **Gerador de jogos** | Aleatório simples | + filtros avançados | + filtros salvos ilimitados |
| **Fechamentos** | Até 16 dezenas | Até 20 dezenas | Biblioteca completa + custom |
| **Impressão / exportação** | A4 com marca d'água | Todos os formatos | + exportação em lote |
| **OCR de comprovante** | 3/mês | 30/mês | Ilimitado (fair use 300/mês) |
| **Carteira / ROI** | Mês corrente | Histórico completo + gráficos | + comparativo entre estratégias + CSV |
| **Bolões ativos** | **1** | **5** | **Ilimitado** |
| **Participantes por bolão** | **5** | **30** | **Ilimitado** |
| **Recibo digital de bolão** | ❌ | ✅ | ✅ |
| **Backtesting histórico** | ❌ | ❌ | ✅ |
| **Assistente IA** | ❌ | ❌ | ✅ (150 mensagens/mês) |
| **API pessoal** | ❌ | ❌ | ✅ |
| **Suporte** | Base de conhecimento | E-mail (48h) | Prioritário (12h) + WhatsApp |
| **Anúncios/branding próprio** | Sim | Não | Não |

### Plano Lotérica / White-label (Fase 3)

| Item | Detalhe |
|---|---|
| Preço | A partir de **R$ 349/mês** (até 200 usuários finais), escalonado por faixa |
| Inclui | Subdomínio próprio, logo e cores, painel de gestão dos usuários, todos os recursos Pro para os usuários finais, relatórios agregados |
| Contrato | Anual, com SLA |
| ⚠️ Pré-requisito | Parecer jurídico específico — vender software de organização a permissionária é diferente de habilitá-la a comercializar cota (ver 03) |

---

## 5.3 Add-ons (receita incremental)

| Add-on | Preço | Aplicável a |
|---|---|---|
| Pacote 50 scans OCR | R$ 9,90 | Free, Premium |
| Pacote 200 mensagens IA | R$ 19,90 | Pro |
| Participantes extras no bolão (+20) | R$ 9,90/bolão | Premium |
| Bolão avulso (1 bolão, 30 dias, até 30 pessoas) | **R$ 14,90** | Free — captura sazonal na Mega da Virada |

> O **Bolão avulso** é estratégico: na Mega da Virada, milhares de organizadores casuais precisam do
> Bolão Manager por 3 semanas e não vão assinar mensalidade. Converte demanda sazonal em receita e
> deixa o produto instalado na base.

---

## 5.4 Gatilhos de paywall (onde o Free vira pago)

Cada limite do Free foi escolhido para ser **atingido naturalmente por um usuário engajado**, não para
frustrar o usuário casual.

| # | Gatilho | Persona | Upsell |
|---|---|---|---|
| G1 | Tentou cadastrar o 21º jogo ativo | Márcia, Ricardo | Premium |
| G2 | Tentou ativar conferência na 3ª modalidade | Márcia | Premium |
| G3 | Convidou o 6º participante para o bolão | Sandra | Premium ou Bolão avulso |
| G4 | Criou o 2º bolão | Sandra | Premium |
| G5 | Esgotou os 3 scans OCR do mês | Todos | Pacote ou Premium |
| G6 | Tentou fechamento acima de 16 dezenas | Ricardo | Premium |
| G7 | Consultou histórico com mais de 90 dias | Márcia | Premium |
| G8 | Tentou backtesting | Ricardo | **Pro** |
| G9 | Criou o 6º bolão ou passou de 30 participantes | Sandra | **Pro** |
| G10 | Quis notificação por WhatsApp | Todos | **Pro** |

**Regras de UX do paywall (importantes para não queimar o usuário):**
- O limite é sempre comunicado **antes** de o usuário perder trabalho. Ex.: ao criar o 20º jogo, avisar
  "este é seu último jogo no plano gratuito".
- Nunca apagar dados por downgrade — apenas bloquear a *criação* de novos e ocultar (não deletar) o excedente.
- Todo paywall mostra exatamente o que destrava e o preço, com CTA de teste.

**Trial:** 14 dias de Pro grátis, **sem cartão**, disparado no primeiro paywall atingido.
Sem cartão reduz atrito de ativação; a conversão vem do valor entregue, não do esquecimento de cancelar.

---

## 5.5 Meios de pagamento e a vantagem do Pix Automático

### O contexto

O **Pix Automático** (débito recorrente do Banco Central, Resolução BCB nº 422/2025) entrou em operação em
**janeiro de 2026**, com taxa de **0,22% a 0,35%** por transação — uma ordem de grandeza abaixo do cartão.

### Comparativo de custo por transação

Sobre uma assinatura Premium de **R$ 24,90/mês**:

| Meio | Taxa típica | Custo por cobrança | % da receita |
|---|---|---|---|
| **Pix Automático** | 0,22%–0,35% | **R$ 0,05 – R$ 0,09** | **~0,3%** |
| Cartão de crédito recorrente | ~3,99% + R$ 0,39 | R$ 1,38 | ~5,5% |
| Boleto | R$ 1,99 – R$ 3,49 fixo | R$ 1,99+ | ~8%+ |

Sobre uma base de **1.000 assinantes Premium** (R$ 24.900/mês de receita):

| Cenário | Custo mensal de adquirência | Custo anual |
|---|---|---|
| 100% cartão | ~R$ 1.380 | ~R$ 16.560 |
| 100% Pix Automático | ~R$ 75 | ~R$ 900 |
| **Economia** | **~R$ 1.305/mês** | **~R$ 15.660/ano** |

### Decisões

1. **Pix Automático é o meio padrão**, destacado como primeira opção no checkout.
2. **Incentivo explícito:** 5% de desconto para quem escolhe Pix Automático. Mesmo dando o desconto,
   a margem é muito superior ao cartão (0,3% + 5% = 5,3% vs. 5,5% do cartão — empata, mas com **menos
   chargeback e menos falha por cartão expirado**, que é a principal causa de churn involuntário).
3. **Cartão** disponível como alternativa (Visa/Master/Elo), para quem prefere.
4. **Boleto** apenas no plano anual e no B2B (custo fixo diluído).
5. **Gateway: Asaas.** Motivos: suporta Pix Automático nativamente para PJ, cobrança recorrente,
   cartão e boleto na mesma conta, webhooks confiáveis, operação nacional, sem necessidade de conta
   internacional. Alternativas avaliadas: Pagar.me (bom, mas Pix Automático menos maduro), Stripe
   (excelente DX, mas taxa maior e Pix sem recorrência nativa), Efí/OpenPix (bons para Pix, fracos em cartão).

> ⚠️ **Risco de churn involuntário:** com Pix Automático, a falha ocorre por saldo insuficiente, não por
> cartão expirado. Implementar **dunning** próprio: retry em D+1, D+3, D+5, com aviso por e-mail/push, e
> downgrade automático para Free (não exclusão) após D+7.

---

## 5.6 Unit economics

> Premissas: câmbio R$ 5,50/USD; preços de API Anthropic conforme
> [11-guia-de-modelos-ia.md](11-guia-de-modelos-ia.md); base de 10.000 usuários (500 pagantes).
> **São estimativas para planejamento, a serem recalibradas com dados reais na Sprint 8.**

### Custo variável por usuário/mês

| Item | Free | Premium | Pro |
|---|---|---|---|
| Infra (compute, DB, storage, banda) | R$ 0,10 | R$ 0,25 | R$ 0,60 |
| E-mail transacional (Resend) | R$ 0,02 | R$ 0,05 | R$ 0,08 |
| Push (OneSignal/FCM) | R$ 0,00 | R$ 0,01 | R$ 0,01 |
| WhatsApp (Meta Cloud API) | — | — | R$ 0,80 |
| OCR (Haiku 4.5 vision, ~R$ 0,014/scan) | R$ 0,04 | R$ 0,42 | R$ 1,50 |
| Assistente IA (com prompt caching) | — | — | **R$ 6,00** |
| Backtesting (compute em fila) | — | — | R$ 0,50 |
| Adquirência (Pix Automático) | — | R$ 0,07 | R$ 0,18 |
| **Total** | **~R$ 0,16** | **~R$ 1,05** | **~R$ 9,67** |

### Margem bruta

| Plano | Preço | Custo variável | **Margem bruta** | **%** |
|---|---|---|---|---|
| Premium mensal | R$ 24,90 | R$ 1,05 | **R$ 23,85** | **95,8%** |
| Premium anual (equiv./mês) | R$ 20,75 | R$ 1,05 | R$ 19,70 | 94,9% |
| Pro mensal | R$ 59,90 | R$ 9,67 | **R$ 50,23** | **83,9%** |
| Pro anual (equiv./mês) | R$ 49,92 | R$ 9,67 | R$ 40,25 | 80,6% |

**Observação crítica:** o **Assistente IA (D9) é 62% do custo variável do Pro.** Ele precisa de:
- Cota mensal rígida (150 mensagens), com add-on para excedente
- **Prompt caching agressivo** (histórico e system prompt cacheados — reduz o custo em até 90% do prefixo)
- **Roteamento por complexidade**: perguntas simples vão para Haiku 4.5; só as complexas para Sonnet 5
- Monitoramento por usuário, com alerta se algum ultrapassar 3× a média

Sem esses controles, um punhado de power users pode destruir a margem do Pro.

### Custo fixo mensal estimado (fase inicial, até 10k usuários)

| Item | Custo/mês |
|---|---|
| Vercel Pro | ~R$ 110 |
| Neon / Supabase (Postgres) | ~R$ 140 |
| Upstash Redis | ~R$ 60 |
| Railway (workers) | ~R$ 110 |
| Cloudflare R2 (storage) | ~R$ 30 |
| Sentry + PostHog | ~R$ 150 |
| Domínio, e-mail, misc | ~R$ 60 |
| **Total infra** | **~R$ 660/mês** |

**Break-even de infraestrutura:** ~28 assinantes Premium. Trivial.
O custo real do projeto é o **tempo de desenvolvimento**, não a operação.

### CAC e LTV (projeção)

| Métrica | Estimativa | Racional |
|---|---|---|
| **CAC via bolão (orgânico)** | ~R$ 0 | Cada bolão traz N-1 cadastros por convite. É o canal principal. |
| **CAC via SEO/conteúdo** | ~R$ 8 | "conferir lotofácil", "gerador mega sena" — alto volume, baixa concorrência comercial |
| **CAC via mídia paga** | R$ 35–60 | ⚠️ Ads de loteria têm restrições nas plataformas. Validar viabilidade antes de orçar. |
| **CAC blended (meta)** | R$ 15–25 | |
| **Churn mensal (meta)** | 6% | |
| **Vida média** | ~16,7 meses | 1/0,06 |
| **LTV Premium** | ~R$ 398 | 23,85 × 16,7 |
| **LTV Pro** | ~R$ 839 | 50,23 × 16,7 |
| **LTV/CAC** | **16–20×** | Saudável (referência de mercado: ≥ 3×) |

---

## 5.7 Projeção de receita (cenário base, 18 meses pós-GA)

Premissas: crescimento orgânico via bolão + SEO; conversão Free→Pago de 5%; mix 70% Premium / 30% Pro;
50% em plano anual.

| Mês | Usuários totais | Pagantes | MRR |
|---|---|---|---|
| M3 | 1.500 | 45 | ~R$ 1.500 |
| M6 | 5.000 | 200 | ~R$ 6.600 |
| M9 | 12.000 | 540 | ~R$ 17.800 |
| M12 | 25.000 | 1.250 | ~R$ 41.200 |
| M18 | 55.000 | 3.000 | ~R$ 99.000 |

**Sazonalidade:** esperar pico de 2–3× em novembro/dezembro (Mega da Virada) na aquisição, com queda
parcial em janeiro. O plano anual e o Bolão avulso existem em parte para capturar esse pico.

**Cenário conservador (−50%):** M18 com ~R$ 50 mil de MRR.
**Cenário otimista (+80%, se o Bolão Manager viralizar):** M18 com ~R$ 178 mil de MRR.

---

## 5.8 Estratégia de precificação — racional

| Decisão | Racional |
|---|---|
| **Freemium, não trial-only** | Os concorrentes cobram R$ 89–300/ano à vista. O Free destrói a barreira de entrada e é o combustível da viralidade do bolão. |
| **R$ 24,90 no Premium** | Abaixo da barreira psicológica de R$ 25. Comparável a uma assinatura de streaming. Equivale a ~7 apostas simples de Lotofácil/mês — ancoragem fácil de comunicar. |
| **R$ 59,90 no Pro** | 2,4× o Premium. Precisa entregar 2,4× o valor — e entrega (bolão ilimitado + backtesting + IA + WhatsApp). Ricardo já paga R$ 89–300/ano por menos. |
| **Anual com 17% (2 meses)** | Padrão de mercado, reduz churn e melhora o caixa. |
| **Desconto de 5% para Pix Automático** | Custo de adquirência 15× menor + menos churn involuntário paga o desconto com folga. |
| **Não cobrar por modalidade** | Complexidade desnecessária; o valor está na gestão integrada. |
| **Bolão avulso R$ 14,90** | Captura sazonalidade sem canibalizar assinatura (é caro por bolão, barato por evento). |

---

## 5.9 O que NÃO monetizar (lista de vetos)

| ❌ | Por quê |
|---|---|
| Comissão sobre valor de bolão | Risco jurídico grave (ver 03) |
| Taxa por cota vendida | Idem — é literalmente comercialização de cota |
| Percentual sobre prêmio | Idem |
| "Números premium com maior chance" | Publicidade enganosa + fraude |
| Venda de dados de apostadores | LGPD + destruição de confiança |
| Anúncios de casas de aposta (bets) no plano Free | Contaminação de posicionamento; público vulnerável; risco regulatório |

O plano Free pode exibir **cross-sell do próprio produto** e, eventualmente, publicidade de parceiros
não relacionados a jogo. Nunca bets.

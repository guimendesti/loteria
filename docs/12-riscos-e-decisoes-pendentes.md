# 12 — Riscos e Decisões Pendentes

---

# Parte A — Perguntas que precisam da sua resposta

Ordenadas por **quanto bloqueiam o início da implementação**.

## 🔴 Bloqueantes — precisam de resposta antes da Sprint 0

### Q1. O modelo de negócio está validado com você?

O planejamento inteiro assume que **não recebemos dinheiro de aposta, não vendemos cotas e não
intermediamos pagamento de bolão** — a receita é 100% assinatura de software
(ver [03-marco-legal-e-compliance.md](03-marco-legal-e-compliance.md)).

Isso foi decidido porque a pesquisa mostrou jurisprudência consistente contra a comercialização de
cotas de bolão por terceiros (MPF, Justiça Federal, TRF-3), e porque a Caixa não reconhece apostas
feitas em plataformas não oficiais.

**Você concorda com esse posicionamento conservador, ou quer explorar um modelo mais agressivo
(afiliação com revendedor autorizado, custódia de bolão)?**

> ⚠️ Se a resposta for "modelo mais agressivo", **grande parte do planejamento muda** — arquitetura,
> pricing, cronograma e exposição jurídica. Melhor decidir agora.

---

### Q2. Qual é o nome comercial?

O planejamento usa **"LotoPro"** como codinome. Antes de investir em marca, domínio e identidade:

| Opção | Prós | Contras |
|---|---|---|
| **LotoPro** | Direto, memorizável, .com.br provavelmente livre | Genérico; risco de colisão no INPI |
| **Bolão Certo** | Ancora no diferencial principal | Estreita demais o produto (não é só bolão) |
| **Sortear** / **Sortei** | Curto, brandável | Pode soar como "prometemos sorte" — conflita com o posicionamento |
| **Jogo Organizado** | Diz exatamente o que faz; alinhado ao compliance | Longo, pouco brandável |
| **Volante** | Curto, referência clara ao universo lotérico | Colisão com "volante" de carro |

**Ações necessárias:** busca de anterioridade no **INPI**, verificação de domínio `.com.br`,
verificação de handles em redes sociais. **Não pode conter "Caixa" nem imitar marcas registradas.**

**Qual você prefere? Ou tem outro?**

---

### Q3. Qual é o orçamento e o prazo real?

O cronograma de 18 semanas assume **você sozinho + Claude Code, ~60h por sprint**.

- **Você tem essa disponibilidade?** Se for meio período, o prazo dobra (36 semanas).
- **Vai contratar alguém?** Se sim, quem e quando? (As Sprints 5 e 6 são as mais paralelizáveis.)
- **Há orçamento para a consultoria jurídica?** Estimativa: R$ 3.000 – R$ 8.000 para um parecer
  sobre modelo de negócio + revisão de termos. **É o único custo verdadeiramente bloqueante.**
- **Há orçamento para marketing?** O plano assume crescimento majoritariamente orgânico (bolão + SEO).
  Se houver verba de mídia, o cronograma de aquisição muda.

---

### Q4. Este projeto é da Devnology ou pessoal?

Muda três coisas concretas:
- **CNPJ da conta no Asaas** (Pix Automático exige PJ)
- **Titularidade da marca** no INPI
- **Regime tributário** e emissão de nota fiscal da assinatura

---

## 🟡 Importantes — precisam de resposta até a Sprint 3

### Q5. Os preços fazem sentido para você?

Proposta: **Free · Premium R$ 24,90/mês · Pro R$ 59,90/mês** (ver [05](05-monetizacao-e-planos.md)).

Referências de mercado: Spolti cobra ~R$ 89/ano (licença anual à vista); Dez na Sorte e LotoCarva
não expõem preço publicamente.

- Você acha R$ 24,90 adequado, alto ou baixo para o público brasileiro de loteria?
- Concorda com **freemium** (vs. só trial de 14 dias)?
- Concorda com o **Bolão avulso a R$ 14,90** para capturar a Mega da Virada?

---

### Q6. Confirma o Asaas como gateway?

Recomendado por causa do **Pix Automático** (taxa 0,22–0,35% vs. ~4% de cartão — economia estimada de
R$ 15,6 mil/ano a cada 1.000 assinantes).

- **Você já tem conta no Asaas ou em outro gateway?**
- Alguma preferência por Pagar.me, Mercado Pago, Stripe ou Efí?
- Restrição de banco/adquirente por parte da Devnology?

---

### Q7. Notificação por WhatsApp: oficial ou não-oficial?

O plano prevê **Meta Cloud API (oficial)** no plano Pro. Custa por conversa e exige aprovação de
templates e verificação de negócio.

A alternativa (Z-API, Evolution API, não-oficiais) é mais barata e rápida, mas **arrisca banimento do
número e cria exposição de compliance**. Recomendação forte: **oficial**.

**Confirma? Ou prefere cortar WhatsApp do MVP e deixar só e-mail + push?**

---

### Q8. Confirma a stack técnica?

Recomendado: **Next.js 15 + tRPC + Prisma + PostgreSQL + BullMQ**, deploy em Vercel/Neon/Railway
(ver [06](06-arquitetura-tecnica.md)).

- Você tem experiência com essa stack? Alguma preferência diferente (NestJS, Laravel, .NET)?
- Alguma restrição de infraestrutura da Devnology (ex.: precisa ser AWS, precisa ser Brasil)?
- Existe algum código, componente ou design system reaproveitável de outro projeto seu?

---

## 🟢 Podem ser respondidas durante a execução

### Q9. Quais modalidades entram no MVP?

Recomendação: **as 9 modalidades de dezenas** no MVP; **Loteca e Federal na Fase 2** (são
estruturalmente diferentes e representam pouco do mercado).

Alternativa mais enxuta: só **Mega-Sena + Lotofácil** (74,8% da arrecadação) para acelerar o MVP em
~1 sprint. **Prefere velocidade ou cobertura?**

### Q10. Podemos usar as cores das modalidades?

O uso de verde para Mega, roxo para Lotofácil etc. é convenção amplamente adotada no mercado, mas
**precisa da chancela do advogado** junto com o parecer geral.

### Q11. Você tem acesso a apostadores para entrevistar?

As hipóteses H1–H6 de [01](01-pesquisa-de-mercado.md) — especialmente as de bolão — deveriam ser
validadas com **5 a 8 entrevistas antes da Sprint 6**. Você conhece organizadores de bolão?

### Q12. Vai fazer o design ou usar componentes prontos?

O plano assume **shadcn/ui + tokens customizados**, sem designer dedicado.
Se houver verba para design, a Sprint 2 fica mais forte visualmente.

### Q13. Já quer preparar o B2B?

A arquitetura multi-tenant está prevista desde o modelo de dados (custo marginal baixo agora,
alto depois). **Confirma que o white-label para lotéricas é um objetivo real de médio prazo?**
Se não for, dá para simplificar o schema.

---

# Parte B — Matriz de riscos

## B.1 Riscos jurídicos e regulatórios

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|:---:|:---:|---|
| RJ1 | Interpretação de que o Bolão Manager viola o monopólio da Caixa | Média | **Crítico** | Arquitetura de zero custódia (D1); bolão privado por convite (D3); **parecer jurídico na S3/S4**; disclaimers permanentes |
| RJ2 | Autuação por publicidade enganosa (promessa de ganho) | Baixa | Alto | Vetos de comunicação (D6); disclaimers obrigatórios; guardrails na IA; checklist de compliance em todo material |
| RJ3 | Notificação da Caixa por uso indevido de marca | Baixa | Médio | Uso apenas nominativo (D5); sem logo; disclaimer de não-vínculo; validação jurídica |
| RJ4 | Mudança regulatória (SPA/Fazenda) atingindo software de gestão | Baixa | Alto | Monitorar SPA e BNLData; arquitetura conservadora facilita adaptação |
| RJ5 | Vazamento de dados / incidente LGPD | Baixa | Alto | Criptografia de chave Pix; storage privado; auditoria; plano de resposta a incidente |
| RJ6 | Usuário menor de idade na base | Média | Médio | Declaração de maioridade; termos; exclusão imediata ao detectar |
| RJ7 | Conflito entre participantes de bolão com acionamento judicial contra nós | Média | Médio | Termo de responsabilidade do organizador (CL-42); recibo digital com hash; banner de não-responsabilidade (CL-63) |

## B.2 Riscos técnicos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|:---:|:---:|---|
| RT1 | **API da Caixa: falha de TLS em produção** ⚠️ *(falha real observada na pesquisa)* | **Alta** | **Alto** | Agente HTTPS configurado; **validar em Linux na S1**; mirror open-source self-hospedado como plano B |
| RT2 | API da Caixa muda schema ou sai do ar sem aviso | Média | Alto | Validação Zod + alerta; 2 fallbacks; circuit breaker; `rawPayload` permite reprocessar |
| RT3 | Conferência com erro em faixa de premiação (ex.: Lotomania 0 acertos, Dupla Sena 2 sorteios) | Média | **Alto** | Testes unitários obrigatórios com casos reais do histórico nas 11 modalidades (S1.9) |
| RT4 | **Payload Pix EMV inválido** (CRC16, TLV) | Média | **Alto** | Usar biblioteca validada; testar com 4+ bancos na S6 |
| RT5 | Erro de arredondamento no rateio de bolão | Média | **Alto** | Centavos inteiros; distribuição explícita do resto; testes de propriedade (soma sempre exata) |
| RT6 | Matriz de fechamento com garantia incorreta | Média | Alto | `verifiedAt` obrigatório; verificação exaustiva offline; matriz não verificada nunca é exposta |
| RT7 | Fila de conferência não escala no pico | Baixa | Alto | Processamento em lote; índice dedicado; teste de carga na S8 |
| RT8 | Indisponibilidade na janela crítica (21h–23h de sorteio) | Média | Alto | Healthchecks; alerta P1; página de status; a conferência é assíncrona (tolera atraso curto) |
| RT9 | Custo de IA acima do previsto | Média | Médio | Cotas rígidas; roteamento por complexidade; caching; alerta por usuário |
| RT10 | OCR abaixo de 90% de acurácia | Baixa | Médio | Fallback manual sempre disponível; escalação para Sonnet 5 (visão de alta resolução) |

## B.3 Riscos de produto e mercado

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|:---:|:---:|---|
| RP1 | **O Bolão Manager não viraliza** | Média | **Alto** | Medir na S6 (meta ≥ 3,0 cadastros/bolão); fluxo de convite com no máximo 5 telas; se falhar, repivotar para conferência automática como wedge |
| RP2 | Conversão Free→Pago abaixo de 5% | Média | Alto | 10 gatilhos de paywall instrumentados no PostHog; A/B de limites; trial sem cartão |
| RP3 | Público não paga por software de loteria | Baixa | **Crítico** | Concorrentes cobram há anos R$ 89–300/ano — a demanda existe. Freemium reduz o risco de descoberta tardia |
| RP4 | Concorrente copia o Bolão Manager | Média | Médio | Vantagem de 12–18 meses (exige reescrita arquitetural para eles); efeito de rede do bolão |
| RP5 | Sazonalidade forte demais (só funciona na Virada) | Média | Médio | Lotofácil é diária e cria hábito; alertas de acumulado reativam; plano anual amortece |
| RP6 | Restrição de anúncios de loteria nas plataformas | **Alta** | Médio | Plano já assume crescimento orgânico (bolão + SEO); **validar políticas de Meta/Google antes de orçar mídia** |
| RP7 | Churn alto após o primeiro mês | Média | Alto | Conferência automática cria valor passivo contínuo; resumo mensal da carteira; plano anual |

## B.4 Riscos operacionais

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|:---:|:---:|---|
| RO1 | Fator-ônibus = 1 (só o Guilherme) | **Alta** | **Alto** | Documentação completa (este repositório); runbooks (S8.9); código convencional e testado |
| RO2 | Escopo do Bolão Manager cresce e estoura a S6 | **Alta** | Médio | Escopo congelado em [08](08-especificacao-funcional.md); extras vão para T+1 |
| RO3 | Suporte cresce mais rápido que a capacidade | Média | Médio | FAQ robusto; base de conhecimento; suporte por e-mail com SLA por plano |
| RO4 | Churn involuntário por falha de Pix Automático | Média | Médio | Dunning D+1/D+3/D+5; downgrade (não exclusão) em D+7; aviso multicanal |

---

# Parte C — Decisões já tomadas (registro)

Para não serem re-discutidas sem motivo novo:

| # | Decisão | Justificativa | Doc |
|---|---|---|---|
| DEC-01 | Não operar loteria; vender só software | Monopólio da Caixa + jurisprudência | [03](03-marco-legal-e-compliance.md) |
| DEC-02 | Zero custódia de valores de bolão | Risco jurídico | [03](03-marco-legal-e-compliance.md) |
| DEC-03 | Bolão Manager como diferencial central | Lacuna de mercado comprovada | [02](02-analise-de-concorrencia.md) |
| DEC-04 | Freemium com 3 planos B2C | Barreira de entrada + viralidade | [05](05-monetizacao-e-planos.md) |
| DEC-05 | Pix Automático como meio padrão | 15× mais barato que cartão | [05](05-monetizacao-e-planos.md) |
| DEC-06 | Next.js + tRPC (monólito modular), não NestJS | Velocidade com time pequeno; domínio isolado em `packages/core` | [06](06-arquitetura-tecnica.md) |
| DEC-07 | Modalidade como dado, não código | Extensibilidade para loterias estaduais | [06](06-arquitetura-tecnica.md) |
| DEC-08 | Matrizes de fechamento pré-computadas e verificadas | Força bruta é inviável em runtime | [06](06-arquitetura-tecnica.md) |
| DEC-09 | Multi-tenant desde o schema | B2B sem refatoração | [07](07-modelo-de-dados.md) |
| DEC-10 | Opus 5 para arquitetura/algoritmos, Sonnet 5 para implementação, Haiku 4.5 para mecânico e OCR | Custo/qualidade | [11](11-guia-de-modelos-ia.md) |
| DEC-11 | PWA em vez de app nativo no MVP | Custo/benefício antes do PMF | [06](06-arquitetura-tecnica.md) |
| DEC-12 | Backtesting posicionado como ferramenta honesta, não como prova de método | Compliance + confiança | [04](04-produto-personas-e-diferenciais.md) |

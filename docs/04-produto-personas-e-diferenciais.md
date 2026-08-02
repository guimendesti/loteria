# 04 — Produto, Personas e Diferenciais

## 4.1 Visão

> **O LotoPro é onde suas apostas moram.**
> Você joga na Caixa. Você organiza, confere, analisa e divide aqui.

**Proposta de valor em uma frase:**
"Cadastre seus jogos uma vez e nunca mais perca um prêmio, esqueça um concurso ou brigue num bolão."

**O que somos:** software de gestão, inteligência e colaboração para apostadores de loteria.
**O que não somos:** casa de aposta, revendedor, intermediário financeiro, vidente.

---

## 4.2 Personas

### P1 — Márcia, 47, a Recorrente (persona primária, ~50% da base)

- Joga Lotofácil 3× por semana e Mega aos sábados. Sempre os mesmos números (aniversários da família).
- Guarda os bilhetes numa gaveta. Confere "quando lembra". Já perdeu prêmio pequeno por não conferir a tempo.
- Não usa software nenhum. Acha os programas atuais "coisa de computador, complicado".
- **Dor:** desorganização e esquecimento.
- **Job to be done:** "Quero saber, sem esforço, se ganhei alguma coisa."
- **Gatilho de conversão:** primeira notificação de acerto. Plano provável: Free → Premium.

### P2 — Ricardo, 35, o Estrategista (~20% da base, maior ARPU)

- Estuda estatística de Lotofácil. Já usou planilha, já pagou por software desktop.
- Faz fechamentos de 18 e 20 dezenas. Conhece "matriz de garantia".
- Cético e exigente. Vai testar se nosso fechamento é matematicamente correto.
- **Dor:** ferramentas feias, desktop, sem mobilidade, sem backtesting confiável.
- **Job to be done:** "Quero montar e validar minha estratégia com rigor, e testá-la contra o histórico."
- **Gatilho de conversão:** limite de fechamento no plano Free. Plano provável: Pro.
- **Cuidado:** é a persona que mais nos expõe ao risco de promessa de ganho. A comunicação com ele
  precisa ser honesta: "backtesting mostra o que teria acontecido, não o que vai acontecer".

### P3 — Sandra, 41, a Organizadora de Bolão (persona estratégica — motor de crescimento)

- Organiza o bolão do escritório (18 pessoas) e o da família na Mega da Virada.
- Controla em planilha do Google, cobra por WhatsApp, recebe Pix, tira foto do bilhete e manda no grupo.
- Já teve problema: gente que não pagou e quis parte do prêmio; gente que desconfiou do valor do rateio.
- **Dor:** trabalho manual, cobrança chata, falta de transparência, risco de conflito.
- **Job to be done:** "Quero organizar o bolão sem virar tesoureira e sem ninguém desconfiar de mim."
- **Gatilho de conversão:** limite de participantes/bolões no Free. Plano provável: Pro.
- **Por que é estratégica:** cada bolão que ela cria traz N cadastros novos (os participantes).
  **CAC efetivo próximo de zero.** É o motor de aquisição do produto.

### P4 — Seu Antônio, 58, o Casual (~25% da base, majoritariamente Free)

- Joga quando acumula. Aposta simples. Um ou dois jogos.
- **Dor:** quase nenhuma. Ele não tem problema a resolver.
- **Job to be done:** "Me avisa quando o prêmio estiver grande e se eu ganhei."
- **Valor para nós:** volume, viralidade (entra por bolão), e possível conversão em concursos especiais.
- Plano: Free permanente. Monetização por anúncio próprio/cross-sell, não por assinatura.

### P5 — Lotérica São Jorge (B2B, Fase 3)

- Permissionária da Caixa. Quer oferecer gestão de bolão aos clientes com a própria marca.
- **Job to be done:** "Quero fidelizar meu cliente e organizar os bolões que já faço, com minha marca."
- Plano: White-label. Ticket R$ 349+/mês.
- ⚠️ **Atenção jurídica:** vender *software de organização* para lotérica é diferente de habilitá-la a
  *vender cota de bolão* (o que a Justiça Federal já proibiu). O produto B2B precisa ser desenhado com
  o mesmo rigor de não-custódia. Exige parecer específico.

---

## 4.3 Os 10 diferenciais comercializáveis

Ordenados por **força competitiva** (quanto é difícil de copiar × quanto o usuário paga por isso).

---

### ⭐ D1 — Bolão Manager (o feature-killer)

**O que é:** gestão completa de bolões privados de loteria entre pessoas conhecidas.

**Fluxo:**
1. Sandra cria o bolão: modalidade, concurso(s), jogos que serão apostados, número de cotas, valor da cota.
   O sistema calcula automaticamente: custo total, valor por cota, cotas disponíveis.
2. Gera **link de convite** (compartilhável no WhatsApp com um toque) e um QR code.
3. Participantes entram, escolhem quantas cotas querem, e recebem um **Pix copia-e-cola** apontando para a
   chave da Sandra. Pagam direto para ela. **O LotoPro não toca no dinheiro.**
4. Sandra marca quem pagou (ou o sistema sugere pela conciliação que *ela* fizer).
5. Sandra aposta na lotérica/app da Caixa e **fotografa o comprovante**. O OCR (D5) importa as dezenas
   e o comprovante fica anexado — **visível para todos os participantes**. Fim da desconfiança.
6. Após o sorteio: conferência automática. Se premiado, o sistema calcula o **rateio proporcional por cota**,
   já mostrando quanto cada um tem a receber, e gera os Pix de devolução (Sandra → participantes).
7. Cada participante recebe um **recibo digital** com hash, registrando cotas, pagamento, jogos e rateio.

**Por que ninguém copia rápido:** exige multiusuário, convite, autorização granular, pagamento, storage de
imagem e um modelo de confiança. Software desktop não tem arquitetura para isso. E os apps de bolão são
todos de futebol, com modelo de dados incompatível (palpite ≠ cota).

**Como vendemos:** limite de bolões e de participantes por plano. Free: 1 bolão / 5 participantes.
Premium: 5 bolões / 30 participantes. Pro: ilimitado.

---

### ⭐ D2 — Conferência automática multi-concurso com notificação

**O que é:** o usuário cadastra um jogo uma vez e diz "vale para os próximos 8 concursos". O sistema confere
sozinho, todos os concursos, minutos após o sorteio, e **notifica**.

**Por que importa:** transforma o produto de "ferramenta que eu abro" em "serviço que me procura".
É o que gera retenção. É o momento de maior valor percebido (P1: "quero saber se ganhei sem esforço").

**Canais:** push (PWA), e-mail, e WhatsApp (Pro). O usuário escolhe se quer ser notificado sempre,
só quando acertar algo, ou só quando for premiado.

**Como vendemos:** Free confere 2 modalidades e envia e-mail. Premium: todas as modalidades + push.
Pro: + WhatsApp e notificação para todos os participantes do bolão.

---

### ⭐ D3 — Motor de fechamentos e desdobramentos com garantia

**O que é:** "quero jogar 18 dezenas na Lotofácil garantindo 14 pontos se 15 das minhas dezenas saírem —
com o menor número de jogos possível." O sistema entrega o conjunto mínimo de cartões.

**Base matemática:** *covering designs*. As matrizes ótimas são resultado de pesquisa combinatória —
**não são geradas em tempo real com força bruta.** Estratégia:
- Curar/pré-computar uma biblioteca de matrizes de garantia por (modalidade, dezenas, garantia).
- Armazenar como dado versionado, com metadados de custo (nº de jogos) e garantia comprovada.
- Validar cada matriz por verificação exaustiva **uma vez**, offline, e marcar como verificada.
- Em runtime: consultar a matriz e aplicar às dezenas escolhidas pelo usuário. É O(1) de CPU.

**Por que importa:** é o recurso pelo qual o Ricardo (P2) já paga hoje. É paridade obrigatória com Spolti
e Dez na Sorte — e podemos superá-los mostrando **o custo em reais e a garantia explícita** antes de gerar.

**Como vendemos:** Free: fechamentos até 16 dezenas. Premium: até 20. Pro: biblioteca completa +
fechamento customizado + exportação.

---

### D4 — Backtesting honesto

**O que é:** "se eu tivesse jogado esta estratégia nos últimos 500 concursos, teria gasto R$ X e recuperado R$ Y."

**Por que é um diferencial:** os concorrentes têm simuladores, mas os usam como argumento de venda de
"método que funciona". Nós fazemos o contrário: **usamos o backtesting para ser honestos.** O relatório
sempre termina com o resultado real (que, matematicamente, tende a ser negativo) e o disclaimer de que
sorteios são independentes.

**Contraintuitivamente, isso vende mais**, porque cria confiança num mercado cheio de promessa vazia.
E entrega valor real: o usuário descobre que gastar R$ 300/mês em fechamento não compensa e ajusta o
comportamento — o que é jogo responsável, e nos protege juridicamente.

**Como vendemos:** exclusivo do plano Pro. É computacionalmente caro (roda em fila, não em request).

---

### D5 — Scanner de volante (OCR com IA)

**O que é:** o usuário fotografa o comprovante da lotérica; o sistema extrai modalidade, concurso e dezenas
e cria o jogo automaticamente.

**Por que importa:** mata a maior fricção do produto — digitar dezenas. Reduz o tempo de "quero cadastrar
meu jogo" de 90 segundos para 5. Para o bolão (D1), é o que permite anexar o comprovante *e* importar os
jogos numa ação só.

**Como implementamos:** modelo de visão da Anthropic (Claude Haiku 4.5 — ver
[11-guia-de-modelos-ia.md](11-guia-de-modelos-ia.md)) com output estruturado. Custo estimado abaixo de
R$ 0,01 por comprovante. Sempre com **tela de confirmação** — o usuário revisa antes de salvar.

**Como vendemos:** Free: 3 scans/mês. Premium: 30/mês. Pro: ilimitado (fair use).
Pacotes de crédito avulso como add-on.

---

### D6 — Carteira e ROI real

**O que é:** dashboard financeiro pessoal: quanto gastou por mês, por modalidade, por estratégia; quanto
recuperou; ROI; comparativo. Exportável em CSV.

**Por que importa:** ninguém oferece. Responde a uma pergunta que todo apostador tem e nenhum sabe
responder. É também o pilar do jogo responsável (R3) e um gancho de retenção mensal ("veja seu resumo de julho").

**Como vendemos:** Free: mês corrente. Premium: histórico completo + gráficos. Pro: + relatório exportável
e comparativo entre estratégias.

---

### D7 — Alertas inteligentes de concurso

**O que é:** três automações:
1. **Acumulado:** "A Mega acumulou R$ 120 milhões para quinta." (regra sobre `valorEstimadoProximoConcurso`)
2. **Fechamento de apostas:** "Faltam 2 horas para o encerramento e você não registrou jogo para o 3040."
3. **Concurso especial:** "Mega da Virada abriu. Quer recriar seu bolão do ano passado?"

**Por que importa:** é canal de reativação **gratuito e automático**. Traz o usuário de volta sem custo de mídia.

**Como vendemos:** Free: alerta de acumulado por e-mail. Premium: + push e alerta de fechamento.
Pro: + WhatsApp e regras customizadas ("me avise quando a Quina passar de R$ 10 mi").

---

### D8 — Impressão e exportação em formato oficial

**O que é:** gerar PDF dos jogos no layout do volante oficial (para marcar e levar à lotérica), em A4
compacto, ou exportar para o formato aceito no upload em massa do app da Caixa (quando aplicável).

**Por que importa:** paridade obrigatória — todos os concorrentes têm. Fecha o ciclo "gerei aqui → aposto lá".

**Como vendemos:** Free: A4 simples, com marca d'água. Premium/Pro: todos os formatos, sem marca.

---

### D9 — Assistente de análise com IA

**O que é:** chat que responde em linguagem natural sobre **os dados do próprio usuário e o histórico público**:
"quais das minhas dezenas mais saíram nos últimos 50 concursos?", "resuma meu desempenho do semestre",
"monte um fechamento de 17 dezenas com as que eu mais uso".

**Guardrails obrigatórios (não negociáveis):**
- System prompt proíbe explicitamente prever resultados ou sugerir que alguma escolha é mais provável.
- Toda resposta sobre probabilidade retorna o fato matemático correto (sorteios independentes).
- Não inventa números "quentes" como recomendação — apenas descreve o histórico e deixa a escolha ao usuário.

**Como vendemos:** exclusivo Pro, com cota mensal de mensagens. Custo controlado (ver 11).

---

### D10 — API pessoal e White-label B2B

**O que é:**
- **API pessoal (Pro):** token para o usuário integrar seus jogos com planilha, Zapier, script próprio.
- **White-label (B2B):** instância com marca, domínio e cores do cliente (lotérica, influenciador de loteria,
  comunidade), com painel de gestão dos seus usuários.

**Por que importa:** ticket alto, baixa concorrência (zero players), e a arquitetura multi-tenant necessária
é barata se prevista desde o início (e cara se retrofitada depois).

**Como vendemos:** Pro inclui API pessoal. White-label é plano próprio, sob contrato.

---

## 4.4 Mapa diferencial → persona → plano

| Diferencial | P1 Márcia | P2 Ricardo | P3 Sandra | P4 Antônio | Plano onde entra |
|---|:---:|:---:|:---:|:---:|---|
| D1 Bolão Manager | ○ | ○ | ●●● | ●● | Free (limitado) → Pro |
| D2 Conferência auto | ●●● | ●● | ●● | ●● | Free (limitado) → Premium |
| D3 Fechamentos | ○ | ●●● | ○ | ○ | Premium → Pro |
| D4 Backtesting | ○ | ●●● | ○ | ○ | **Pro** |
| D5 OCR de volante | ●● | ●● | ●●● | ● | Free (3/mês) → Pro |
| D6 Carteira/ROI | ●● | ●●● | ●● | ○ | Free (parcial) → Premium |
| D7 Alertas | ●●● | ● | ●● | ●●● | Free → Pro |
| D8 Impressão | ● | ●●● | ●● | ○ | Free (limitado) → Premium |
| D9 Assistente IA | ● | ●●● | ● | ○ | **Pro** |
| D10 API / White-label | ○ | ●● | ○ | ○ | Pro / B2B |

●●● essencial · ●● relevante · ● marginal · ○ irrelevante

**Leitura:** o plano Premium é vendido por **D2 + D6 + D3**; o Pro por **D1 ilimitado + D4 + D9**.
O Free existe para capturar D1 (viralidade de bolão) e D7 (reativação).

---

## 4.5 Escopo por fase

| Fase | Sprints | Diferenciais entregues |
|---|---|---|
| **MVP comercial** (beta fechado) | S0–S4 | D2 (base), D6 (base), D7 (acumulado), gestão de jogos, planos, backoffice |
| **Competitividade** | S5 | D3, D8, estatísticas completas |
| **Wedge** | S6 | **D1 Bolão Manager completo** |
| **Encantamento** | S7 | D5 OCR, D4 Backtesting, D9 Assistente IA |
| **GA** | S8 | D7 completo, D10 API pessoal, hardening, LGPD, jogo responsável |
| **Fase 3** (pós-GA) | — | D10 White-label B2B, loterias estaduais, app nativo |

---

## 4.6 Métricas de produto (North Star e suporte)

**North Star Metric:** *jogos ativos conferidos automaticamente por semana.*
Captura simultaneamente aquisição (mais usuários), ativação (cadastrou jogo) e retenção (jogo ainda ativo).

| Métrica | Definição | Meta 6 meses pós-GA |
|---|---|---|
| Ativação | % de cadastros que registram ≥1 jogo em 24h | ≥ 60% |
| Aha moment | % que recebe a 1ª notificação de conferência em 7 dias | ≥ 70% |
| Retenção D30 | % ativos 30 dias após cadastro | ≥ 35% |
| Conversão Free→Pago | % da base ativa em plano pago | ≥ 5% |
| Viralidade de bolão | Novos cadastros gerados por convite / bolão criado | ≥ 3,0 |
| Churn mensal (pago) | | ≤ 6% |
| NPS | | ≥ 45 |

# 08 — Especificação Funcional

Convenção de identificadores: `LP-xx` landing · `AU-xx` autenticação · `CL-xx` painel do cliente ·
`BO-xx` backoffice · `SY-xx` sistema/workers.
Prioridade: **P0** = MVP · **P1** = pós-MVP · **P2** = fase 3.

---

# Parte A — Landing Page

## A.1 Objetivo

Converter visitante em cadastro (Free) e cadastro em assinatura. Ranquear organicamente em buscas de
alto volume ("conferir lotofácil", "gerador mega sena", "como fazer bolão de loteria").

## A.2 Estrutura de páginas

| ID | Página | Rota | Renderização | Prioridade |
|---|---|---|---|---|
| LP-01 | Home | `/` | SSG + ISR | P0 |
| LP-02 | Planos e preços | `/planos` | SSG | P0 |
| LP-03 | Recursos — visão geral | `/recursos` | SSG | P0 |
| LP-04 | Recurso: Bolão Manager | `/recursos/bolao` | SSG | P0 |
| LP-05 | Recurso: Conferência automática | `/recursos/conferencia` | SSG | P1 |
| LP-06 | Recurso: Fechamentos | `/recursos/fechamentos` | SSG | P1 |
| LP-07 | Resultados públicos por modalidade | `/resultados/[modalidade]` | ISR (revalida pós-sorteio) | **P0 — motor de SEO** |
| LP-08 | Conferidor público (sem login) | `/conferir/[modalidade]` | SSR | **P0 — isca de aquisição** |
| LP-09 | Blog / conteúdo | `/blog`, `/blog/[slug]` | SSG | P1 |
| LP-10 | FAQ | `/faq` | SSG | P0 |
| LP-11 | Jogo responsável | `/jogo-responsavel` | SSG | P0 (compliance) |
| LP-12 | Termos de uso | `/termos` | SSG | P0 (compliance) |
| LP-13 | Política de privacidade | `/privacidade` | SSG | P0 (compliance) |
| LP-14 | Contato / suporte | `/contato` | SSR | P0 |
| LP-15 | Página de status | `/status` | SSR | P1 |

## A.3 Home — seções (ordem)

1. **Hero.** Headline: *"Seus jogos e bolões de loteria, finalmente organizados."*
   Sub: *"Cadastre uma vez. O LotoPro confere todos os concursos e te avisa se você ganhou."*
   CTA primário: "Começar grátis". CTA secundário: "Ver planos". Mockup do painel no celular.
2. **Prova de dor** (3 cards): "Perdeu prêmio por não conferir?" · "Bolão virou planilha e briga?" ·
   "Não sabe quanto já gastou?"
3. **Como funciona** (3 passos): Cadastre seus jogos → Aposte na Caixa → Receba o resultado no celular.
4. **Bolão Manager** — seção destacada, com demo visual do fluxo de convite → Pix → comprovante → rateio.
5. **Recursos** — grid dos 10 diferenciais.
6. **Resultados ao vivo** — últimos concursos de Mega e Lotofácil (também alimenta SEO e dá utilidade imediata).
7. **Planos** — comparativo resumido com CTA.
8. **FAQ** com foco nas objeções: "vocês apostam por mim?" (não), "tem vínculo com a Caixa?" (não),
   "isso aumenta minha chance?" (não, e explicamos por quê).
9. **Rodapé** com disclaimer legal obrigatório (ver [03](03-marco-legal-e-compliance.md) D4).

## A.4 Requisitos de SEO (LP-07 e LP-08 são o motor)

| Requisito | Detalhe |
|---|---|
| LP-07 gera 11 páginas | Uma por modalidade, com resultado mais recente + histórico paginado |
| Revalidação | ISR disparado por evento `contest.settled` — resultado no ar em < 5 min |
| Schema.org | `WebPage` + `FAQPage` + `Dataset` para resultados |
| Metadados | `generateMetadata` dinâmico com número do concurso e data |
| Sitemap | `sitemap.xml` dinâmico, atualizado a cada concurso |
| Core Web Vitals | LCP < 1,5s; CLS < 0,1; INP < 200ms |
| Conteúdo | Cada página de resultado traz estatística resumida (dezenas mais/menos sorteadas) — conteúdo único, não thin content |

**LP-08 (conferidor público)** é a maior isca de aquisição: o visitante cola seus números, confere de graça,
e o CTA no resultado é *"Quer que a gente confira automaticamente todo concurso? Crie sua conta grátis."*
Limite: 3 conferências por sessão sem login.

---

# Parte B — Autenticação

| ID | Requisito | Prio |
|---|---|---|
| AU-01 | Cadastro com e-mail + senha; validação de força; **checkbox obrigatório de maioridade** e aceite dos termos | P0 |
| AU-02 | Login com e-mail + senha | P0 |
| AU-03 | Login social com Google | P0 |
| AU-04 | Verificação de e-mail por link mágico (não bloqueante — usuário já usa o produto, mas não recebe notificação até verificar) | P0 |
| AU-05 | Recuperação de senha (token de uso único, TTL 30 min) | P0 |
| AU-06 | Logout (invalida sessão no servidor) | P0 |
| AU-07 | **Cadastro por convite de bolão** — fluxo curto (nome + e-mail), já com o bolão vinculado | **P0 — crítico para viralidade** |
| AU-08 | Rate limiting: 5 tentativas de login/15 min por IP+e-mail | P0 |
| AU-09 | 2FA por TOTP (opcional) | P1 |
| AU-10 | Sessões ativas listadas, com revogação individual | P1 |

**AU-07 é o requisito de maior alavancagem do produto.** O convidado clica no link do WhatsApp, vê o bolão
(nome, organizador, cotas, valor), e o cadastro pede apenas nome e e-mail. Qualquer atrito aqui mata a viralidade.

---

# Parte C — Painel do Cliente

## C.1 Dashboard (`/app`)

| ID | Requisito | Prio |
|---|---|---|
| CL-01 | Cards de resumo: jogos ativos, próximo sorteio (contagem regressiva), gasto do mês, prêmios do mês | P0 |
| CL-02 | Feed "Últimos resultados" com destaque para os concursos em que o usuário tinha jogo | P0 |
| CL-03 | Alerta de acumulado em destaque | P0 |
| CL-04 | Bolões ativos com status (aguardando pagamento / apostado / apurado) | P0 |
| CL-05 | Onboarding guiado ao primeiro acesso (3 passos até o primeiro jogo cadastrado) | P0 |
| CL-06 | Widget de gasto vs. retorno do mês | P1 |

**Meta de onboarding:** do cadastro ao primeiro jogo salvo em **menos de 3 minutos**.

## C.2 Meus Jogos (`/app/jogos`) — núcleo do produto

| ID | Requisito | Prio |
|---|---|---|
| CL-10 | Listagem com filtros: modalidade, status (ativo/encerrado), concurso, resultado (premiado/não), origem | P0 |
| CL-11 | Agrupamento **por concurso** e por modalidade — o usuário pensa em "meus jogos do 3040" | P0 |
| CL-12 | **Cadastro manual** de jogo: seletor visual de dezenas com validação em tempo real (mín/máx, campo extra) | P0 |
| CL-13 | Aposta **multi-concurso**: "vale do concurso 3040 ao 3047" com cálculo do custo total | P0 |
| CL-14 | Exibição de custo por jogo e total, usando a tabela de preços vigente | P0 |
| CL-15 | Edição de jogo (permitida apenas antes do primeiro sorteio) | P0 |
| CL-16 | Exclusão / arquivamento (soft delete) | P0 |
| CL-17 | Duplicar jogo para novo concurso (1 clique) | P0 |
| CL-18 | Anexar comprovante (imagem/PDF) | P0 |
| CL-19 | **OCR de comprovante** — importa dezenas automaticamente, com tela de confirmação obrigatória | P1 |
| CL-20 | Import em lote via CSV/Excel | P1 |
| CL-21 | Detalhe do jogo com histórico de conferências por concurso | P0 |
| CL-22 | Indicador visual de acertos por dezena no resultado (bolinhas verdes/cinzas) | P0 |

**CL-12 — o seletor de dezenas** é o componente mais usado do produto. Requisitos:
grid responsivo, toque confortável no mobile (mínimo 44×44px), contador de selecionadas,
feedback de custo em tempo real, botões "surpresinha", "limpar", "repetir último jogo",
suporte a campo extra por modalidade, e navegação por teclado completa.

## C.3 Gerador e Fechamentos (`/app/gerador`)

| ID | Requisito | Prio |
|---|---|---|
| CL-30 | Geração aleatória simples (N jogos) | P0 |
| CL-31 | Filtros: pares/ímpares, soma, primos, quadrantes, repetidas do concurso anterior, sequências, dezenas fixas, dezenas excluídas | P1 |
| CL-32 | Salvar filtros como **Estratégia** nomeada e reutilizável | P1 |
| CL-33 | **Fechamento por matriz de garantia**: escolher N dezenas → escolher garantia → ver nº de jogos e custo → gerar | P1 |
| CL-34 | Prévia obrigatória com custo total antes de salvar | P1 |
| CL-35 | Salvar lote gerado como apostas (com `batchId`) | P1 |
| CL-36 | **Disclaimer de aleatoriedade fixo na tela** (compliance) | P0 |
| CL-37 | Fechamento customizado fora da biblioteca (assíncrono, plano Pro) | P2 |

## C.4 Bolões (`/app/boloes`) — o diferencial

### Fluxo do organizador

| ID | Requisito | Prio |
|---|---|---|
| CL-40 | Criar bolão: nome, modalidade, faixa de concursos, jogos, nº de cotas → sistema calcula custo total e valor da cota | P1 |
| CL-41 | Cadastrar/confirmar **chave Pix própria** (criptografada) — obrigatório antes de abrir o bolão | P1 |
| CL-42 | Aceite explícito do **termo de responsabilidade do organizador** (registrado com timestamp) | **P1 — compliance** |
| CL-43 | Gerar link de convite + QR code + botão "Compartilhar no WhatsApp" com texto pronto | P1 |
| CL-44 | Painel de participantes: quem entrou, quantas cotas, status de pagamento | P1 |
| CL-45 | Marcar pagamento como recebido (manual) | P1 |
| CL-46 | Adicionar participante manualmente (para quem não tem conta) | P1 |
| CL-47 | Fechar bolão (encerra entradas) | P1 |
| CL-48 | **Anexar comprovante da aposta oficial** — visível a todos os participantes | **P1 — é o que gera confiança** |
| CL-49 | Ver rateio calculado após o sorteio, com valor devido a cada participante | P1 |
| CL-50 | Gerar Pix de devolução para cada participante e marcar como pago | P1 |
| CL-51 | Cancelar bolão (com notificação a todos) | P1 |

### Fluxo do participante

| ID | Requisito | Prio |
|---|---|---|
| CL-55 | Abrir link de convite **sem login** e ver: nome do bolão, organizador, modalidade, cotas disponíveis, valor da cota, jogos | P1 |
| CL-56 | Entrar no bolão escolhendo nº de cotas (cadastro curto se não tiver conta — AU-07) | P1 |
| CL-57 | Receber **Pix copia-e-cola + QR** apontando para a chave do organizador | P1 |
| CL-58 | Declarar pagamento e anexar comprovante (opcional) | P1 |
| CL-59 | Ver o comprovante oficial da aposta anexado pelo organizador | P1 |
| CL-60 | Ver a conferência do bolão e o próprio rateio | P1 |
| CL-61 | Receber **recibo digital** com hash: cotas, valor pago, jogos, rateio | P1 |
| CL-62 | Sair do bolão antes do fechamento | P1 |

**Requisito de compliance transversal (CL-63):** em toda tela de bolão, banner permanente:
*"O LotoPro não recebe, não guarda e não repassa valores. Os pagamentos são feitos diretamente entre você e o
organizador. O organizador é o único responsável por realizar a aposta e guardar o comprovante."*

## C.5 Resultados e Conferência (`/app/resultados`)

| ID | Requisito | Prio |
|---|---|---|
| CL-70 | Últimos resultados por modalidade, com detalhamento de premiação | P0 |
| CL-71 | Busca de concurso por número ou data | P0 |
| CL-72 | Conferência automática exibida no jogo (sem ação do usuário) | P0 |
| CL-73 | Conferência manual sob demanda ("conferir agora") | P0 |
| CL-74 | Histórico completo de conferências, filtrável | P0 |
| CL-75 | Destaque visual de jogos premiados | P0 |

## C.6 Estatísticas (`/app/estatisticas`)

| ID | Requisito | Prio |
|---|---|---|
| CL-80 | Frequência de cada dezena (período configurável) | P1 |
| CL-81 | Atraso (concursos desde a última aparição) | P1 |
| CL-82 | Distribuição de soma, pares/ímpares, primos, quadrantes | P1 |
| CL-83 | Mapa de calor do volante | P1 |
| CL-84 | Pares/trios que mais saem juntos | P2 |
| CL-85 | Análise de ciclos | P2 |
| CL-86 | **Disclaimer de aleatoriedade fixo** (compliance) | P0 |
| CL-87 | Backtesting de estratégia (Pro, assíncrono) | P2 |

## C.7 Carteira (`/app/carteira`)

| ID | Requisito | Prio |
|---|---|---|
| CL-90 | Gasto total por período, modalidade e estratégia | P0 |
| CL-91 | Prêmios recebidos por período | P0 |
| CL-92 | ROI calculado e exibido honestamente (inclusive negativo) | P0 |
| CL-93 | Gráfico de evolução mensal | P1 |
| CL-94 | Exportação CSV (Pro) | P1 |
| CL-95 | **Limite de gasto autodeclarado** com alerta (jogo responsável) | P1 |

## C.8 Conta e Assinatura (`/app/conta`)

| ID | Requisito | Prio |
|---|---|---|
| CL-100 | Editar perfil (nome, telefone, avatar, fuso) | P0 |
| CL-101 | Alterar senha; gerenciar 2FA | P0 |
| CL-102 | Gerenciar chave Pix (organizador de bolão) | P1 |
| CL-103 | Preferências de notificação por canal e tipo, com horário de silêncio | P0 |
| CL-104 | Ver plano atual, uso vs. limites (jogos, scans, mensagens IA) | P0 |
| CL-105 | Assinar / trocar / cancelar plano | P0 |
| CL-106 | Histórico de faturas com download | P0 |
| CL-107 | Trocar meio de pagamento | P0 |
| CL-108 | **Exportar meus dados** (LGPD) | P0 |
| CL-109 | **Excluir conta** (LGPD) — anonimiza, preserva integridade de bolões de terceiros | P0 |
| CL-110 | Instalar como app (prompt de PWA) | P1 |
| CL-111 | Gerenciar token de API (Pro) | P2 |

---

# Parte D — Backoffice

Acesso restrito por RBAC. Toda ação registrada em `audit_logs`.

## D.1 Papéis

| Papel | Permissões |
|---|---|
| `VIEWER` | Somente leitura de métricas e listagens |
| `SUPPORT` | + ver detalhe de usuário, reenviar e-mail, ajustar plano manualmente, reprocessar conferência |
| `FINANCE` | + faturas, reembolsos, relatórios financeiros |
| `ADMIN` | Tudo, incluindo gestão de modalidades, planos, feature flags e usuários admin |

## D.2 Dashboard (`/admin`)

| ID | Requisito | Prio |
|---|---|---|
| BO-01 | KPIs: usuários totais/ativos, MRR, ARR, churn, conversão Free→Pago, ticket médio | P0 |
| BO-02 | Gráficos: crescimento de usuários, MRR, distribuição por plano | P0 |
| BO-03 | Funil: cadastro → 1º jogo → 1ª conferência → paywall → assinatura | P0 |
| BO-04 | **Saúde do sistema**: última sincronização por modalidade, tamanho das filas, taxa de erro | **P0 — operacional crítico** |
| BO-05 | Alertas ativos (sync falhando, fila travada, cobranças falhando) | P0 |

## D.3 Usuários (`/admin/usuarios`)

| ID | Requisito | Prio |
|---|---|---|
| BO-10 | Listagem com busca (nome, e-mail, ID) e filtros (plano, status, data, tenant) | P0 |
| BO-11 | Detalhe: perfil, plano, uso, jogos, bolões, faturas, timeline de eventos | P0 |
| BO-12 | Ações: alterar plano manualmente (com justificativa), conceder trial, bloquear/desbloquear, forçar verificação de e-mail | P0 |
| BO-13 | **Impersonar usuário** (somente ADMIN, com registro em auditoria e banner visível na sessão) | P1 |
| BO-14 | Exportar dados do usuário (atendimento a requisição LGPD) | P0 |
| BO-15 | Anonimizar/excluir conta (requisição LGPD) | P0 |

## D.4 Apostas e Bolões (`/admin/apostas`, `/admin/boloes`)

| ID | Requisito | Prio |
|---|---|---|
| BO-20 | Listagem global de apostas com filtros | P0 |
| BO-21 | **Reprocessar conferência** de aposta, concurso ou modalidade inteira | **P0 — ferramenta de correção** |
| BO-22 | Listagem de bolões com status e nº de participantes | P1 |
| BO-23 | Detalhe do bolão (visão de suporte) | P1 |
| BO-24 | Cancelar bolão em caso de denúncia/abuso | P1 |
| BO-25 | Fila de denúncias de bolão | P2 |

## D.5 Assinaturas e Financeiro (`/admin/financeiro`)

| ID | Requisito | Prio |
|---|---|---|
| BO-30 | Listagem de assinaturas com status | P0 |
| BO-31 | Faturas: pagas, pendentes, falhadas | P0 |
| BO-32 | Retry manual de cobrança | P0 |
| BO-33 | Conceder crédito / desconto / cortesia | P1 |
| BO-34 | Relatório de MRR: novo, expansão, contração, churn | P1 |
| BO-35 | Conciliação com Asaas (divergências) | P1 |
| BO-36 | Log de webhooks recebidos, com replay manual | P0 |

## D.6 Conteúdo e Configuração (`/admin/config`)

| ID | Requisito | Prio |
|---|---|---|
| BO-40 | CRUD de modalidades (config, faixas de preço, faixas de premiação) | P0 |
| BO-41 | Disparar backfill/re-sync de concursos | P0 |
| BO-42 | Correção manual de resultado de concurso (com auditoria) | P0 |
| BO-43 | CRUD de planos e entitlements | P1 |
| BO-44 | Gestão de matrizes de fechamento (upload, verificação, publicação) | P1 |
| BO-45 | Feature flags | P1 |
| BO-46 | Editor de templates de e-mail/push | P1 |
| BO-47 | Banner/aviso global no painel do cliente | P1 |
| BO-48 | CMS do blog | P2 |

## D.7 Suporte (`/admin/suporte`)

| ID | Requisito | Prio |
|---|---|---|
| BO-50 | Caixa de mensagens de contato | P0 |
| BO-51 | Histórico de notificações enviadas a um usuário (para depurar "não recebi") | P1 |
| BO-52 | Base de conhecimento interna | P2 |

---

# Parte E — Sistema e Workers

| ID | Requisito | Prio |
|---|---|---|
| SY-01 | Cron `sync-results` com janelas dinâmicas por modalidade | P0 |
| SY-02 | Job `backfill-history` (manual, throttled) | P0 |
| SY-03 | Job `check-bets` disparado por `contest.settled`, em lotes, idempotente | P0 |
| SY-04 | Job `notify` respeitando canal, plano, preferências e horário de silêncio | P0 |
| SY-05 | Job `refresh-stats` (materialized views) pós-concurso | P1 |
| SY-06 | Job `ocr-receipt` (Anthropic vision) | P1 |
| SY-07 | Job `closure-calc` para fechamentos customizados | P2 |
| SY-08 | Job `backtest` | P2 |
| SY-09 | Cron `billing-dunning` — retry D+1, D+3, D+5; downgrade em D+7 | P0 |
| SY-10 | Cron `accumulated-alert` — verifica limiar e dispara notificação | P0 |
| SY-11 | Cron `cutoff-reminder` — avisa antes do fechamento das apostas | P1 |
| SY-12 | Cron `cleanup` — expira convites, arquiva notificações antigas, purga soft-deletes vencidos | P1 |
| SY-13 | Endpoint `/api/webhooks/asaas` com validação de token estático (header `asaas-access-token`, comparação constant-time) e idempotência | P0 |
| SY-14 | Healthcheck `/api/health` (DB, Redis, fila, último sync) | P0 |
| SY-15 | Circuit breaker e fallback entre provedores de resultado | P0 |

---

## F — Requisitos não funcionais

| Área | Requisito |
|---|---|
| **Disponibilidade** | 99,5% mensal. Janela crítica: 21h–23h em dia de sorteio (indisponibilidade aí é o pior cenário) |
| **Acessibilidade** | WCAG 2.1 AA. Navegação por teclado completa no seletor de dezenas. Contraste mínimo 4,5:1. Não usar cor como único indicador de acerto |
| **Responsividade** | Mobile-first. Testado em 360px, 768px, 1280px, 1920px |
| **Idioma** | pt-BR. i18n estruturado desde o início (chaves, não strings), mas só pt-BR ativo |
| **Navegadores** | Últimas 2 versões de Chrome, Safari, Firefox, Edge; Safari iOS 15+ |
| **PWA** | Instalável, ícone, splash, push, offline básico (últimos resultados e jogos em cache) |
| **Compliance** | Disclaimers de [03](03-marco-legal-e-compliance.md) presentes e não dispensáveis nos pontos definidos |
| **Auditoria** | Toda ação de admin e toda mudança de plano/bolão registrada |

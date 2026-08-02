# 03 — Marco Legal e Compliance

> ⚠️ **AVISO IMPORTANTE**
> Este documento é uma **análise de risco técnica e de produto**, baseada em pesquisa pública. **Não é parecer
> jurídico.** Antes do lançamento comercial é **obrigatório** validar o modelo com advogado especializado em
> direito regulatório de jogos e loterias. As decisões de arquitetura aqui recomendadas foram desenhadas para
> serem conservadoras — mas a validação formal é indispensável e está no cronograma (Sprint 4).

---

## 3.1 O quadro normativo em uma página

| Norma | O que estabelece | Impacto em nós |
|---|---|---|
| **Decreto-Lei 204/1967** | Loteria federal é serviço público exclusivo da União, explorado pela CEF | Não podemos operar loteria |
| **Lei 13.756/2018** | Reorganiza a destinação de receitas; legaliza apostas de quota fixa (esportivas) | Não nos alcança diretamente |
| **Lei 14.790/2023** ("Lei das Bets") | Regula apostas de quota fixa e jogos online; exige autorização prévia da **SPA/Ministério da Fazenda**; desde 01/01/2025 só empresas autorizadas operam | **Não nos alcança** — não somos operador de aposta de quota fixa. Mas define o ambiente regulatório onde qualquer confusão de posicionamento é perigosa. |
| **ADPF 492/493 (STF, 2020)** | Estados podem explorar loterias em seu território | Abre mercado futuro para loterias estaduais — nossa arquitetura deve suportar |
| **CDC, art. 37** | Veda publicidade enganosa | **Crítico.** Não podemos prometer aumento de chance de ganhar. |
| **LGPD (Lei 13.709/2018)** | Proteção de dados pessoais | Aplicável integralmente |
| **ECA + normas Caixa** | Proibição de jogo para menores de 18 anos | Verificação de maioridade obrigatória |

### O ponto central: o monopólio

A Caixa Econômica Federal detém o **direito exclusivo** de explorar os serviços de Loteria Federal e Loteria
Esportiva Federal no Brasil, **incluindo a comercialização de cotas de bolão administradas e/ou organizadas
por ela**.

Consequência direta: **vender cotas de bolão com caráter empresarial é área de risco jurídico real e comprovado.**

### Jurisprudência relevante (o alerta que define nosso modelo)

A pesquisa localizou histórico consistente de litígio nessa fronteira:

- **MPF/SP ajuizou ações** para proibir casas lotéricas de venderem bolão (múltiplas ações, contra
  diferentes permissionárias).
- A **Justiça Federal proibiu a venda de bolão em casas lotéricas** em decisões específicas.
- O **TRF-3 determinou que a Caixa fiscalize permanentemente** as permissionárias, considerando que a CEF
  vinha agindo com negligência quanto a atos ilegais das casas lotéricas.
- A **CEF exige contratualmente** que a casa lotérica "não venda, intermedeie, distribua ou divulgue qualquer
  outra modalidade de sorteio ou loteria sem autorização expressa".
- Decisão do STJ/tribunais (noticiada pelo Migalhas): **a Caixa não é obrigada a indenizar apostadora por
  bolão feito em site não oficial** — a CEF não reconhece apostas feitas em plataformas não oficiais.

**A distinção jurídica que a doutrina e a jurisprudência fazem:**

> Não há óbice legal para que **apostadores organizem seus próprios bolões**.
> O problema está na **comercialização de cotas de bolão com critérios de empresarialidade**.

Essa frase é a espinha dorsal de todo o desenho do produto.

---

## 3.2 A linha vermelha: o que NÃO fazemos

Estas restrições são **arquiteturais**, não políticas de uso. O sistema deve ser **tecnicamente incapaz**
de fazer isso.

| ❌ Proibido | Por quê |
|---|---|
| Receber, custodiar ou repassar dinheiro de aposta | Caracterizaria intermediação/exploração de loteria |
| Vender cotas de bolão (nós vendendo) | Comercialização de cota com empresarialidade — exatamente o que a Justiça Federal proíbe |
| Cobrar comissão/taxa sobre valor de aposta ou de prêmio | Idem. Nossa receita é **exclusivamente assinatura de software**, independente do volume apostado |
| Colocar a aposta em nome do usuário nos canais oficiais | Intermediação sem credenciamento |
| Emitir "comprovante de aposta" ou algo que se confunda com bilhete oficial | Risco de indução a erro; o único comprovante válido é o da Caixa |
| Prometer, sugerir ou insinuar aumento de chance de ganhar | Publicidade enganosa (CDC art. 37) |
| Usar marca/logo da Caixa de modo a sugerir vínculo, parceria ou autorização | Uso indevido de marca; indução a erro |
| Permitir cadastro de menor de 18 anos | ECA / normas de jogo responsável |
| Criar bolão "público" aberto onde qualquer estranho compra cota | Aproxima-se perigosamente de comercialização de cota |

---

## 3.3 A linha verde: o que fazemos (e por que é seguro)

| ✅ Permitido | Fundamento |
|---|---|
| Vender **licença/assinatura de software** de organização e análise | Software é produto lícito; a receita não deriva de aposta |
| Registrar e organizar apostas que o usuário já fez ou pretende fazer | É registro pessoal, como uma planilha |
| Gerar combinações, fechamentos e desdobramentos | Matemática combinatória; ferramenta de cálculo |
| Conferir resultados contra dados públicos oficiais | Dado público |
| Exibir estatísticas históricas | Dado público |
| Permitir que **usuários organizem seus próprios bolões privados**, por convite | "Não há óbice legal para que apostadores organizem seus próprios bolões" |
| **Gerar** um Pix copia-e-cola de participante → organizador (P2P) | Não passa por nós; é transferência direta entre pessoas físicas |
| Calcular o rateio devido de um prêmio entre cotistas | É cálculo, não pagamento |
| Armazenar foto do comprovante oficial que o organizador anexou | Documento do próprio usuário |
| Imprimir volante em formato oficial para o usuário levar à lotérica | Facilita a aposta no canal oficial |

---

## 3.4 Decisões arquiteturais derivadas do risco jurídico

Estas são **requisitos técnicos vinculantes**, não sugestões.

### D1 — Zero custódia de valores (não negociável)

```
❌ ERRADO                              ✅ CORRETO
Participante → LotoPro → Organizador   Participante → (Pix direto) → Organizador
                                       LotoPro apenas GERA o payload Pix e
                                       REGISTRA a confirmação manual/automática
```

- Não abrimos conta de pagamento, não somos subadquirente, não temos saldo de usuário.
- O Pix copia-e-cola gerado usa a **chave Pix do organizador**, cadastrada por ele.
- A confirmação de pagamento é: (a) marcação manual pelo organizador, ou (b) opcionalmente, no futuro,
  conciliação via extrato que o **próprio organizador** conecta. Nunca por nós.
- Nossa API de pagamento (Asaas) processa **exclusivamente assinaturas do software**.

### D2 — Separação contábil e de UX entre "assinatura" e "aposta"

- Telas de assinatura e telas de bolão **nunca** compartilham componente de checkout.
- O valor da assinatura **não varia** com quantidade de jogos, valor apostado ou prêmios ganhos.
  (Isso mata qualquer argumento de que cobramos percentual sobre aposta.)
- Nunca exibir "seu saldo" agregando valores de aposta e valores de assinatura.

### D3 — Bolão é privado e por convite

- Bolão só é acessível por link de convite ou código, gerado pelo organizador.
- Não existe diretório público, marketplace ou busca de bolões.
- Limite de participantes por plano é **limite de software**, não venda de cota.
- O organizador é sempre uma pessoa física identificada, responsável pelo bolão.

### D4 — Disclaimers permanentes e não dispensáveis

Textos obrigatórios, presentes em pontos fixos da interface:

> **Rodapé de todas as páginas:**
> "O LotoPro é um software independente de organização e análise de apostas. Não temos vínculo, parceria ou
> autorização da Caixa Econômica Federal. Não realizamos apostas, não vendemos cotas e não intermediamos
> pagamentos de jogos. Todas as apostas devem ser feitas nos canais oficiais da CAIXA."

> **Em toda tela de estatística, gerador ou fechamento:**
> "Loterias são jogos de azar. Os sorteios são eventos independentes e aleatórios: resultados passados não
> influenciam resultados futuros. Nenhuma estratégia, filtro ou fechamento aumenta a probabilidade de acerto.
> Estas ferramentas servem para organizar e analisar seus jogos, não para prever resultados."

> **Em toda tela de bolão:**
> "O organizador deste bolão é o único responsável por realizar a aposta nos canais oficiais, guardar o
> comprovante e efetuar o rateio do prêmio. O LotoPro apenas registra e calcula — não recebe, não guarda e
> não repassa valores."

> **No cadastro:**
> "Declaro ter 18 anos ou mais."

### D5 — Uso de marcas de terceiros

- Uso **nominativo e descritivo**: "gestão de apostas da Mega-Sena" — ✅
- Uso que sugere vínculo: logo da Caixa no header, "parceiro oficial", cores/identidade Caixa — ❌
- Cores das dezenas por modalidade (verde Mega, roxo Lotofácil etc.) são convenção visual amplamente usada
  no mercado; **usar com moderação e sem replicar a identidade visual da Caixa.** Validar com o advogado.
- Nome comercial não pode conter "Caixa", "Loterias Caixa" nem imitar marcas registradas.
  Verificar disponibilidade no **INPI** antes de fechar o nome (ver [12](12-riscos-e-decisoes-pendentes.md)).

### D6 — Comunicação e marketing

**Proibido em qualquer canal (site, ads, e-mail, redes):**
- "Aumente suas chances", "método que funciona", "estratégia vencedora", "quem usa ganha mais"
- Depoimentos que atribuam prêmio ao uso do software
- Números de "prêmios pagos aos nossos usuários" apresentados como resultado do produto

**Permitido e recomendado:**
- "Nunca mais perca um prêmio por esquecer de conferir"
- "Organize seus jogos e bolões em um só lugar"
- "Saiba exatamente quanto você já gastou e recuperou"
- "Seu bolão sem planilha e sem confusão"

Todo material de marketing passa por checklist de compliance antes de publicar (ver 08).

---

## 3.5 LGPD

| Item | Definição |
|---|---|
| **Papel** | Controlador dos dados dos usuários |
| **Base legal — conta e serviço** | Execução de contrato (art. 7º, V) |
| **Base legal — marketing** | Consentimento (art. 7º, I), com opt-in separado e revogável |
| **Dados coletados** | Nome, e-mail, telefone (opcional), CPF (**apenas se necessário** — avaliar), jogos, bolões, chave Pix do organizador, imagens de comprovante |
| **Dados sensíveis** | Nenhum. **Não coletar** dados de saúde, biometria, etc. |
| **Chave Pix** | É dado pessoal. Criptografar em repouso (AES-256, chave em KMS). Nunca logar. |
| **Imagens de comprovante** | Podem conter dados do apostador. Storage privado com URL assinada e TTL curto. |
| **CPF** | **Recomendação: NÃO coletar no MVP.** Só se o gateway exigir para a assinatura — e nesse caso, coletar apenas no checkout e não persistir em claro. |
| **Retenção** | Conta ativa + 5 anos após encerramento (prazo prescricional civil), depois anonimização |
| **Direitos do titular** | Portal de privacidade no painel: exportar dados (JSON/CSV), corrigir, excluir conta |
| **Exclusão de conta** | Self-service. Anonimiza (não deleta) registros vinculados a bolões de terceiros, para não corromper o histórico de outros usuários |
| **Encarregado (DPO)** | Nomear e publicar contato. Pode ser o próprio Guilherme no início. |
| **Subprocessadores** | Listar publicamente: Vercel, Neon/Supabase, Asaas, Resend, Cloudflare R2, Sentry, PostHog, Anthropic (se IA) |
| **Transferência internacional** | Ocorre (Vercel, Anthropic). Documentar na política com cláusulas-padrão. |
| **Menores** | Bloqueio por declaração de maioridade + termos. Se detectado menor, exclusão imediata. |

**Documentos obrigatórios antes do lançamento:**
1. Política de Privacidade
2. Termos de Uso (com as declarações de não-vínculo e não-intermediação em destaque)
3. Política de Cookies + banner de consentimento
4. Registro de operações de tratamento (ROPA) interno

---

## 3.6 Jogo responsável

Não é só ética — é redução de risco reputacional e regulatório, e é um **diferencial de posicionamento**
num mercado onde os concorrentes flertam com promessa de ganho.

**Recursos a implementar (MVP: R1–R3; Fase 2: R4–R6):**

| # | Recurso | Fase |
|---|---|---|
| R1 | Declaração de maioridade obrigatória no cadastro | MVP |
| R2 | Disclaimer de aleatoriedade em toda tela de análise (D4) | MVP |
| R3 | Painel de gastos: quanto o usuário gastou no mês/ano, com destaque visual | MVP |
| R4 | **Limite de gasto autodeclarado** com alerta ao ultrapassar | Fase 2 |
| R5 | Alerta de comportamento de risco (aumento súbito e sustentado de gasto) | Fase 2 |
| R6 | Página "Jogue com responsabilidade" com canais de ajuda (CVV 188, Jogadores Anônimos) | MVP |
| R7 | Autoexclusão temporária (pausa a conta por 30/90/180 dias) | Fase 2 |

---

## 3.7 Caminhos futuros que exigiriam nova análise jurídica

| Caminho | Risco | Recomendação |
|---|---|---|
| **Afiliação com revendedor autorizado** (ex.: Sorte Online) — link "aposte agora", comissão por indicação | Médio. Precisa garantir que a comissão é de marketing, não de aposta | Avaliar na Fase 3, com parecer específico |
| **Virar revendedor credenciado** | Alto. Exige credenciamento e muda a natureza do negócio | Não recomendado |
| **Loterias estaduais** (pós ADPF 492/493) | Médio. Cada estado tem regra própria | Arquitetura já preparada; entrar só com parecer |
| **Custódia/escrow de bolão** | **Alto. Não fazer.** | ❌ |
| **Bolão público/marketplace** | **Alto. Não fazer.** | ❌ |

---

## 3.8 Checklist pré-lançamento (bloqueante)

- [ ] Parecer jurídico formal sobre o modelo de negócio (Sprint 4)
- [ ] Parecer específico sobre o módulo de Bolão Manager e o fluxo de Pix P2P
- [ ] Busca de anterioridade de marca no INPI + depósito
- [ ] Termos de Uso e Política de Privacidade revisados por advogado
- [ ] Revisão de todos os textos de marketing pelo checklist de compliance
- [ ] Confirmação de que nenhum endpoint da aplicação movimenta valor de aposta
- [ ] Teste: é tecnicamente impossível criar bolão público? é impossível o LotoPro receber valor de cota?
- [ ] DPO nomeado e contato publicado
- [ ] Página de jogo responsável publicada

---

## Fontes

- [LEI Nº 14.790, DE 30 DE DEZEMBRO DE 2023 — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14790.htm)
- [Apostas de Quota Fixa — Ministério da Fazenda / SPA](https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/apostas-de-quota-fixa)
- [A Lei 14.790/23 permite a operação de apostas de quota fixa e jogos online — BNLData](https://bnldata.com.br/a-lei-14-790-23-permite-a-operacao-de-apostas-de-quota-fixa-e-jogos-online/)
- [Lei que dispõe sobre as apostas de quota fixa é sancionada — Cescon Barrieu](https://cesconbarrieu.com.br/lei-que-dispoe-sobre-as-apostas-de-quota-fixa-no-brasil-e-sancionada/)
- [Guia regulatório de jogos e apostas 2025 — BBL Advogados / ConJur (PDF)](https://www.conjur.com.br/wp-content/uploads/2025/03/Guia-Jogos-e-Apostas-BBL-Advogados-1.pdf)
- [Justiça Federal determina que Caixa fiscalize bolões de loterias — ConJur](https://www.conjur.com.br/2018-mar-02/justica-federal-determina-caixa-fiscalize-boloes-loterias/)
- [Bolão: Justiça Federal proíbe venda em casas lotéricas — Jusbrasil](https://www.jusbrasil.com.br/noticias/bolao-justica-federal-proibe-venda-em-casas-lotericas/2270308)
- [MPF/SP ajuíza nova ação contra venda de bolão por lotéricas — Jusbrasil](https://www.jusbrasil.com.br/noticias/mpf-sp-ajuiza-nova-acao-para-que-mais-sete-casas-lotericas-sejam-proibidas-de-vender-bolao/3125436)
- [Caixa não terá de indenizar apostadora por bolão em site não oficial — Migalhas](https://www.migalhas.com.br/quentes/424038/caixa-nao-tera-de-indenizar-apostadora-por-bolao-em-site-nao-oficial)
- [Por dentro das regras: regulamento oficial das Loterias Caixa](https://www.lotericaoperiquitodeouro.com.br/post/por-dentro-das-regras-o-que-diz-o-regulamento-oficial-das-loterias-caixa)
- [Jogar na loteria online é seguro? — Serasa](https://www.serasa.com.br/premium/blog/loteria-online-e-seguro/)

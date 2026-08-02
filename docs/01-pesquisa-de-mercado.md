# 01 — Pesquisa de Mercado: Loterias Federais Brasileiras

## 1.1 Tamanho e dinâmica do mercado

| Indicador | Valor | Fonte / período |
|---|---|---|
| Arrecadação Loterias Caixa 2025 | **~R$ 25,1 bilhões** | Caixa, ano fechado 2025 |
| Arrecadação 1º semestre 2025 | R$ 11,6 bi (−6,0% vs 2024) | Caixa |
| Arrecadação 1T2026 | **R$ 5,97 bi (+8,4% vs 1T25)** | Caixa — retomada de crescimento |
| Repasses sociais 2025 | ~R$ 12,2 bi | Caixa |
| Repasses sociais 1T26 | R$ 3,2 bi | Caixa |
| Concentração | **Mega-Sena + Lotofácil = 74,8%** da arrecadação (1T26) | Caixa |
| Mega da Virada 2025 | > R$ 3 bilhões em um único concurso | Caixa |
| Apostas + quota fixa (total) | R$ 26,6 bi gerados para políticas públicas em 2025 | BNLData |

**Leituras estratégicas:**

- O mercado é grande, estável e voltou a crescer. Não é um mercado em declínio.
- **74,8% da arrecadação está em duas modalidades.** O produto deve ser excelente em Mega-Sena e Lotofácil
  antes de ser completo nas outras nove. Lotofácil, em particular, é a modalidade com maior cultura de
  "sistema/fechamento" — é onde os softwares concorrentes concentram esforço e onde há maior disposição a pagar.
- Concursos especiais (Mega da Virada, Mega 30 Anos em 2026 com prêmio estimado de R$ 150 milhões que não acumula)
  são picos de aquisição de usuários. O calendário de marketing deve girar em torno deles.
- Bolão é comportamento massificado justamente nos concursos especiais — reforça a tese do Bolão Manager.

---

## 1.2 Modalidades: especificação técnica

Esta tabela é a base do **motor de modalidades configurável** (ver [07-modelo-de-dados.md](07-modelo-de-dados.md)).

> ⚠️ Preços e regras mudam por ato da Caixa (último reajuste relevante: julho/2025). Os valores abaixo refletem
> a tabela vigente em 2026. **Na implementação, tratar preço e faixas como dado versionado em banco**, com data
> de vigência, nunca como constante em código.

| Modalidade | Universo | Dezenas escolhidas (mín–máx) | Campo extra | Aposta simples 2026 | Sorteios |
|---|---|---|---|---|---|
| **Mega-Sena** | 1–60 | 6 a 20 | — | **R$ 6,00** | Ter, Qui, Sáb/Dom* |
| **Lotofácil** | 1–25 | 15 a 20 | — | **R$ 3,50** | Seg a Sáb |
| **Quina** | 1–80 | 5 a 15 | — | **R$ 3,00** | Seg a Sáb |
| **Lotomania** | 1–100 (00–99) | 50 (ou 0 = surpresinha) | — | **R$ 3,00** | 3x/semana |
| **Dupla Sena** | 1–50 | 6 a 15 | 2 sorteios por concurso | **R$ 3,00** | 3x/semana |
| **Timemania** | 1–80 | 10 (fixo) | Time do Coração | **R$ 3,50** | 3x/semana |
| **Dia de Sorte** | 1–31 | 7 a 15 | Mês da Sorte (1–12) | **R$ 2,50** | 3x/semana |
| **Super Sete** | 7 colunas, 0–9 cada | 1 a 3 números por coluna | — | **R$ 3,00** | Seg, Qua, Sex |
| **+Milionária** | 1–50 | 6 a 12 | 2 a 6 trevos (1–6) | **R$ 6,00** | Sábado |
| **Loteca** | 14 jogos de futebol | 1 a 3 palpites por jogo | — | **R$ 4,00** | Semanal |
| **Federal** | Bilhete numerado | — (não é volante) | — | Variável | 2x/semana |

\* Em julho/2026 a Caixa migrou sete modalidades que sorteavam aos sábados para **domingos às 11h**, no Espaço da
Sorte (SP). Apostas simples até 22h de sábado; **Bolões Caixa em canais digitais até 10h45 de domingo**.

### Implicações de produto

1. **O horário de corte é crítico.** O sistema precisa de um relógio confiável por modalidade e alertar o
   usuário antes do fechamento das apostas. É um recurso de valor real (evita perder o concurso).
2. **Campos extras não são uniformes.** Trevo (+Milionária), Mês (Dia de Sorte), Time (Timemania) e o formato
   de colunas do Super Sete quebram qualquer modelagem que assuma "array de dezenas". O schema precisa de um
   campo `extra` polimórfico (JSONB) desde o dia 1.
3. **Loteca e Federal são estruturalmente diferentes** (prognóstico esportivo e bilhete numerado). Recomendação:
   deixá-las para a fase 2 e não travar o MVP nelas.
4. **Dupla Sena tem dois sorteios por concurso** — a conferência precisa suportar múltiplos resultados por concurso.

---

## 1.3 Fonte de dados: API oficial da Caixa

**Endpoint (validado em 02/08/2026):**

```
https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/
https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/{numeroConcurso}
```

`{modalidade}`: `megasena`, `lotofacil`, `quina`, `lotomania`, `duplasena`, `timemania`, `diadesorte`,
`supersete`, `maismilionaria`, `loteca`, `federal`.

**Payload retornado (exemplo Mega-Sena, concurso 3038):**

| Campo | Tipo | Exemplo |
|---|---|---|
| `numero` | int | 3038 |
| `numeroConcursoAnterior` / `numeroConcursoProximo` | int | 3037 / 3039 |
| `dataApuracao` | string `DD/MM/AAAA` | "30/07/2026" |
| `dataProximoConcurso` | string | "01/08/2026" |
| `listaDezenas` | string[] | ["30","35","38","39","46","50"] |
| `dezenasSorteadasOrdemSorteio` | string[] | ordem de extração |
| `listaRateioPremio[]` | objeto[] | `{descricaoFaixa, faixa, numeroDeGanhadores, valorPremio}` |
| `valorArrecadado` | float | 66.603.906,00 |
| `valorAcumuladoProximoConcurso` | float | — |
| `valorAcumuladoConcursoEspecial` | float | — |
| `valorEstimadoProximoConcurso` | float | — |
| `acumulado` | boolean | — |
| `ultimoConcurso` | boolean | — |
| `tipoJogo` | string | "MEGA_SENA" |
| `nomeMunicipioUFSorteio` / `localSorteio` | string | "SÃO PAULO, SP" |
| `indicadorConcursoEspecial` | int | — |

### ⚠️ Riscos técnicos conhecidos da API

| Risco | Detalhe | Mitigação |
|---|---|---|
| **TLS não-padrão** | O servidor da Caixa rejeita handshakes de vários clientes HTTP modernos (`curl` retorna erro 35 em ambiente Windows/Git Bash). | Configurar o agente HTTPS explicitamente (ciphers legados, `TLSv1.2`, `rejectUnauthorized` conforme cadeia). Testar em ambiente de produção Linux antes de fechar a arquitetura. |
| **Sem SLA / sem contrato** | É uma API interna do portal, não uma API pública documentada. Pode mudar sem aviso. | (a) Abstrair atrás de uma interface `LotteryResultProvider`; (b) manter **2 provedores de fallback** (ex.: `apiloterias.com.br`, mirrors open-source); (c) alertar o time quando o schema divergir do esperado. |
| **Rate limiting não documentado** | — | Backoff exponencial + no máximo 1 requisição por modalidade por minuto na janela pós-sorteio; fora dela, 1 por hora. |
| **Formato de data BR** | `DD/MM/AAAA`, não ISO. | Parser dedicado com timezone `America/Sao_Paulo` fixado. |
| **Valores como float** | Risco de erro de ponto flutuante em dinheiro. | Persistir como `DECIMAL(15,2)` / centavos inteiros. Nunca `float` no banco. |

### Estratégia de ingestão

1. **Backfill histórico único:** varrer do concurso 1 até o atual em cada modalidade (job batch, uma vez).
   Estimativa: ~3.000 concursos Mega-Sena, ~3.700 Lotofácil, ~7.000 Quina → ~25 mil registros no total.
   Esse histórico é o insumo de estatísticas e backtesting — é um **ativo do produto**.
2. **Sincronização incremental:** cron a cada 5 min na janela de 21h–23h (dias de sorteio) e 11h–13h (domingos),
   verificando `ultimoConcurso`. Fora da janela, 1x/hora.
3. **Cache imutável:** concurso já apurado nunca muda → cache eterno. Só o "próximo concurso" é volátil.
4. **Webhook interno:** ao detectar concurso novo, disparar fila de conferência de todas as apostas ativas
   daquela modalidade + notificações.

---

## 1.4 Alternativas de fonte de dados (fallback)

| Fonte | Tipo | Nota |
|---|---|---|
| `servicebus2.caixa.gov.br/portaldeloterias/api` | Oficial (não documentada) | **Primária.** Dado canônico. |
| `apiloterias.com.br` / `apiloterias.com` | Terceiro, comercial | Fallback 1. Verificar termos e custo. |
| `loteriascaixa-api` (open-source, GitHub `guto-alves/loterias-api`) | Terceiro, open-source | Fallback 2. Instância Heroku pública estava fora do ar no teste — considerar **self-hosting** do projeto. |
| Scraping do portal HTML | Último recurso | Frágil. Só como circuit-breaker manual. |

**Decisão recomendada:** implementar a interface com a Caixa como primária e **self-hostar** um dos projetos
open-source como fallback controlado por nós — evita depender do uptime de terceiros.

---

## 1.5 Comportamento do apostador (hipóteses a validar)

Estas são hipóteses de trabalho derivadas da estrutura do mercado e dos produtos concorrentes. **Devem ser
validadas com entrevistas antes da Sprint 5** (ver [12-riscos-e-decisoes-pendentes.md](12-riscos-e-decisoes-pendentes.md)).

| # | Hipótese | Como validar |
|---|---|---|
| H1 | O apostador recorrente joga os **mesmos números** em vários concursos e perde o controle de quais estão ativos. | Entrevista + enquete na landing |
| H2 | Conferir manualmente é a dor #1 — especialmente quem tem 10+ jogos. | Entrevista |
| H3 | Bolões entre amigos são geridos em **planilha + WhatsApp + Pix manual**, com atrito e desconfiança. | Entrevista com organizadores de bolão |
| H4 | Quem usa software de fechamento (Lotofácil) é minoria, mas tem **alta disposição a pagar** (R$ 90–300/ano). | Preços praticados pelos concorrentes confirmam |
| H5 | O usuário quer saber **quanto gastou vs. quanto recuperou** — e hoje não sabe. | Entrevista |
| H6 | Notificação de "você acertou X" é o momento de maior valor percebido. | Teste A/B pós-lançamento |

---

## 1.6 Sazonalidade e calendário de marketing

| Período | Evento | Ação |
|---|---|---|
| Novembro–Dezembro | **Mega da Virada** — pico absoluto do ano, > R$ 3 bi | Campanha principal. Onboarding de bolões. Free trial estendido. |
| 2026 (data a confirmar) | **Mega 30 Anos** — concurso especial, R$ 150 mi, não acumula | Campanha secundária forte |
| Junho/Julho | Mega da Páscoa / concursos especiais | Campanha média |
| Acumulados > R$ 100 mi | Evento não programado | Automação: push/e-mail disparado por regra sobre `valorEstimadoProximoConcurso` |

**Insight:** o gatilho "acumulou acima de R$ X" é um **canal de reativação automático e gratuito**. Deve ser
construído já no MVP — é um dos features com melhor relação valor/esforço do projeto.

---

## Fontes

- [Portal Loterias CAIXA](https://loterias.caixa.gov.br/Paginas/default.aspx)
- [Comunicados Importantes — Loterias CAIXA](https://www.caixa.gov.br/loterias/comunicados-importantes/Paginas/default.aspx)
- [Loterias Caixa arrecadaram R$ 5,97 bi no 1T26 — BNLData](https://bnldata.com.br/caixa-loterias-arrecadam-r-597-bi-no-1o-trimestre-de-2026/)
- [Loterias CAIXA arrecadam R$ 11,6 bi no 1º semestre de 2025 — BNLData](https://bnldata.com.br/loterias-caixa-arrecadam-r-116-bilhoes-no-primeiro-semestre-de-2025-com-queda-de-6-em-relacao-ao-ano-anterior/)
- [Apostas de quota fixa e loterias geram R$ 26,6 bi em 2025 — BNLData](https://bnldata.com.br/apostas-de-quota-fixa-e-loterias-geram-r-266-bi-para-politicas-publicas-no-brasil-durante-2025/)
- [Tabela de preços das loterias 2026 — Lotorama](https://lotorama.com.br/blog/loterias-caixa-2026-veja-quanto-custa-aposta-ultimo-reajuste/)
- [Preço de apostas fica mais caro — IstoÉ Dinheiro](https://istoedinheiro.com.br/preco-de-apostas-nas-loterias-caixa-fica-mais-caro-a-partir-desta-quarta-veja-valores)
- [Mudança de sorteios de sábado para domingo — ND Mais](https://ndmais.com.br/loterias/mudanca-historica-nas-loterias-da-caixa-ja-esta-valendo-mega-sena-e-outros-6-sorteios-tem-novas-regras-de-premiacao/)
- [API de resultados — GitHub guto-alves/loterias-api](https://github.com/guto-alves/loterias-api)
- [API Loterias Caixa](https://apiloterias.com.br/)

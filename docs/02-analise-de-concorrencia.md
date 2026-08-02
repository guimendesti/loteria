# 02 — Análise de Concorrência

## 2.1 Mapa do setor

O mercado se divide em **quatro categorias**, das quais só uma é nosso concorrente direto.

```
┌─────────────────────────────────────────────────────────────────┐
│ A. OPERADORES / REVENDEDORES DE APOSTA                          │
│    Sorte Online, Lottoland, Mapa da Sorte, Caixa Loterias (app) │
│    → Recebem dinheiro, colocam a aposta. NÃO SOMOS ISSO.        │
├─────────────────────────────────────────────────────────────────┤
│ B. SOFTWARES DE GERAÇÃO/ESTATÍSTICA  ★ CONCORRENTE DIRETO ★     │
│    Spolti (Lotofácil Profissional, SPLoto), LotoCarva,          │
│    Dez na Sorte, Lottoloca, Ganhe Mais Fácil, planilhas Excel   │
├─────────────────────────────────────────────────────────────────┤
│ C. APPS DE BOLÃO  ← 100% futebol. LACUNA ABERTA.                │
│    Bolão Entre Amigos, Bolão App (C9), WebBolão, Penka          │
├─────────────────────────────────────────────────────────────────┤
│ D. PLANILHAS + WHATSAPP  ← o verdadeiro concorrente de bolão    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2.2 Categoria A — Operadores (não competimos, mas convivemos)

| Player | Modelo | Observações |
|---|---|---|
| **Caixa Loterias** (app/site oficial) | Canal oficial | Gratuito, obrigatório. Suporta Bolão Caixa em canais digitais **desde 2024**. É o canal onde nosso usuário efetivamente aposta. Interface funcional mas sem gestão, sem histórico útil, sem estatística, sem bolão privado entre amigos. |
| **Sorte Online** | Revendedor autorizado + bolões próprios | ~1,8M visitas/mês (ago/2024). Tem função "Subscrição/Assinatura" (débito automático de jogos recorrentes) e vende cotas de bolões próprios. Cobra taxa de serviço sobre a aposta. |
| **Lottoland** | Apostas em loterias internacionais (modelo de seguro/quota) | Presente no Brasil, foco em Powerball/EuroMillions/Mega Millions. Modelo juridicamente distinto e mais exposto. |
| **Mapa da Sorte** | Bolões online | Vende cotas de bolão. |

**Posicionamento:** não competimos com eles — **complementamos**. O usuário aposta lá e gerencia aqui.
Isso abre inclusive a possibilidade de **parceria/afiliação** com a Sorte Online no futuro (ver 05).

> ⚠️ Vale notar que operar como revendedor exigiria credenciamento/autorização e traz exposição jurídica
> significativa (ver [03-marco-legal-e-compliance.md](03-marco-legal-e-compliance.md)). **Não está no escopo.**

---

## 2.3 Categoria B — Concorrentes diretos (software)

### Perfil dos players

| Player | Produto | Modelo comercial | Plataforma |
|---|---|---|---|
| **Spolti** (spolti.com.br / sploto.net) | "Lotofácil Profissional", "SPLoto" | **Licença anual** (~R$ 89/ano, 3× R$ 29,67) | Desktop Windows (SPLoto se diz multiplataforma) |
| **LotoCarva** (lotocarva.com) | Gerador, simulador, fechamento, impressão | Freemium + assinatura (preço não exposto publicamente) | Web |
| **Dez na Sorte** (deznasorte.com) | Sistema completo + "Resgatador" + planilhas Excel | Múltiplos planos, **preço não exposto na home** | Desktop + planilhas |
| **Lottoloca** (lottoloca.com.br) | App das loterias | Licença **semestral ou anual** | App |
| **Ganhe Mais Fácil** | Gerador/simulador Lotofácil | Freemium | Web |
| **Planilhas Excel/VBA** | Conferidores caseiros | Venda avulsa (R$ 20–80) | Excel |

### Funcionalidades que eles têm (e que precisamos ter para ser competitivos)

Levantado de Spolti, Dez na Sorte e LotoCarva:

- ✅ Estatísticas completas com gráficos: frequência, atraso, ciclos, tendências
- ✅ Mapas visuais de sorteio com cores oficiais da Caixa
- ✅ Combinações totais e reduzidas (matemáticas)
- ✅ **Fechamentos / desdobramentos reduzidos por matriz de garantia**
- ✅ Filtros por parâmetros customizados (pares/ímpares, soma, primos, quadrantes, repetidas do concurso anterior)
- ✅ Geração automatizada em lote
- ✅ **Impressão em 3 formatos**: A4, A4 customizado, volante oficial
- ✅ Conferidor de apostas com filtro por faixa premiada
- ✅ Import/export Excel
- ✅ Simulador contra histórico completo
- ✅ Cobertura ampla de modalidades + estatística do jogo do bicho (Federal)
- ✅ Registro direto de aposta no site da Caixa (Dez na Sorte)

### Fraquezas exploráveis

| # | Fraqueza | Nossa resposta |
|---|---|---|
| F1 | **Desktop-first / Windows.** Muitos são executáveis. Uso no celular é ruim ou inexistente. | Web-first responsivo + PWA instalável. O apostador confere o resultado no celular, à noite, no sofá. |
| F2 | **UI datada.** Estética de software dos anos 2000. Alta fricção de onboarding. | Design system moderno, onboarding em < 3 min até o primeiro jogo cadastrado. |
| F3 | **Licença anual, não assinatura.** Ticket alto de entrada (R$ 89–300 de uma vez), sem freemium real. | Freemium + mensalidade baixa. Reduz drasticamente a barreira de entrada. |
| F4 | **Zero colaboração.** São ferramentas de um usuário só. Nenhum tem bolão multiusuário. | **Bolão Manager** — nosso diferencial central. |
| F5 | **Conferência é manual/pontual.** O usuário abre o programa e confere. | **Conferência automática + push** minutos após o sorteio. O valor chega até o usuário. |
| F6 | **Sem controle financeiro.** Não dizem quanto o usuário gastou nem recuperou. | Carteira/ROI por modalidade, estratégia e período. |
| F7 | **Preço opaco.** Dez na Sorte e LotoCarva não expõem preço na home — sinal de baixa maturidade comercial. | Pricing público, transparente, com comparativo de planos. |
| F8 | **Marketing agressivo/duvidoso.** Vários flertam com promessa de ganho. | Posicionamento honesto e defensável juridicamente — vira **diferencial de confiança**, não desvantagem. |
| F9 | **Sem API / sem integração.** | API pessoal no plano Pro; white-label B2B. |
| F10 | **Sem multi-tenant / B2B.** Nenhum atende lotéricas como cliente. | Plano Lotérica (white-label). Mercado inexplorado. |

---

## 2.4 Categoria C — Apps de bolão: a lacuna

**Achado central da pesquisa:** todos os aplicativos brasileiros de bolão encontrados são de **futebol**
(Copa do Mundo, campeonatos) — Bolão Entre Amigos, Bolão App (C9 Apps), WebBolão, Penka.

Eles resolvem: criar grupo, convidar por WhatsApp, regras customizadas, ranking em tempo real, pontuação automática.

**Nenhum deles faz bolão de loteria.** E bolão de loteria tem requisitos completamente diferentes:

| Requisito | Bolão de futebol | Bolão de loteria |
|---|---|---|
| Unidade de participação | Palpite individual | **Cota** (fração do custo do jogo) |
| Cálculo de resultado | Pontuação por acerto de placar | **Conferência de dezenas + rateio proporcional do prêmio** |
| Dinheiro | Geralmente simbólico | **Custo real da aposta + prêmio real a dividir** |
| Comprovação | Não necessária | **Crítico** — precisa do comprovante do volante oficial |
| Confiança | Baixo risco | **Alto risco** — é a dor real (o organizador sumiu com o bilhete) |

Ou seja: **o mercado de gestão de bolão de loteria não é atendido por software.** É atendido por
planilha + grupo de WhatsApp + Pix manual + foto do bilhete.

**Essa é a maior oportunidade identificada no projeto.**

---

## 2.5 Matriz comparativa

| Recurso | Caixa app | Sorte Online | Spolti/SPLoto | LotoCarva | Dez na Sorte | Apps bolão | **LotoPro** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Apostar oficialmente | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (por design) |
| Gestão de jogos por concurso | ❌ | ~ | ~ | ~ | ~ | ❌ | **✅** |
| Conferência automática + push | ❌ | ~ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Estatísticas avançadas | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | **✅** |
| Fechamentos / desdobramentos | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | **✅** |
| Backtesting histórico | ❌ | ❌ | ~ | ✅ | ~ | ❌ | **✅** |
| Impressão volante oficial | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | **✅** |
| **Bolão privado multiusuário** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (futebol) | **✅ (loteria)** |
| Rateio automático de prêmio por cota | ❌ | ~ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Split de Pix sem custódia | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| OCR de comprovante | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Controle financeiro / ROI | ❌ | ~ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Alerta de acumulado | ~ | ~ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Mobile / PWA de verdade | ✅ | ✅ | ~ | ~ | ❌ | ✅ | **✅** |
| Assinatura mensal acessível | — | — | ❌ | ~ | ~ | — | **✅** |
| Freemium | — | — | ❌ | ✅ | ~ | ✅ | **✅** |
| API / white-label B2B | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |

Legenda: ✅ tem · ~ parcial/limitado · ❌ não tem

---

## 2.6 Conclusões estratégicas

1. **Não competir por "gerar números".** É commodity. Todo mundo faz. Serve para paridade, não para vender.
2. **Competir por gestão, conferência e colaboração.** É onde ninguém está.
3. **O Bolão Manager é o wedge.** É o recurso que traz usuário novo de graça (viralidade: cada bolão de
   10 pessoas traz 9 cadastros) e que ninguém consegue copiar rápido, porque exige multiusuário,
   pagamento e confiança — coisas que um software desktop não tem arquitetura para fazer.
4. **Lotofácil primeiro.** É onde está a cultura de fechamento e a disposição a pagar comprovada.
5. **Preço abaixo do concorrente, recorrente.** R$ 24,90/mês ≈ R$ 299/ano parece mais caro que R$ 89/ano da
   Spolti — mas o mensal (R$ 24,90 vs R$ 89 à vista) tem barreira de entrada 3,5× menor, e nosso produto
   entrega bolão + conferência automática, que eles não entregam. **Ancorar no valor, não no preço.**
6. **B2B (lotéricas) é oceano azul.** Zero players. Ticket alto. Fica para a fase 3, mas a arquitetura
   multi-tenant deve ser prevista desde o modelo de dados.

---

## Fontes

- [Programas para Loterias — Spolti](https://www.spolti.com.br/)
- [Programa Lotofácil Profissional — Spolti](https://www.spolti.com.br/lotofacil)
- [SPLoto](https://www.sploto.net/lotofacil)
- [LotoCarva](https://lotocarva.com/)
- [Dez na Sorte](https://deznasorte.com/)
- [Lottoloca](https://www.lottoloca.com.br/)
- [Ganhe Mais Fácil](https://www.ganhemaisfacil.com.br/)
- [Melhores loterias online 2026 — Estado de Minas](https://www.em.com.br/apostas/loteria-online-4-melhores/)
- [Lottoland — como funciona](https://www.lottoland.com.br/revista/como-funciona-lottoland.html)
- [Mapa da Sorte](https://www.mapadasorte.com.br/?page=apostas-online)
- [Concorrentes de lottoland.com — Similarweb](https://www.similarweb.com/pt/website/lottoland.com/competitors/)
- [5 melhores apps para bolão da Copa — Canaltech](https://canaltech.com.br/apps/5-melhores-apps-para-fazer-bolao-da-copa-do-mundo/)
- [Bolão Entre Amigos](https://bolaoentreamigos.app.br/)
- [WebBolão](https://www.webbolao.com.br/)
- [Bolão App — C9 Apps](https://www.c9apps.com.br/bolaoapp/)

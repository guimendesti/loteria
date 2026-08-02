# 09 — Design System e UX

## 9.1 Princípios de design

| # | Princípio | Aplicação prática |
|---|---|---|
| DS1 | **Clareza acima de sofisticação** | Público majoritariamente 40+, não nativo digital. Textos grandes, contraste alto, alvos de toque generosos. |
| DS2 | **Mobile-first de verdade** | O momento de maior valor (conferir resultado) acontece no celular, à noite. Desktop é secundário. |
| DS3 | **Honestidade visual** | Nenhum elemento sugere sorte, previsão ou "método vencedor". Nada de cassino, moedas caindo, roleta. |
| DS4 | **O resultado é o herói** | A tela de "você acertou X" é a mais importante do produto. Deve ser satisfatória mesmo com 0 acertos. |
| DS5 | **Diferenciar-se pela leveza** | Concorrentes são densos e datados. Espaço em branco é vantagem competitiva aqui. |
| DS6 | **Acessível por padrão** | WCAG 2.1 AA. Nunca usar cor como único portador de informação. |

---

## 9.2 Identidade visual

**Personalidade:** confiável, organizado, moderno, brasileiro — **não** sortudo, não festivo, não cassino.

**Referências mentais:** Nubank (clareza + confiança), Notion (organização), Strava (dashboard pessoal de dados).
**Anti-referências:** sites de bet, cassino online, "método milionário".

### Paleta

Base neutra própria + cores das modalidades usadas **apenas como acento identificador**, nunca como
identidade da marca (ver [03](03-marco-legal-e-compliance.md) D5).

```
--brand-900  #0B2E23   Verde-escuro profundo (marca)
--brand-700  #12594A
--brand-500  #1B8A73   Primária
--brand-300  #6DC2AE
--brand-100  #DCF2EC

--ink-900    #0F1416   Texto principal
--ink-600    #4A5558   Texto secundário
--ink-400    #7B8689   Texto terciário
--ink-200    #D8DEDF   Bordas
--ink-050    #F6F8F8   Fundo

--success    #1E9E5A
--warning    #C77700
--danger     #C4342B
--info       #2563A8
```

### Cores de modalidade (tokens de acento)

| Modalidade | Token | Cor |
|---|---|---|
| Mega-Sena | `--lot-megasena` | `#209869` |
| Lotofácil | `--lot-lotofacil` | `#930989` |
| Quina | `--lot-quina` | `#260085` |
| Lotomania | `--lot-lotomania` | `#F78100` |
| Dupla Sena | `--lot-duplasena` | `#A61324` |
| Timemania | `--lot-timemania` | `#00FF48` → escurecido p/ contraste: `#00A832` |
| Dia de Sorte | `--lot-diadesorte` | `#CB8E869` → `#B58B3A` |
| Super Sete | `--lot-supersete` | `#A8CF45` → `#7A9B2E` |
| +Milionária | `--lot-maismilionaria` | `#2B2A78` |
| Loteca | `--lot-loteca` | `#E4001B` |
| Federal | `--lot-federal` | `#133D8D` |

> ⚠️ Várias dessas cores em fundo branco não atingem contraste 4,5:1 para texto. **Usar apenas como
> preenchimento de badge/pill com texto branco, ou como borda/indicador** — nunca como cor de texto.
> Os valores ajustados acima já consideram isso.

### Tipografia

```
Display / títulos:  Sora  (600, 700)
Corpo:              Inter (400, 500, 600)
Números/dezenas:    Inter Tight (600) — tabular-nums obrigatório
```

Escala: 12 · 14 · **16 (base)** · 18 · 20 · 24 · 30 · 36 · 48 px.
**Corpo nunca abaixo de 16px** no mobile (DS1).

### Espaçamento, raio e sombra

Espaçamento base 4px (escala 4/8/12/16/24/32/48/64).
Raio: `sm 6px · md 10px · lg 16px · full 9999px`.
Sombras discretas — nada de neumorfismo ou glow.

---

## 9.3 Componentes-chave

### C1 — `NumberBall` (a peça mais importante)

Bolinha de dezena. Usada no seletor, no resultado, na conferência, no bolão.

| Estado | Aparência |
|---|---|
| `default` | Fundo `ink-050`, borda `ink-200`, texto `ink-900` |
| `selected` | Fundo da cor da modalidade, texto branco |
| `drawn` | Fundo `success`, texto branco, **+ ícone de check** (não só cor — DS6) |
| `hit` | Fundo `success`, borda dupla, **+ ícone de check** |
| `missed` | Fundo `ink-050`, texto `ink-400`, opacidade 60% |
| `disabled` | Opacidade 40%, sem interação |

Tamanhos: `sm 32px` (listagem densa) · `md 40px` (padrão) · `lg 48px` (seletor mobile).
**Mínimo 44×44px de área de toque** no seletor, independentemente do tamanho visual.

### C2 — `NumberGrid` (seletor de dezenas)

Grid responsivo do universo da modalidade. Requisitos:

- Colunas adaptativas: 5 (mobile, 360px) → 10 (desktop)
- Barra fixa no rodapé (mobile) com: contador `12/15`, custo em tempo real, botão "Salvar"
- Ações rápidas: `Surpresinha` · `Limpar` · `Repetir último jogo` · `Marcar favoritas`
- Campo extra renderizado abaixo, conforme a modalidade (trevos, mês, time, colunas)
- **Navegação por teclado**: setas movem o foco no grid, Espaço/Enter alterna, Tab sai do grid
- Feedback de erro inline (`"Selecione ao menos 15 dezenas"`), não em modal

### C3 — `ContestResultCard`

Cartão de resultado: modalidade (badge colorido), nº do concurso, data, dezenas sorteadas,
premiação por faixa (tabela compacta), valor acumulado, botão "conferir meus jogos".

### C4 — `BetCard`

Cartão de aposta: dezenas (com destaque de acertos), modalidade, faixa de concursos, custo,
status (aguardando / conferido / premiado), origem (manual/OCR/gerado), ações.

### C5 — `PoolCard` e `PoolProgressBar`

Cartão de bolão: nome, organizador (com avatar), modalidade, concursos, barra de cotas
preenchidas (`14/20 cotas`), status, valor da cota, e — quando houver — o comprovante anexado.

### C6 — `PaywallDialog`

Modal de limite atingido. Estrutura fixa:
título do que foi bloqueado → o que o plano destrava (3 bullets) → preço → CTA "Testar 14 dias grátis"
→ link discreto "continuar no plano gratuito". **Nunca bloqueia o usuário sem saída.**

### C7 — `EmptyState`

Ilustração leve + frase + CTA. Cada área tem o seu (sem jogos, sem bolões, sem resultados).

### C8 — `StatChart`

Wrapper de Recharts com tema aplicado. Sempre com legenda textual acessível e tabela de dados
alternativa (`<details>`) para leitores de tela.

---

## 9.4 Fluxos-chave

### F1 — Onboarding (meta: < 3 min até o primeiro jogo)

```
Cadastro (e-mail + senha + maioridade)
   → "Qual loteria você mais joga?"            [1 toque]
   → "Cadastre seu primeiro jogo"              [seletor de dezenas]
      └─ atalho: "tenho o comprovante"          → OCR
   → "Vale para quantos concursos?"            [1 toque, default: próximo]
   → ✅ "Pronto! Vamos te avisar no dia 03/08 se você ganhou."
   → [opcional] Ativar notificações            [prompt de push]
```

Regra: **nenhuma etapa obrigatória além do cadastro e do primeiro jogo.** Perfil, telefone, preferências —
tudo depois.

### F2 — Conferência (o momento do "aha")

```
[Push] "🎉 Você acertou 13 números na Lotofácil 3697!"
   → abre direto na tela de resultado do jogo
   → animação sutil de revelação das dezenas acertadas (300ms, respeitando prefers-reduced-motion)
   → valor do prêmio, se houver
   → CTA contextual: "Repetir este jogo no próximo concurso"
```

Para **0 acertos**, a tela também precisa ser boa: mostrar o resultado, quantos acertou, e
*"Você tem mais 5 concursos com este jogo."* Nunca deixar o usuário com sensação de erro do produto.

### F3 — Criar e compartilhar bolão

```
Criar bolão
  → nome + modalidade + concursos
  → montar os jogos (seletor ou gerador ou fechamento)
  → definir nº de cotas → sistema calcula valor da cota
  → confirmar chave Pix + aceitar termo de responsabilidade   [compliance CL-42]
  → gerar link
  → [Compartilhar no WhatsApp]  ← texto pronto, 1 toque
```

Texto pré-preenchido do WhatsApp:
> *"Criei nosso bolão da Mega-Sena no LotoPro! 🎯 20 cotas de R$ 12,00. Entra aqui: {link}"*

### F4 — Entrar em bolão por convite (fluxo mais crítico para crescimento)

```
[WhatsApp] link → página do bolão SEM LOGIN
  → vê: nome, organizador, modalidade, cotas restantes, valor, jogos
  → [Quero participar]
  → cadastro curto: nome + e-mail  (ou Google, 1 toque)
  → escolhe nº de cotas
  → recebe Pix copia-e-cola + QR   [botão "copiar"]
  → [Já paguei]
  → ✅ "Pronto! Você tem 2 cotas. Avisamos quando o organizador apostar."
```

**Regra dura:** do clique no link até "já paguei" devem ser **no máximo 5 telas**. Cada tela extra
custa participantes — e participantes são nossos usuários futuros.

---

## 9.5 Estados de erro e vazio

| Situação | Tratamento |
|---|---|
| Resultado ainda não publicado | *"O sorteio do concurso 3040 é hoje às 21h. Avisamos assim que sair."* + contagem regressiva |
| Falha na sincronização com a Caixa | *"Estamos com dificuldade para buscar o resultado oficial. Já estamos verificando."* Nunca expor erro técnico. Banner global. |
| Aposta fora do prazo | *"As apostas para o concurso 3040 já encerraram. Quer cadastrar para o 3041?"* |
| OCR não reconheceu | *"Não consegui ler o comprovante. Pode digitar as dezenas?"* + fallback direto para o seletor, com a foto ao lado |
| Sem jogos | Ilustração + *"Cadastre seu primeiro jogo e nunca mais esqueça de conferir."* + CTA |
| Sem bolões | *"Organize seu bolão sem planilha e sem confusão."* + CTA + link para "como funciona" |
| Limite do plano | `PaywallDialog` (C6) |
| Offline (PWA) | Banner *"Você está offline. Mostrando os últimos dados salvos."* |

---

## 9.6 Notificações — texto

Regras: máximo 60 caracteres no título; sem promessa; sem urgência artificial; emoji com moderação (máx. 1).

| Tipo | Título | Corpo |
|---|---|---|
| Premiado | 🎉 Você foi premiado na Lotofácil! | Acertou 14 números no concurso 3697. Confira o valor. |
| Acertos sem prêmio | Resultado da Mega-Sena 3040 | Você acertou 2 números. Seu jogo vale mais 5 concursos. |
| Nenhum acerto | Resultado da Mega-Sena 3040 | Confira as dezenas sorteadas e seus jogos. |
| Acumulado | Mega-Sena acumulou R$ 120 milhões | Próximo sorteio: quinta-feira, 21h. |
| Fechamento | Faltam 2h para o encerramento | Você ainda não tem jogo no concurso 3041 da Lotofácil. |
| Bolão — pagamento | João entrou no bolão "Escritório" | 2 cotas · aguardando pagamento. |
| Bolão — apostado | Bolão "Escritório" apostado ✅ | O comprovante já está disponível para todos. |
| Bolão — premiado | 🎉 O bolão "Escritório" foi premiado! | Sua parte: R$ 340,00. Veja o rateio. |
| Cobrança falhou | Não conseguimos renovar sua assinatura | Atualize seu meio de pagamento para continuar no Premium. |

---

## 9.7 Acessibilidade — checklist de aceite

- [ ] Contraste ≥ 4,5:1 para texto normal, ≥ 3:1 para texto grande e componentes de UI
- [ ] Acerto/erro indicado por **ícone + cor + texto**, nunca só cor
- [ ] Todo fluxo completável apenas com teclado, incluindo o `NumberGrid`
- [ ] Foco visível e consistente em todos os elementos interativos
- [ ] `aria-label` em todos os ícones sem texto
- [ ] `aria-live="polite"` no contador de dezenas e nos resultados de conferência
- [ ] `prefers-reduced-motion` respeitado (desliga animações de revelação)
- [ ] Zoom até 200% sem perda de funcionalidade ou scroll horizontal
- [ ] Formulários com `label` associado e erro descrito em texto
- [ ] Testes com NVDA (Windows) e VoiceOver (iOS) antes do GA

---

## 9.8 Ilustrações e imagética

**Usar:** ícones de linha, ilustrações geométricas simples, capturas reais do produto, pessoas comuns
em contexto cotidiano.

**Não usar:** dinheiro voando, moedas, cifrões, trevos de quatro folhas, ferraduras, pés de coelho,
roleta, cartas, dados, foguetes, gráficos subindo. Tudo isso comunica "sorte/ganho garantido" e
contradiz o posicionamento de compliance (DS3 / [03](03-marco-legal-e-compliance.md) D6).

Exceção: o **trevo da +Milionária** é elemento oficial da modalidade — usado apenas como ícone
funcional do campo extra, nunca como decoração de marca.

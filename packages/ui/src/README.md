# @lotopro/ui

Design system do LotoPro. Fonte normativa: [docs/09-design-system-e-ux.md](../../../docs/09-design-system-e-ux.md).

Sem Tailwind e sem build de CSS por enquanto — os componentes usam `style` inline
lendo os tokens de [`src/tokens.ts`](./tokens.ts). Para tokens em CSS puro (variáveis
`:root`), use [`src/tokens.css`](./tokens.css).

## Tokens

```ts
import { colors, lotteryColors, radii, spacing, typography, touchTargetMin } from '@lotopro/ui'

colors.brand[500]        // '#1B8A73'
colors.ink[900]          // '#0F1416' — texto principal
colors.success           // '#1E9E5A'
lotteryColors.megasena   // '#209869' — usar só em fundo de badge/pill ou borda
radii.full                // '9999px'
spacing[4]                 // '16px'
typography.scale.base     // '16px'
touchTargetMin             // 44
```

```css
/* tokens.css — importar uma vez na raiz do app */
@import '@lotopro/ui/src/tokens.css';

.minha-marca { color: var(--brand-500); }
```

> `LotterySlug` é exportado por este pacote (`@lotopro/ui`) como um espelho manual do
> tipo de mesmo nome em `packages/core/src/types.ts`. `@lotopro/core` ainda não é uma
> dependência instalada de `@lotopro/ui` (fora do escopo desta tarefa — nenhum
> `pnpm install`/`add` foi executado). Ver comentário em `tokens.ts` para o plano de
> migração quando a dependência for formalizada.

## `NumberBall` (C1)

Bolinha de dezena. Usada no seletor, no resultado, na conferência e no bolão.

```tsx
import { NumberBall } from '@lotopro/ui'

<NumberBall number={12} state="default" size="md" lotterySlug="megasena" />
<NumberBall number={5}  state="selected" size="lg" lotterySlug="lotofacil" />
<NumberBall number={33} state="drawn" lotterySlug="quina" />
<NumberBall number={12} state="hit" lotterySlug="lotofacil" />
{/* "Você acertou 12 números" — cada bolinha acertada expõe
    aria-label="dezena 12, acertada" e um selo de check visível, nunca só a cor. */}
<NumberBall number={7}  state="missed" lotterySlug="megasena" />
<NumberBall number={41} state="disabled" lotterySlug="megasena" />
```

Props:

| Prop | Tipo | Default | Observação |
|---|---|---|---|
| `number` | `number` | — | dezena exibida |
| `state` | `'default' \| 'selected' \| 'drawn' \| 'hit' \| 'missed' \| 'disabled'` | `'default'` | `drawn`/`hit` sempre renderizam cor **+ ícone de check + aria-label** (DS6) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 32 / 40 / 48 px visuais — não amplia sozinho a área de toque, ver nota abaixo |
| `lotterySlug` | `LotterySlug` | — | define a cor de fundo apenas no estado `selected` |

Aceita também os demais atributos HTML de `<span>` (ex.: `className`, `id`, `aria-hidden`)
via spread — usado por `NumberGrid` para marcar a bolinha como `aria-hidden` quando o
rótulo acessível já está no `gridcell` pai (ver abaixo).

**Área de toque:** a bolinha em si respeita o tamanho visual exato de `size` (para não
forçar `sm` a crescer numa listagem densa). Quando usada como alvo interativo — como
dentro de `NumberGrid` — quem a envolve garante os 44×44px mínimos de toque.

## `NumberGrid` (C2)

Seletor de dezenas do universo de uma modalidade — a peça de acessibilidade mais crítica
do design system (§9.7: "todo fluxo completável apenas com teclado, incluindo o
NumberGrid").

```tsx
import { useState } from 'react'
import { NumberGrid } from '@lotopro/ui'

function Selector() {
  const [selected, setSelected] = useState<number[]>([])

  return (
    <NumberGrid
      universeMin={1}
      universeMax={60}
      picksMin={6}
      picksMax={15}
      selected={selected}
      onChange={setSelected}
      lotterySlug="megasena"
      columns={10} // opcional; default 10. Ver nota de responsividade abaixo.
    />
  )
}
```

Exibição somente-leitura (ex.: conferir um jogo já registrado):

```tsx
<NumberGrid
  universeMin={1}
  universeMax={25}
  picksMin={15}
  picksMax={15}
  selected={[2, 5, 9, 14, 15, 18, 20, 21, 22, 23, 24, 25, 1, 3, 7]}
  onChange={() => {}}
  lotterySlug="lotofacil"
  disabled
/>
```

Props:

| Prop | Tipo | Default | Observação |
|---|---|---|---|
| `universeMin` / `universeMax` | `number` | — | limites do universo da modalidade |
| `picksMin` / `picksMax` | `number` | — | seleção abaixo de `picksMin` mostra dica inline; acima de `picksMax` é **bloqueada** |
| `selected` | `number[]` | — | componente controlado |
| `onChange` | `(numbers: number[]) => void` | — | **nunca é chamado** para uma tentativa de seleção acima de `picksMax` |
| `lotterySlug` | `LotterySlug` | — | cor do estado `selected` das bolinhas |
| `disabled` | `boolean` | `false` | grid inteiramente somente-leitura, sem foco/interação |
| `columns` | `number` | `10` | ver nota de responsividade abaixo |

### Teclado e ARIA (requisitos não negociáveis do doc)

- `role="grid"` no container, `role="row"` por linha (via `display: contents`, preservando
  o layout de CSS Grid), `role="gridcell"` + `aria-selected` por dezena.
- **Roving tabindex**: apenas a célula "ativa" tem `tabIndex={0}`; as demais `-1`. Isso é o
  que faz `Tab` sair do grid inteiro num único passo, como pede o doc — não é tratado como
  caso especial, é consequência do padrão.
- `ArrowRight`/`ArrowLeft`: move uma célula na linha. `ArrowUp`/`ArrowDown`: move `columns`
  posições (pula de linha). `Home`/`End`: início/fim da **linha atual**; `Ctrl+Home`/
  `Ctrl+End`: primeira/última dezena do grid inteiro (extra, não exigido mas incluído).
- `Space`/`Enter`: alterna seleção da dezena com foco (`preventDefault` para não rolar a
  página no Space).
- Contador acessível: `aria-live="polite"` com o texto `"X de Y selecionadas"` — e, quando
  `selected.length < picksMin`, a dica `"Selecione ao menos N dezenas."` é anexada ao mesmo
  texto (feedback inline, nunca em modal, como pede o doc). O `grid` referencia essa região
  via `aria-describedby`.
- **Bloqueio no máximo**: ao atingir `picksMax`, as dezenas ainda não selecionadas passam a
  `state="disabled"` (visual + `aria-disabled`) automaticamente — reaproveitando o próprio
  estado de `NumberBall`, sem prop nova. Continuam navegáveis por teclado (para o usuário
  entender que existem), mas `Space`/`Enter`/clique não fazem nada nelas.
- Cada `gridcell` carrega seu próprio `aria-label` (`"dezena N, ..."`, via
  `describeNumberBall`, exportado por `NumberBall.tsx`); a `NumberBall` renderizada dentro
  dele é marcada `aria-hidden="true"` para não duplicar a leitura pelo leitor de tela.

### Responsividade de colunas

O doc pede colunas adaptativas (5 no mobile ~360px → 10 no desktop) via **container query
OU** prop `columns` com default 10. Como este pacote ainda não tem pipeline de CSS
(sem Tailwind, sem CSS Modules configurado, sem `container-type` — ver decisão em
`tokens.ts`/relatório), foi implementada a segunda alternativa, explicitamente prevista no
doc: quem consome recalcula `columns` num hook de breakpoint da aplicação, por exemplo:

```tsx
const columns = useMediaQuery('(min-width: 768px)') ? 10 : 5
<NumberGrid columns={columns} ... />
```

Cada coluna usa `minmax(44px, 1fr)`, então a grade nunca produz uma célula menor que a área
de toque mínima, mesmo em telas estreitas.

## `Badge`

Pill de modalidade — cor da modalidade, texto branco.

```tsx
import { Badge } from '@lotopro/ui'

<Badge lotterySlug="megasena" />               {/* "Mega-Sena" */}
<Badge lotterySlug="maismilionaria" />          {/* "+Milionária" */}
<Badge lotterySlug="lotofacil">Lotofácil 3697</Badge>
```

## Pendências / fora do escopo desta fase

- `@lotopro/core` real ainda não está linkado como dependência — `LotterySlug` é uma cópia
  manual em `tokens.ts` (ver comentário no arquivo).
- Container query para colunas do `NumberGrid` (hoje resolvido via prop `columns`).
- Barra fixa de rodapé, ações rápidas (Surpresinha/Limpar/Repetir/Favoritas) e campo extra
  (trevos/mês/time) do C2 completo — não fazem parte do contrato de props desta tarefa;
  ficam para componentes que compõem com `NumberGrid` numa fase futura.
- Demais componentes do doc 09 §9.3 (`ContestResultCard`, `BetCard`, `PoolCard`/
  `PoolProgressBar`, `PaywallDialog`, `EmptyState`, `StatChart`) não fazem parte desta
  tarefa.
- Testes automatizados (unitários/RTL) de teclado e ARIA do `NumberGrid` ainda não existem
  neste pacote — recomendado antes do GA, junto da validação manual com NVDA/VoiceOver
  pedida em §9.7.

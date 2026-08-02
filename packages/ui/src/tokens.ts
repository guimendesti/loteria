/**
 * LotoPro — Design tokens (objeto TS)
 * Fonte única da verdade dos valores: docs/09-design-system-e-ux.md §9.2.
 * Espelha src/tokens.css — qualquer mudança de valor deve ser replicada nos dois arquivos.
 *
 * Uso previsto: consumo direto pelos componentes deste pacote (sem Tailwind
 * por ora, ver src/NumberBall.tsx) e, futuramente, como `theme.extend` de
 * uma config Tailwind em apps/web.
 */

import type { LotterySlug } from '@lotopro/core'

export type { LotterySlug }

/** Paleta brand / ink / semântica (docs/09 §9.2). */
export const colors = {
  brand: {
    900: '#0B2E23',
    700: '#12594A',
    500: '#1B8A73',
    300: '#6DC2AE',
    100: '#DCF2EC',
  },
  ink: {
    900: '#0F1416',
    600: '#4A5558',
    400: '#7B8689',
    200: '#D8DEDF',
    50: '#F6F8F8',
  },
  success: '#1E9E5A',
  warning: '#C77700',
  danger: '#C4342B',
  info: '#2563A8',
} as const

/**
 * Cores de acento por modalidade. Usar apenas como preenchimento de
 * badge/pill com texto branco, ou como borda/indicador — NUNCA como cor de
 * texto em fundo claro (várias não atingem 4,5:1 de contraste). Valores já
 * ajustados para contraste conforme docs/09 §9.2.
 */
export const lotteryColors: Record<LotterySlug, string> = {
  megasena: '#209869',
  lotofacil: '#930989',
  quina: '#260085',
  lotomania: '#F78100',
  duplasena: '#A61324',
  timemania: '#00A832', // escurecido a partir de #00FF48
  diadesorte: '#B58B3A', // escurecido
  supersete: '#7A9B2E', // escurecido a partir de #A8CF45
  maismilionaria: '#2B2A78',
  loteca: '#E4001B',
  federal: '#133D8D',
}

/** Raio de borda (docs/09 §9.2). */
export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  full: '9999px', // NumberBall, Badge
} as const

/** Espaçamento — escala base 4px (docs/09 §9.2). */
export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
  16: '64px',
} as const

/**
 * Tipografia — famílias e escala em px (docs/09 §9.2).
 * Corpo nunca abaixo de `scale.base` (16px) no mobile — princípio DS1.
 * Números (dezenas) sempre com `fontVariantNumeric: 'tabular-nums'`.
 */
export const typography = {
  fontDisplay: "'Sora', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  fontNumbers: "'Inter Tight', 'Inter', system-ui, sans-serif",
  scale: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    md: '18px',
    lg: '20px',
    xl: '24px',
    '2xl': '30px',
    '3xl': '36px',
    '4xl': '48px',
  },
} as const

/** Área de toque mínima exigida em qualquer elemento interativo (§9.3/§9.7). */
export const touchTargetMin = 44

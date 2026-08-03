import type { Config } from 'tailwindcss'
// ⚠️ Import do MÓDULO DE TOKENS, não do índice do pacote: o índice reexporta
// componentes .tsx, e o jiti (que carrega este config) não resolve JSX — quebra
// o `next build`. Tokens são TS puro. Ver ORQUESTRACAO.md (deploy S4).
import { colors, lotteryColors, radii, spacing, typography } from '@lotopro/ui/src/tokens'

/**
 * Tema Tailwind gerado a partir da fonte única de verdade dos tokens
 * (packages/ui/src/tokens.ts — docs/09-design-system-e-ux.md §9.2).
 * Não redeclarar valores aqui: qualquer mudança de paleta/escala entra em
 * tokens.ts (e no espelho tokens.css) e se propaga sozinha para este config.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx,mdx}',
    // Componentes de @lotopro/ui hoje usam `style` inline (ver README do pacote),
    // mas o glob fica aqui para quando eles migrarem para classes utilitárias.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        ink: colors.ink,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
        // Cores de modalidade — usar SOMENTE como fundo de badge/pill (texto
        // branco) ou borda/indicador, nunca como cor de texto (docs/09 §9.2).
        lottery: lotteryColors,
      },
      borderRadius: {
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        full: radii.full,
      },
      spacing: { ...spacing } as Record<string, string>,
      fontFamily: {
        // Variáveis injetadas por next/font em src/app/layout.tsx; fallback
        // literal dos tokens para o caso raro de a fonte não carregar.
        display: ['var(--font-sora)', 'Sora', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        numbers: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: { ...typography.scale } as Record<string, string>,
    },
  },
  plugins: [],
}

export default config

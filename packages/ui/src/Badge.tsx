/**
 * Badge de modalidade — pill com a cor da modalidade e texto branco.
 * Ver docs/09-design-system-e-ux.md §9.2 (cores de modalidade só como
 * preenchimento de badge/pill com texto branco, nunca como cor de texto).
 */
import * as React from 'react'
import { lotteryColors, radii } from './tokens'
import type { LotterySlug } from '@lotopro/core'

const LOTTERY_NAME: Record<LotterySlug, string> = {
  megasena: 'Mega-Sena',
  lotofacil: 'Lotofácil',
  quina: 'Quina',
  lotomania: 'Lotomania',
  duplasena: 'Dupla Sena',
  timemania: 'Timemania',
  diadesorte: 'Dia de Sorte',
  supersete: 'Super Sete',
  maismilionaria: '+Milionária',
  loteca: 'Loteca',
  federal: 'Federal',
}

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Modalidade — define a cor de fundo e, por padrão, o texto do badge. */
  lotterySlug: LotterySlug
  /** Texto do badge. Se omitido, usa o nome padrão da modalidade. */
  children?: React.ReactNode
}

export function Badge({ lotterySlug, children, style, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: lotteryColors[lotterySlug],
        color: '#FFFFFF',
        borderRadius: radii.full,
        padding: '4px 12px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children ?? LOTTERY_NAME[lotterySlug]}
    </span>
  )
}

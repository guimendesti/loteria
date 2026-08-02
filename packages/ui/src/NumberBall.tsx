/**
 * C1 — NumberBall (docs/09-design-system-e-ux.md §9.3)
 * "A peça mais importante" do design system. Usada no seletor, no resultado,
 * na conferência e no bolão.
 *
 * Acessibilidade (DS6/§9.7): os estados `drawn` e `hit` NUNCA são
 * comunicados só por cor — sempre cor + ícone de check + texto (aria-label).
 */
import * as React from 'react'
import { colors, lotteryColors, radii } from './tokens'
import type { LotterySlug } from '@lotopro/core'

export type NumberBallState = 'default' | 'selected' | 'drawn' | 'hit' | 'missed' | 'disabled'
export type NumberBallSize = 'sm' | 'md' | 'lg'

export interface NumberBallProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Dezena exibida. */
  number: number
  /** Estado visual/semântico da bolinha. @default 'default' */
  state?: NumberBallState
  /**
   * Tamanho visual: sm 32px (listagem densa) · md 40px (padrão) · lg 48px
   * (seletor mobile). NÃO garante a área de toque mínima de 44×44px por si
   * só — quando a bolinha é usada como alvo interativo (ex.: dentro de
   * NumberGrid), quem a envolve é responsável por garantir os 44×44px,
   * para não forçar o tamanho `sm` a crescer visualmente em listas densas.
   * @default 'md'
   */
  size?: NumberBallSize
  /** Modalidade — define a cor de fundo no estado `selected`. */
  lotterySlug: LotterySlug
}

const VISUAL_SIZE: Record<NumberBallSize, number> = { sm: 32, md: 40, lg: 48 }
const FONT_SIZE: Record<NumberBallSize, number> = { sm: 13, md: 15, lg: 17 }

/** Sufixo de estado usado no aria-label, ex.: "dezena 12, acertada". */
const STATE_LABEL_SUFFIX: Record<NumberBallState, string> = {
  default: '',
  selected: ', selecionada',
  drawn: ', sorteada',
  hit: ', acertada',
  missed: ', não acertada',
  disabled: ', indisponível',
}

/** Rótulo acessível de uma dezena num dado estado. Reaproveitado por NumberGrid. */
export function describeNumberBall(number: number, state: NumberBallState): string {
  return `dezena ${number}${STATE_LABEL_SUFFIX[state]}`
}

function getStateStyle(state: NumberBallState, lotterySlug: LotterySlug): React.CSSProperties {
  switch (state) {
    case 'default':
      return {
        backgroundColor: colors.ink[50],
        color: colors.ink[900],
        border: `1.5px solid ${colors.ink[200]}`,
      }
    case 'selected':
      return {
        backgroundColor: lotteryColors[lotterySlug],
        color: '#FFFFFF',
        border: '1.5px solid transparent',
      }
    case 'drawn':
      return {
        backgroundColor: colors.success,
        color: '#FFFFFF',
        border: '1.5px solid transparent',
      }
    case 'hit':
      // "borda dupla": anel branco + anel da cor de sucesso, além da própria borda.
      return {
        backgroundColor: colors.success,
        color: '#FFFFFF',
        border: `2px solid ${colors.success}`,
        boxShadow: `0 0 0 2px #FFFFFF, 0 0 0 4px ${colors.success}`,
      }
    case 'missed':
      return {
        backgroundColor: colors.ink[50],
        color: colors.ink[400],
        border: `1.5px solid ${colors.ink[200]}`,
        opacity: 0.6,
      }
    case 'disabled':
      return {
        backgroundColor: colors.ink[50],
        color: colors.ink[900],
        border: `1.5px solid ${colors.ink[200]}`,
        opacity: 0.4,
      }
  }
}

/** Selo de check — nunca a única forma de indicar "sorteada"/"acertada" (ver aria-label). */
function CheckBadge({ diameter }: { diameter: number }) {
  const badge = Math.max(14, Math.round(diameter * 0.42))
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -3,
        right: -3,
        width: badge,
        height: badge,
        borderRadius: radii.full,
        backgroundColor: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 0 1.5px ${colors.success}`,
      }}
    >
      <svg width="68%" height="68%" viewBox="0 0 20 20" fill="none">
        <path
          d="M4 10.5L8 14.5L16 5.5"
          stroke={colors.success}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function NumberBall({
  number,
  state = 'default',
  size = 'md',
  lotterySlug,
  style,
  ...rest
}: NumberBallProps) {
  const visual = VISUAL_SIZE[size]
  const showCheck = state === 'drawn' || state === 'hit'
  const stateStyle = getStateStyle(state, lotterySlug)
  const label = describeNumberBall(number, state)

  return (
    <span
      // role="img" + aria-label: trata número + ícone como uma única unidade
      // acessível, evitando que leitores de tela naveguem/dupliquem o
      // conteúdo interno (número em texto, ícone decorativo).
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: visual,
        height: visual,
        boxSizing: 'border-box',
        borderRadius: radii.full,
        fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        fontSize: FONT_SIZE[size],
        lineHeight: 1,
        userSelect: 'none',
        flexShrink: 0,
        ...stateStyle,
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden="true">{number}</span>
      {showCheck && <CheckBadge diameter={visual} />}
    </span>
  )
}

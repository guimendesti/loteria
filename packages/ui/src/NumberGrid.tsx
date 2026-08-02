/**
 * C2 — NumberGrid (docs/09-design-system-e-ux.md §9.3)
 * Seletor de dezenas do universo de uma modalidade.
 *
 * Requisitos NÃO NEGOCIÁVEIS (doc §9.3/§9.7), todos implementados aqui:
 *  - Navegação por teclado completa (setas respeitam colunas, Space/Enter
 *    alterna seleção, Home/End vão ao início/fim da linha, Tab sai do grid).
 *  - role="grid" / "row" / "gridcell" com aria-selected.
 *  - Contador acessível via aria-live="polite" ("X de Y selecionadas").
 *  - Área de toque mínima 44×44px por dezena.
 *  - onChange nunca é chamado para uma seleção acima de picksMax (bloqueio).
 *
 * Fora do escopo desta implementação (ver README/relatório): barra fixa de
 * rodapé, ações rápidas (Surpresinha/Limpar/Repetir/Favoritas) e campo
 * extra (trevos/mês/time) — não fazem parte do contrato de props definido
 * para esta tarefa; ficam para um componente/fase futura que compõe com
 * este.
 */
import * as React from 'react'
import { NumberBall, describeNumberBall } from './NumberBall'
import type { NumberBallState } from './NumberBall'
import { colors, touchTargetMin } from './tokens'
import type { LotterySlug } from './tokens'

export interface NumberGridProps {
  /** Menor dezena do universo da modalidade (ex.: 1). */
  universeMin: number
  /** Maior dezena do universo da modalidade (ex.: 60 na Mega-Sena). */
  universeMax: number
  /** Mínimo de dezenas exigido pela modalidade/aposta. */
  picksMin: number
  /** Máximo de dezenas permitido — seleção acima disso é bloqueada. */
  picksMax: number
  /** Dezenas atualmente selecionadas. Componente controlado. */
  selected: number[]
  /** Disparado com a nova lista de selecionadas a cada alternância válida. */
  onChange: (numbers: number[]) => void
  /** Modalidade — define a cor do estado "selected" das bolinhas. */
  lotterySlug: LotterySlug
  /** Grid inteiramente somente-leitura (ex.: exibição de um jogo já registrado). */
  disabled?: boolean
  /**
   * Nº de colunas do grid. O doc 09 §C2 pede colunas adaptativas — 5
   * (mobile, 360px) → 10 (desktop) — via container query OU via esta prop.
   * Este pacote ainda não tem pipeline de CSS (container queries exigiriam
   * um arquivo CSS + `container-type`, fora do "sem Tailwind/sem build"
   * combinado para esta fase). Optou-se pela alternativa explícita do doc:
   * a responsividade fica a cargo de quem consome (recalcular esta prop
   * num hook de breakpoint do app, ex. `columns={isMobile ? 5 : 10}`).
   * @default 10
   */
  columns?: number
}

function range(min: number, max: number): number[] {
  const out: number[] = []
  for (let n = min; n <= max; n++) out.push(n)
  return out
}

export function NumberGrid({
  universeMin,
  universeMax,
  picksMin,
  picksMax,
  selected,
  onChange,
  lotterySlug,
  disabled = false,
  columns = 10,
}: NumberGridProps) {
  const numbers = React.useMemo(() => range(universeMin, universeMax), [universeMin, universeMax])
  const rowCount = Math.ceil(numbers.length / columns)
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const isBlockedAdd = selected.length >= picksMax

  const [activeIndex, setActiveIndex] = React.useState(0)
  const cellRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const statusId = React.useId()

  const stateFor = React.useCallback(
    (n: number): NumberBallState => {
      const isSelected = selectedSet.has(n)
      if (disabled) return isSelected ? 'selected' : 'disabled'
      if (isSelected) return 'selected'
      if (isBlockedAdd) return 'disabled' // bloqueia visualmente a seleção acima de picksMax
      return 'default'
    },
    [disabled, isBlockedAdd, selectedSet]
  )

  const toggle = React.useCallback(
    (n: number) => {
      if (disabled) return
      const isSelected = selectedSet.has(n)
      if (isSelected) {
        onChange(selected.filter((x) => x !== n))
        return
      }
      // Bloqueia seleção acima do máximo: onChange nem é chamado.
      if (selected.length >= picksMax) return
      onChange([...selected, n].sort((a, b) => a - b))
    },
    [disabled, onChange, picksMax, selected, selectedSet]
  )

  const focusIndex = React.useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, numbers.length - 1))
      setActiveIndex(clamped)
      cellRefs.current[clamped]?.focus()
    },
    [numbers.length]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      if (disabled) return
      const rowStart = index - (index % columns)
      const rowEnd = Math.min(rowStart + columns - 1, numbers.length - 1)

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          focusIndex(Math.min(index + 1, numbers.length - 1))
          break
        case 'ArrowLeft':
          event.preventDefault()
          focusIndex(Math.max(index - 1, 0))
          break
        case 'ArrowDown':
          event.preventDefault()
          focusIndex(Math.min(index + columns, numbers.length - 1))
          break
        case 'ArrowUp':
          event.preventDefault()
          focusIndex(Math.max(index - columns, 0))
          break
        case 'Home':
          event.preventDefault()
          focusIndex(event.ctrlKey ? 0 : rowStart)
          break
        case 'End':
          event.preventDefault()
          focusIndex(event.ctrlKey ? numbers.length - 1 : rowEnd)
          break
        case ' ':
        case 'Spacebar':
        case 'Enter': {
          event.preventDefault()
          const n = numbers[index]
          if (n !== undefined) toggle(n)
          break
        }
        default:
          break
      }
    },
    [columns, disabled, focusIndex, numbers, toggle]
  )

  const hint =
    selected.length < picksMin
      ? `Selecione ao menos ${picksMin} dezena${picksMin === 1 ? '' : 's'}.`
      : null

  const rows: number[][] = []
  for (let r = 0; r < rowCount; r++) {
    rows.push(numbers.slice(r * columns, r * columns + columns))
  }

  return (
    <div>
      <div
        role="grid"
        aria-label="Seleção de dezenas"
        aria-multiselectable="true"
        aria-rowcount={rowCount}
        aria-colcount={columns}
        aria-describedby={statusId}
        aria-disabled={disabled || undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(${touchTargetMin}px, 1fr))`,
          gap: 8,
        }}
      >
        {rows.map((rowNumbers, rowIndex) => (
          // display:'contents' preserva role="row" no DOM sem quebrar o
          // layout de CSS Grid do container pai (as células continuam
          // participando diretamente das trilhas do grid).
          <div role="row" key={rowIndex} style={{ display: 'contents' }}>
            {rowNumbers.map((n, colIndex) => {
              const index = rowIndex * columns + colIndex
              const state = stateFor(n)
              const isSelected = selectedSet.has(n)
              const isBlockedCell = !isSelected && state === 'disabled'
              const isTabbable = index === activeIndex

              return (
                <div
                  key={n}
                  ref={(el) => {
                    cellRefs.current[index] = el
                  }}
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-disabled={disabled || isBlockedCell || undefined}
                  aria-label={describeNumberBall(n, state)}
                  tabIndex={isTabbable ? 0 : -1}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onClick={() => {
                    if (disabled) return
                    setActiveIndex(index)
                    toggle(n)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: touchTargetMin,
                    minHeight: touchTargetMin,
                    boxSizing: 'border-box',
                    borderRadius: 8,
                    cursor: disabled || isBlockedCell ? 'default' : 'pointer',
                  }}
                >
                  {/* aria-hidden: o rótulo acessível vive no gridcell (pai),
                      que é o elemento focável/interativo real. Evita dupla
                      leitura do mesmo conteúdo pelo leitor de tela. */}
                  <NumberBall number={n} state={state} size="md" lotterySlug={lotterySlug} aria-hidden="true" />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div
        id={statusId}
        aria-live="polite"
        role="status"
        style={{ marginTop: 8, fontSize: 14, color: colors.ink[600] }}
      >
        {selected.length} de {picksMax} selecionadas.{hint ? ` ${hint}` : ''}
      </div>
    </div>
  )
}

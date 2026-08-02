'use client'

import { NumberBall } from '@lotopro/ui'
import type { LotterySlug } from '@lotopro/core'

export interface ColumnsPickerProps {
  columnCount: number
  maxPerColumn: number
  universeMin: number
  universeMax: number
  value: number[][]
  onChange: (columns: number[][]) => void
  lotterySlug: LotterySlug
  disabled?: boolean
}

/**
 * Seletor por colunas independentes (Super Sete/Loteca — formatos
 * COLUMNS/MATCH_LIST, docs/08 CL-12). Cada coluna aceita de 1 a
 * `maxPerColumn` valores de `universeMin`..`universeMax`.
 *
 * O `NumberGrid` de @lotopro/ui não serve aqui: ele modela UM conjunto de
 * escolhas com mín/máx globais (docs/09 §9.3 C2), não N colunas
 * independentes — por isso este componente local reaproveita `NumberBall`
 * (a peça reutilizável) em vez do grid inteiro.
 */
export function ColumnsPicker({
  columnCount,
  maxPerColumn,
  universeMin,
  universeMax,
  value,
  onChange,
  lotterySlug,
  disabled = false,
}: ColumnsPickerProps) {
  const universe: number[] = []
  for (let n = universeMin; n <= universeMax; n++) universe.push(n)

  function toggle(columnIndex: number, n: number) {
    if (disabled) return
    const columns = value.map((col) => [...col])
    while (columns.length < columnCount) columns.push([])
    const column = columns[columnIndex] ?? []
    if (column.includes(n)) {
      columns[columnIndex] = column.filter((x) => x !== n)
    } else {
      if (column.length >= maxPerColumn) return
      columns[columnIndex] = [...column, n].sort((a, b) => a - b)
    }
    onChange(columns)
  }

  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const column = value[columnIndex] ?? []
        return (
          <div key={columnIndex} className="flex flex-col items-center gap-1 rounded-md border border-ink-200 p-2">
            <span className="text-xs font-medium text-ink-600">Col. {columnIndex + 1}</span>
            <div className="grid grid-cols-2 gap-1">
              {universe.map((n) => {
                const isSelected = column.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(columnIndex, n)}
                    aria-pressed={isSelected}
                    aria-label={`coluna ${columnIndex + 1}, dígito ${n}${isSelected ? ', selecionado' : ''}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center"
                  >
                    <NumberBall
                      number={n}
                      state={isSelected ? 'selected' : 'default'}
                      size="sm"
                      lotterySlug={lotterySlug}
                      aria-hidden="true"
                    />
                  </button>
                )
              })}
            </div>
            <span className="text-[11px] text-ink-400">
              {column.length}/{maxPerColumn}
            </span>
          </div>
        )
      })}
    </div>
  )
}

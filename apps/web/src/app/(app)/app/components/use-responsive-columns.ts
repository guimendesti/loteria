'use client'

import { useEffect, useState } from 'react'

/**
 * Colunas adaptativas do `NumberGrid` (docs/09 §9.3 C2: "5 mobile → 10
 * desktop"). O componente de @lotopro/ui não tem pipeline de CSS/container
 * queries (ver comentário em packages/ui/src/NumberGrid.tsx) — a
 * responsividade fica a cargo de quem consome, via esta prop `columns`.
 * Estado inicial = desktop (10) para casar com a primeira renderização no
 * servidor; ajusta no efeito assim que `window` existe.
 */
export function useResponsiveColumns(mobileColumns = 5, desktopColumns = 10, breakpointPx = 640): number {
  const [columns, setColumns] = useState(desktopColumns)

  useEffect(() => {
    function update() {
      setColumns(window.innerWidth < breakpointPx ? mobileColumns : desktopColumns)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [mobileColumns, desktopColumns, breakpointPx])

  return columns
}

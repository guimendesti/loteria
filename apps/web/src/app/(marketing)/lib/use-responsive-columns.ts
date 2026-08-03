'use client'

import { useEffect, useState } from 'react'

/**
 * Colunas adaptativas do `NumberGrid` (docs/09 §9.3 C2: "5 mobile → 10 desktop").
 * Duplicado de `apps/web/src/app/(app)/app/components/use-responsive-columns.ts`
 * — (marketing) não importa de (app) (fora do território desta tarefa). O
 * componente de `@lotopro/ui` não tem pipeline de CSS/container queries (ver
 * comentário em packages/ui/src/NumberGrid.tsx), então a responsividade fica
 * a cargo de quem consome, via esta prop `columns`.
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

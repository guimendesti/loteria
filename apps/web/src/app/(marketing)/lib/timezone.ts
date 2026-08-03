/**
 * Espelho mínimo de `apps/worker/src/lib/timezone.ts` (`formatIsoDateInSaoPaulo`) —
 * (marketing) não pode importar de `apps/worker` (apps diferentes, sem
 * `transpilePackages`), então duplicamos a única função que as páginas
 * públicas precisam: converter `Contest.drawDate` (timestamptz) para o
 * formato ISO local (`YYYY-MM-DD`) que `ContestResult.drawDate` espera
 * (packages/core/src/types.ts).
 */
export const SAO_PAULO_TZ = 'America/Sao_Paulo'

/** `Contest.drawDate` (timestamptz) → `YYYY-MM-DD` local em America/Sao_Paulo. */
export function formatIsoDateInSaoPaulo(date: Date): string {
  // Locale en-CA formata como YYYY-MM-DD — truque padrão para não montar a string na mão.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

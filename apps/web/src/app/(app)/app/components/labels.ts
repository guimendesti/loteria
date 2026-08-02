/** Rótulos compartilhados entre BetCard, detalhe e cadastro de jogo. */

/** Espelha o enum `BetSource` (packages/db/prisma/schema.prisma). */
export const SOURCE_LABEL: Record<'MANUAL' | 'GENERATED' | 'OCR' | 'IMPORT' | 'CLOSURE', string> = {
  MANUAL: 'Manual',
  GENERATED: 'Gerado',
  OCR: 'OCR',
  IMPORT: 'Importado',
  CLOSURE: 'Fechamento',
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

/**
 * CL-63 (docs/08 §C.4) — requisito de compliance transversal: em toda tela de
 * bolão, banner permanente com o texto abaixo (citação literal do doc).
 * Zero custódia (CLAUDE.md §1): o LotoPro nunca recebe, guarda ou repassa
 * dinheiro de bolão — todo Pix é P2P entre participante e organizador.
 */
const LEGAL_TEXT =
  'O LotoPro não recebe, não guarda e não repassa valores. Os pagamentos são feitos diretamente entre você e o organizador. O organizador é o único responsável por realizar a aposta e guardar o comprovante.'

export interface LegalBannerProps {
  /** `banner` — bloco de destaque no topo da tela. `inline` — nota compacta perto de um Pix específico. */
  variant?: 'banner' | 'inline'
}

export function LegalBanner({ variant = 'banner' }: LegalBannerProps) {
  if (variant === 'inline') {
    return (
      <p className="mt-3 flex items-start gap-2 text-xs text-ink-600">
        <span aria-hidden="true">🔒</span>
        <span>{LEGAL_TEXT}</span>
      </p>
    )
  }

  return (
    <div className="my-4 flex items-start gap-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
      <span aria-hidden="true" className="mt-0.5 text-base">
        🔒
      </span>
      <p className="text-sm leading-relaxed text-ink-900">{LEGAL_TEXT}</p>
    </div>
  )
}

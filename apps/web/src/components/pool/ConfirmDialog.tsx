'use client'

export interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  isLoading?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmação genérica para ações destrutivas (remover participante, cancelar bolão). */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isLoading = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-md"
      >
        <h3 id="confirm-dialog-title" className="font-display text-lg font-semibold text-ink-900">
          {title}
        </h3>
        <p className="mt-2 text-sm text-ink-600">{description}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              destructive ? 'bg-danger hover:bg-danger/90' : 'bg-brand-500 hover:bg-brand-700'
            }`}
          >
            {isLoading ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

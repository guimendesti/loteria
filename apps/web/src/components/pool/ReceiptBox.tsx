/** CL-48/CL-59 — comprovante oficial da aposta, visível a todos (dono e participantes). */
export function ReceiptBox({ receiptUrl }: { receiptUrl: string | null }) {
  if (!receiptUrl) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-white p-4 text-sm text-ink-600">
        O organizador ainda não anexou o comprovante oficial da aposta.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-sm font-medium text-ink-900">Comprovante oficial da aposta</p>
      <a
        href={receiptUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-brand-500 hover:bg-ink-50 hover:text-brand-700"
      >
        Ver comprovante ↗
      </a>
    </div>
  )
}

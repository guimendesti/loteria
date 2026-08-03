import { safeExternalHref } from './safe-external-href'

/** CL-48/CL-59 — comprovante oficial da aposta, visível a todos (dono e participantes). */
export function ReceiptBox({ receiptUrl }: { receiptUrl: string | null }) {
  if (!receiptUrl) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-white p-4 text-sm text-ink-600">
        O organizador ainda não anexou o comprovante oficial da aposta.
      </div>
    )
  }

  // Defesa em profundidade: `receiptUrl` é texto livre gravado no banco (server/routers/pool.ts
  // valida na entrada, mas linhas antigas continuam como foram salvas). Um esquema
  // `javascript:`/`data:` renderizado como `href` sem checagem é XSS armazenado — ver
  // `safe-external-href.ts`. Se não for um link válido, avisa em vez de tentar abrir algo.
  const safeHref = safeExternalHref(receiptUrl)

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-sm font-medium text-ink-900">Comprovante oficial da aposta</p>
      {safeHref ? (
        <>
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-brand-500 hover:bg-ink-50 hover:text-brand-700"
          >
            Ver comprovante ↗
          </a>
          <p className="mt-1 text-xs text-ink-400">
            Link externo enviado pelo organizador — o LotoPro não verifica o destino.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-danger">
          O comprovante anexado pelo organizador não é um endereço válido e não pode ser aberto.
        </p>
      )}
    </div>
  )
}

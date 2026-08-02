'use client'

import { useEffect, useState } from 'react'
import { takeToast } from './toast'

/**
 * Banner de sucesso consumido de `sessionStorage` — usado após um redirect
 * pós-mutação (ex.: CL-12 salvar jogo → volta para /app/jogos).
 */
export function ToastBanner() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const pending = takeToast()
    if (pending) setMessage(pending)
  }, [])

  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(id)
  }, [message])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center justify-between rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Fechar aviso"
        className="ml-4 text-success/70 hover:text-success"
      >
        ×
      </button>
    </div>
  )
}

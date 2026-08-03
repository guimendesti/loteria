'use client'

import { useState } from 'react'

export interface CopyButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  className?: string
}

/**
 * Botão de copiar com feedback TEXTUAL (não só troca de ícone — docs/09
 * acessibilidade). Cai para `document.execCommand('copy')` quando a Clipboard
 * API não está disponível (contexto não seguro, navegador antigo).
 */
export function CopyButton({ value, label = 'Copiar', copiedLabel = 'Copiado!', className }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setState('copied')
    } catch {
      setState('failed')
    } finally {
      setTimeout(() => setState('idle'), 2500)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={
        className ??
        'rounded-md border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50'
      }
    >
      {state === 'failed' ? 'Não copiou — selecione o texto manualmente' : state === 'copied' ? copiedLabel : label}
    </button>
  )
}

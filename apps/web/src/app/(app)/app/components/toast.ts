/**
 * Toast de sucesso "sobrevivendo" a um redirect de página inteira (ex.: criar
 * jogo → volta para /app/jogos). Sem lib de toast instalada no projeto — em
 * vez de um Context/Provider global, guarda a mensagem em `sessionStorage` e
 * quem chega na página de destino consome via `<ToastBanner />`.
 */
const KEY = 'lotopro:toast'

export function setToast(message: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(KEY, message)
}

/** Lê e remove a mensagem pendente, se houver — nunca mostrada duas vezes. */
export function takeToast(): string | null {
  if (typeof window === 'undefined') return null
  const message = window.sessionStorage.getItem(KEY)
  if (message !== null) window.sessionStorage.removeItem(KEY)
  return message
}

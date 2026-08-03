/**
 * CL-48/CL-59 — comprovantes (aposta oficial e pagamento de participante) são texto livre
 * digitado por usuários e gravados como vieram (`server/routers/pool.ts`). Uma validação nova
 * na entrada não limpa o que já está no banco: linhas antigas continuam do jeito que foram
 * salvas. Renderizar `receiptUrl`/`proofUrl` direto num `href` sem checar o protocolo é XSS
 * armazenado — um `javascript:`/`data:` clicado por outro membro ou pelo organizador executa
 * na origem autenticada do LotoPro; React 18 só avisa isso no console, não bloqueia o `href`.
 *
 * `new URL` (parser real, não regex artesanal) decide: só sai daqui uma URL absoluta
 * `http:`/`https:`. Tudo o mais — `javascript:`, `data:`, `vbscript:`, `blob:`, caminho
 * relativo, esquema qualquer, lixo não parseável — vira `null`, e quem chama deve mostrar que
 * aquele link não abre em vez de renderizar um `<a>` morto ou perigoso.
 */
export function safeExternalHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  return parsed.href
}

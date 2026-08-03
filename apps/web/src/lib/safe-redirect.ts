/**
 * Onda 8 — sanitiza um destino de retorno pós-login/cadastro (`callbackURL`) vindo de query
 * string, portanto NUNCA confiável (qualquer um pode montar `/login?callbackURL=...`).
 *
 * Usado pelo fluxo "Entrar para participar" do convite público de bolão
 * (`app/(marketing)/j/[inviteCode]/**`): o visitante deslogado vai para
 * `/login?callbackURL=/j/<code>` e volta para o convite depois de autenticar — mas o mesmo
 * parâmetro serve qualquer chamador futuro que precise de "volte para onde eu estava".
 *
 * Só aceita um caminho RELATIVO interno (`/j/abc123`), nunca uma URL absoluta
 * (`https://...`) nem protocol-relative (`//evil.com`, `/\evil.com` — alguns navegadores
 * tratam a barra invertida como separador de host) — sem isso, um link de phishing poderia
 * usar nosso domínio de login/cadastro real para redirecionar a vítima, já autenticada, para
 * um site malicioso (CWE-601 — open redirect).
 */
export function sanitizeCallbackURL(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (raw.length > 2048) return null // defesa em profundidade contra URL absurdamente longa
  if (/[\r\n]/.test(raw)) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

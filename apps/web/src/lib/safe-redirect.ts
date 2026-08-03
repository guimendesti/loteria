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
 *
 * ★ Achado de auditoria (severidade alta, corrigido): a versão anterior só rejeitava `\r`/`\n`
 * literais. A spec WHATWG manda o PARSER de URL do navegador remover TAB (code point 9), LF e
 * CR de QUALQUER LUGAR da string antes de interpretá-la — então `/%09/evil.com` (que
 * `searchParams.get('callbackURL')` decodifica para uma barra, um TAB e "evil.com") passava
 * por todos os checks daqui (começa com `/`, não é `//`, não é `/\`, não tem `\r`/`\n`
 * literal) e só virava `//evil.com` DEPOIS, quando o navegador processava o
 * `router.push`/redirect final — nesse ponto o usuário já tinha autenticado de verdade no
 * domínio real. Em vez de enumerar caractere por caractere (frágil: sempre sobra algum
 * controle esquecido), rejeitamos a faixa INTEIRA de controle ASCII: todo code point de 0 a 31
 * (cobre TAB/LF/CR e qualquer outro C0) e também 127 (DEL) — nenhum caminho legítimo de app
 * precisa desses bytes crus numa URL. Comparação por `charCodeAt` em vez de um literal de
 * regex com classe de caracteres de controle — mais explícito sobre exatamente quais code
 * points são rejeitados e sem depender de um comentário `eslint-disable` para a regra
 * `no-control-regex`.
 */
const MIN_REJECTED_CONTROL_CODE = 31 // rejeita 0..31 (todo C0, inclui TAB=9, LF=10, CR=13)
const DEL_CODE = 127

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= MIN_REJECTED_CONTROL_CODE || code === DEL_CODE) return true
  }
  return false
}

export function sanitizeCallbackURL(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (raw.length > 2048) return null // defesa em profundidade contra URL absurdamente longa
  if (hasControlCharacter(raw)) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

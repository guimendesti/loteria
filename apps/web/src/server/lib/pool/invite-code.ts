/**
 * Código de convite do bolão (`Pool.inviteCode`, `@unique`) — credencial viva: quem tem o
 * código entra (docs/contracts/onda8-bolao.md, invariante 5). Gerado com `node:crypto`
 * (aleatoriedade forte, mesmo padrão de `server/lib/crypto.ts`), num alfabeto sem
 * caracteres ambíguos (sem `0/O`, `1/I/L`) porque o código pode ser digitado à mão.
 */
import { randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

/**
 * `INVITE_CODE_TTL_DAYS` não está definido no contrato (docs/contracts/onda8-bolao.md
 * não fala em prazo de expiração) — 14 dias é uma assunção documentada aqui e no
 * relatório da tarefa (mesma ordem de grandeza do trial de docs/05, `TRIAL_DAYS`).
 * Ajustável sem quebrar nada: só afeta o cálculo em `pool.create`.
 */
export const INVITE_CODE_TTL_DAYS = 14

export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0
    code += ALPHABET[byte % ALPHABET.length]
  }
  return code
}

/**
 * Gera um código e confere unicidade via `exists` (injeta a checagem no banco — mantém
 * esta função pura/testável com um fake em vez de precisar de um Prisma real). Tenta
 * algumas vezes antes de desistir; com 10 caracteres de um alfabeto de 32 símbolos
 * (32^10 combinações), colisão é praticamente impossível — o retry é só uma rede de
 * segurança.
 */
export async function generateUniqueInviteCode(
  exists: (code: string) => Promise<boolean>,
  maxAttempts = 8,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateInviteCode()
    if (!(await exists(code))) return code
  }
  throw new Error('Não foi possível gerar um código de convite único após várias tentativas.')
}

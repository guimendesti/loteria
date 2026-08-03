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

/**
 * Mapeia um byte aleatório (0–255) para um índice de `[0, alphabetLength)` SEM viés, ou
 * `null` quando o byte precisa ser descartado (achado de auditoria J-menor: `byte %
 * alphabetLength` sozinho enviesa os índices baixos sempre que 256 não é múltiplo exato
 * de `alphabetLength` — aqui, ALPHABET tem 31 símbolos, não 32; `256 = 8×31 + 8`, então os
 * 8 primeiros símbolos saíam ~12,5% mais vezes que os outros 23). Rejeição de amostra:
 * só aceita bytes abaixo do maior múltiplo de `alphabetLength` que cabe em 256 (`limit`);
 * bytes `>= limit` (aqui, 248–255) são descartados e o chamador sorteia outro. Sem isso
 * nenhum impacto prático de segurança (o espaço de busca continua ~10×log2(31) ≈ 49 bits),
 * mas o viés é incorreto e fácil de evitar.
 */
export function alphabetIndexFromByte(byte: number, alphabetLength: number): number | null {
  const limit = Math.floor(256 / alphabetLength) * alphabetLength
  if (byte >= limit) return null
  return byte % alphabetLength
}

function randomAlphabetIndex(alphabetLength: number): number {
  // Cada tentativa aceita com probabilidade `limit/256` (~96,9% para 31 símbolos) — o
  // loop termina em 1 iteração na esmagadora maioria das vezes; `node:crypto` nunca
  // esgota, então não há limite de tentativas aqui (diferente de `generateUniqueInviteCode`,
  // que trata colisão contra o banco, um recurso finito).
  let index: number | null = null
  while (index === null) {
    const byte = randomBytes(1)[0] ?? 0
    index = alphabetIndexFromByte(byte, alphabetLength)
  }
  return index
}

export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomAlphabetIndex(ALPHABET.length)]
  }
  return code
}

/**
 * Gera um código e confere unicidade via `exists` (injeta a checagem no banco — mantém
 * esta função pura/testável com um fake em vez de precisar de um Prisma real). Tenta
 * algumas vezes antes de desistir; com 10 caracteres de um alfabeto de 31 símbolos
 * (31^10 ≈ 8,2×10^14 combinações), colisão é praticamente impossível — o retry é só uma
 * rede de segurança.
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

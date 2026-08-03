/**
 * Criptografia simétrica para dados sensíveis em repouso — hoje só a chave Pix do
 * organizador de bolão (`User.pixKeyEncrypted`, docs/03 §3.5: "Chave Pix é dado
 * pessoal. Criptografar em repouso (AES-256, chave em KMS). Nunca logar.").
 *
 * `grep -rn "createCipheriv|AES" packages apps` (rodado antes desta tarefa) não achou
 * nenhum helper de cripto em código-fonte do monorepo — só os `.d.ts` do Node dentro de
 * `node_modules`. Este módulo é o primeiro; se outro pacote precisar de cripto simétrica
 * no futuro, é candidato a subir para `packages/core` em vez de duplicar.
 *
 * AES-256-GCM com IV aleatório de 96 bits GERADO A CADA CHAMADA (nunca reaproveitado
 * entre registros nem entre gravações do mesmo registro) — a mesma chave Pix cifrada
 * duas vezes produz payloads diferentes, então não dá para comparar ciphertexts para
 * detectar repetição. GCM também autentica: `decryptSecret` lança se o payload foi
 * adulterado ou cifrado com outra chave, em vez de devolver lixo silenciosamente.
 *
 * ⚠️ PENDÊNCIA DE INFRAESTRUTURA — `ENCRYPTION_KEY`:
 * A chave vem de `process.env.ENCRYPTION_KEY` (32 bytes em base64 — gerar com
 * `openssl rand -base64 32`). Essa env AINDA NÃO EXISTE em `apps/web/.env.example` nem
 * em nenhum ambiente (não foi adicionada por esta tarefa — fora do território exclusivo
 * desta onda). Precisa ser criada e, em produção, guardada em KMS/secrets manager
 * (docs/03 §3.5) antes de `account.pixKey.set` funcionar de verdade. Ver relatório.
 *
 * A leitura da env é LAZY (dentro de `loadKey`, não no escopo do módulo) de propósito:
 * importar este arquivo nunca falha por env ausente — só falha ALTO na hora de cifrar/
 * decifrar de verdade. Mesmo padrão de `src/lib/auth.ts` (fallback de string vazia para
 * não quebrar o import/typecheck em ambiente sem `.env`).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12 // 96 bits — tamanho recomendado (NIST SP 800-38D) para GCM
const AUTH_TAG_BYTES = 16
/** Prefixo de formato: permite trocar algoritmo/layout no futuro sem quebrar payloads já gravados. */
const FORMAT_VERSION = 'v1'

function loadKey(): Buffer {
  const encoded = process.env.ENCRYPTION_KEY
  if (!encoded) {
    throw new Error(
      'ENCRYPTION_KEY não configurada. Gere 32 bytes em base64 (`openssl rand -base64 32`) e ' +
        'defina a env antes de criptografar/descriptografar dados sensíveis (docs/03 §3.5).',
    )
  }

  const key = Buffer.from(encoded, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY inválida: esperado ${KEY_BYTES} bytes em base64, recebido ${key.length}.`,
    )
  }
  return key
}

/**
 * Cifra `plaintext` com AES-256-GCM. Formato do payload gravado no banco:
 * `v1:<iv base64>:<authTag base64>:<ciphertext base64>`.
 *
 * NUNCA logar `plaintext` nem o retorno perto de dados legíveis — quem chama isto
 * (`server/routers/account.ts`) só deve persistir o resultado, nunca devolvê-lo ao
 * cliente ou escrevê-lo em log/erro.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decifra um payload gerado por `encryptSecret`. Lança `Error` se o formato for
 * desconhecido, os campos estiverem malformados, ou a tag de autenticação não bater
 * (adulteração ou chave errada) — nunca devolve texto parcial/corrompido.
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Payload cifrado com formato desconhecido.')
  }

  const [, ivB64, tagB64, dataB64] = parts
  if (ivB64 === undefined || tagB64 === undefined || dataB64 === undefined) {
    throw new Error('Payload cifrado malformado.')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Payload cifrado malformado.')
  }

  const key = loadKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

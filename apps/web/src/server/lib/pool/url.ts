/**
 * Validação de URLs de comprovante (`Pool.receiptUrl`, `PoolPayment.proofUrl`) — achado de
 * auditoria J-3. Antes, ambos os campos aceitavam `z.string().trim().min(1).max(2000)`, ou
 * seja, QUALQUER string. Esses valores são renderizados como `href` para outros usuários
 * (o organizador clica em "Ver comprovante" a partir de um participante comum, ou vice-
 * versa) — uma origem autenticada do LotoPro linkando pra fora sem checagem nenhuma.
 *
 * Exploração: um participante manda `proofUrl` apontando para phishing (o organizador sai
 * do app autenticado achando que vai ver um comprovante Pix); ou `javascript:`/`data:`, que
 * vira XSS armazenado se algum componente algum dia renderizar sem `target=_blank`/`rel`
 * apropriados — não dá pra confiar que a UI sempre vai se proteger perfeitamente, o
 * servidor tem que recusar o dado perigoso na entrada.
 *
 * Exige URL ABSOLUTA e `https:` — nunca `http:` (mixed content / sem TLS), nunca
 * `javascript:`/`data:`/caminho relativo. `new URL(...)` já rejeita qualquer string que não
 * seja uma URL absoluta bem formada.
 */
import { z } from 'zod'

export function httpsUrlSchema(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(2000, 'URL muito longa.')
    .refine(
      (value) => {
        try {
          return new URL(value).protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: 'A URL precisa ser um link https:// absoluto e válido (ex.: https://exemplo.com/comprovante.png).' },
    )
}

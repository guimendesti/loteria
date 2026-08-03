/**
 * Chave Pix do organizador do bolão — máscara para exibição e peças auxiliares do
 * payload EMV que não são o cálculo do EMV em si (isso é `buildPixPayload`, de
 * `@lotopro/core`, território do agente A nesta onda).
 *
 * ⚠️ Regra dura (docs/contracts/onda8-bolao.md, invariante 6): `ownerPixKeyEnc` NUNCA sai
 * do servidor. `maskOwnerPixKey` recebe a chave já DECIFRADA (chamador decifra com
 * `server/lib/crypto.ts#decryptSecret` só para calcular a máscara) e devolve só o
 * suficiente para o participante reconhecer a chave — nunca o valor inteiro.
 */
import { PixKeyType } from '@lotopro/db'
import type { PixKeyKind } from '@lotopro/core'

/**
 * `PixKeyType` (Prisma, `@lotopro/db`) e `PixKeyKind` (`@lotopro/core`) têm os mesmos
 * literais ('CPF'|'CNPJ'|'EMAIL'|'PHONE'|'RANDOM') mas são tipos nominalmente distintos —
 * mapeamento explícito e exaustivo em vez de `as`, para o typecheck acusar se um valor
 * novo for adicionado a um dos dois enums sem o outro.
 */
export function toPixKeyKind(type: PixKeyType): PixKeyKind {
  switch (type) {
    case PixKeyType.CPF:
      return 'CPF'
    case PixKeyType.CNPJ:
      return 'CNPJ'
    case PixKeyType.EMAIL:
      return 'EMAIL'
    case PixKeyType.PHONE:
      return 'PHONE'
    case PixKeyType.RANDOM:
      return 'RANDOM'
    default: {
      const exhaustive: never = type
      throw new Error(`Tipo de chave Pix desconhecido: ${String(exhaustive)}`)
    }
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Máscara "reconhecível" (docs/contracts/onda8-bolao.md): mostra só o bastante para o
 * participante confirmar que é a pessoa certa. Exemplos do contrato: e-mail
 * `***@gmail.com`, CPF `***.***.789-00`.
 */
export function maskOwnerPixKey(type: PixKeyType, value: string): string {
  switch (type) {
    case PixKeyType.EMAIL: {
      const at = value.indexOf('@')
      return at > 0 ? `***${value.slice(at)}` : '***'
    }
    case PixKeyType.CPF: {
      const tail = onlyDigits(value).padStart(11, '0').slice(-5)
      return `***.***.${tail.slice(0, 3)}-${tail.slice(3)}`
    }
    case PixKeyType.CNPJ: {
      const tail = onlyDigits(value).padStart(14, '0').slice(-6)
      return `**.***.***/${tail.slice(0, 4)}-${tail.slice(4)}`
    }
    case PixKeyType.PHONE: {
      const tail = onlyDigits(value).slice(-4)
      return `***${tail}`
    }
    case PixKeyType.RANDOM: {
      return `***${value.slice(-4)}`
    }
    default: {
      const exhaustive: never = type
      throw new Error(`Tipo de chave Pix desconhecido: ${String(exhaustive)}`)
    }
  }
}

/**
 * Fallback de `merchantCity` (EMV/BR Code, máx. 15 chars) quando o recebedor (organizador
 * OU participante, conforme o fluxo) não preencheu `User.city` (migration
 * `20260803T2_user_block_and_city` — o gap de schema que motivava um valor fixo aqui foi
 * fechado; ver `pool.ts`, `payments.pixPayload`/`payout.pixPayload`, que agora usam
 * `user.city ?? DEFAULT_MERCHANT_CITY`). Bancos recebedores não validam este campo contra
 * um cadastro (é só exibido no app de quem paga), então nunca bloqueia o Pix — mas ainda é
 * cosmeticamente errado mostrar "SAO PAULO" pra quem preencheu a cidade de verdade.
 */
export const DEFAULT_MERCHANT_CITY = 'SAO PAULO'

/**
 * `txid` do EMV: alfanumérico, máx. 25 chars (`PixPayloadInput.txid`). Determinístico a
 * partir do par (bolão, participante) — o mesmo participante gera sempre o mesmo txid
 * para o mesmo bolão, o que ajuda a reconciliar manualmente do lado do organizador.
 */
export function buildPixTxid(poolId: string, memberId: string): string {
  const raw = `${poolId}${memberId}`.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const txid = raw.slice(-25)
  return txid.length > 0 ? txid : 'LOTOPRO'
}

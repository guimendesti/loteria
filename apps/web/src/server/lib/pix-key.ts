/**
 * Normalização de chave Pix NA FRONTEIRA de leitura — entre a chave decifrada gravada por
 * `server/routers/account.ts` (`pixKeyRouter.set`) e `buildPixPayload` (`@lotopro/core`,
 * `packages/core/src/pool/pix.ts`), que valida a chave contra um formato estrito por tipo:
 *
 *   PHONE  → `^\+55\d{10,11}$`  (E.164 brasileiro, ex.: "+5511999999999")
 *   RANDOM → UUID v4 com hífens (regex é case-insensitive no core, mas normalizamos aqui
 *            mesmo assim — decisão do contrato, Addendum v2 §2: "UUID → minúsculas")
 *   CPF/CNPJ → só dígitos
 *   EMAIL  → já sai minúsculo de `account.ts`; normalizamos de novo por defesa em profundidade
 *
 * ⚠️ Bug real que motivou este módulo: `account.ts#validatePixKeyValue` grava chave de
 * telefone como DÍGITOS SOLTOS (ex.: "11999998888", sem "+55") — formato que o core sempre
 * rejeitou. Qualquer organizador com chave de telefone tinha (tem, até este arquivo) o Pix
 * do bolão falhando em runtime, sem aviso nenhum, porque nada normalizava a chave entre a
 * gravação (frouxa) e o consumo (estrito). Chave aleatória (`RANDOM`) tem o mesmo problema
 * em potencial: `account.ts` só valida um intervalo de tamanho (8–77 chars), não o formato
 * UUID que o core exige.
 *
 * Este módulo NÃO GRAVA nada — `account.ts` é território de outro agente nesta onda (ver
 * relatório desta tarefa: a gravação em si também deveria normalizar, mas corrigir isso
 * aqui, na leitura, já destrava a feature para quem já tem uma chave salva no formato
 * antigo, sem precisar de migração de dados).
 */
import { PixKeyType } from '@lotopro/db'

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Normaliza uma chave Pix JÁ DECIFRADA para o formato que `buildPixPayload` exige.
 * Idempotente: normalizar um valor que já está no formato certo é no-op. Nunca lança —
 * se a entrada estiver fora de qualquer forma reconhecível, devolve o melhor palpite
 * (dígitos, minúsculas) e deixa `buildPixPayload` (que já sabe validar e explicar por
 * tipo) rejeitar com sua própria mensagem; o chamador decide como traduzir esse erro
 * (ver `server/routers/pool.ts`, procedures `payments.pixPayload`/`payout.pixPayload`).
 */
export function normalizePixKeyForPayload(type: PixKeyType, rawValue: string): string {
  const trimmed = rawValue.trim()
  switch (type) {
    case PixKeyType.CPF:
    case PixKeyType.CNPJ:
      return onlyDigits(trimmed)

    case PixKeyType.EMAIL:
      return trimmed.toLowerCase()

    case PixKeyType.PHONE: {
      const digits = onlyDigits(trimmed)
      // Já vem com código do país (55 + DDD + número: 12 ou 13 dígitos) → só falta o "+".
      if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
        return `+${digits}`
      }
      // Formato hoje gravado por `account.ts`: DDD + número, sem código do país
      // (10 dígitos = fixo, 11 = celular com o 9º dígito) → prefixa "+55".
      if (digits.length === 10 || digits.length === 11) {
        return `+55${digits}`
      }
      // Comprimento fora do esperado: devolve só os dígitos: não inventamos nada, e
      // `buildPixPayload` rejeita com sua própria mensagem de validação.
      return digits
    }

    case PixKeyType.RANDOM:
      return trimmed.toLowerCase()

    default: {
      const exhaustive: never = type
      throw new Error(`Tipo de chave Pix desconhecido: ${String(exhaustive)}`)
    }
  }
}

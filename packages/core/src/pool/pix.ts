/**
 * Payload Pix estático (BR Code / EMV) para cobrança P2P de bolão — docs/07 §7.6.
 *
 * ⚠️ Área de alto risco (CLAUDE.md): CRC16 + TLV aninhado. A chave embutida é SEMPRE
 * a do organizador — este módulo só monta uma string; nunca move dinheiro nem a
 * armazena. Zero float em qualquer etapa: valores em centavos e `bigint`.
 *
 * Estrutura (Manual do BR Code / Manual de Padrões para Iniciação do Pix, BCB):
 *   00 Payload Format Indicator ("01")
 *   26 Merchant Account Information (00=GUI "br.gov.bcb.pix", 01=chave)
 *   52 Merchant Category Code ("0000")
 *   53 Transaction Currency ("986" = BRL)
 *   54 Transaction Amount (decimal, ponto, sem milhar — derivado de centavos, sem float)
 *   58 Country Code ("BR")
 *   59 Merchant Name (máx. 25)
 *   60 Merchant City (máx. 15)
 *   62 Additional Data Field (05=txid)
 *   63 CRC16 ("04" + 4 hex maiúsculos, calculado sobre tudo até e incluindo "6304")
 */

import type { PixKeyKind, PixPayload, PixPayloadInput } from '../types'

const PIX_GUI = 'br.gov.bcb.pix'
const MERCHANT_NAME_MAX = 25
const MERCHANT_CITY_MAX = 15
const TXID_MAX = 25
const TXID_FALLBACK = '***'

// ─── CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, sem reflexão, xorout 0) ────

/**
 * Calcula o CRC16 no padrão exigido pelo campo 63 do EMV (CRC16/CCITT-FALSE).
 * Retorna 4 chars hex maiúsculos, com zero à esquerda se necessário.
 */
export function crc16ccitt(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// ─── TLV (ID + tamanho 2 dígitos + valor) ────────────────────────────────────

function tlv(id: string, value: string): string {
  if (value.length > 99) {
    throw new Error(`Campo EMV ${id} excede 99 caracteres (veio ${value.length}).`)
  }
  return `${id}${value.length.toString().padStart(2, '0')}${value}`
}

// ─── Sanitização de nome/cidade (ASCII, uppercase, A-Z0-9 + espaço) ──────────

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(COMBINING_DIACRITICS, '')
}

function sanitizeAsciiField(value: string, maxLength: number, fieldLabel: string): string {
  const ascii = stripDiacritics(value).toUpperCase()
  const filtered = ascii.replace(/[^A-Z0-9 ]/g, '')
  const collapsed = filtered.replace(/\s+/g, ' ').trim()
  const truncated = collapsed.slice(0, maxLength)
  if (truncated.length === 0) {
    throw new Error(`${fieldLabel} ficou vazio após sanitização; valor original: "${value}".`)
  }
  return truncated
}

// ─── txid: alfanumérico, máx. 25; vazio vira "***" ───────────────────────────

function resolveTxid(rawTxid: string): string {
  if (rawTxid.length === 0) {
    return TXID_FALLBACK
  }
  if (rawTxid.length > TXID_MAX) {
    throw new Error(`txid deve ter no máximo ${TXID_MAX} caracteres; veio ${rawTxid.length}.`)
  }
  if (!/^[A-Za-z0-9]+$/.test(rawTxid)) {
    throw new Error(`txid deve ser alfanumérico; veio "${rawTxid}".`)
  }
  return rawTxid
}

// ─── Validação da chave Pix por tipo ──────────────────────────────────────────

const KEY_VALIDATORS: Record<PixKeyKind, { test: RegExp; hint: string }> = {
  CPF: { test: /^\d{11}$/, hint: '11 dígitos numéricos' },
  CNPJ: { test: /^\d{14}$/, hint: '14 dígitos numéricos' },
  EMAIL: { test: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, hint: 'formato de e-mail válido' },
  PHONE: { test: /^\+55\d{10,11}$/, hint: 'E.164 brasileiro, ex.: +5511999999999' },
  RANDOM: {
    test: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    hint: 'UUID v4',
  },
}

function validatePixKey(key: string, keyKind: PixKeyKind): void {
  const validator = KEY_VALIDATORS[keyKind]
  if (!validator.test.test(key)) {
    // Não ecoamos a chave: ela é dado pessoal (CPF/e-mail/telefone) e mensagens de
    // erro terminam em log de servidor e, via tRPC, na tela do cliente.
    throw new Error(`Chave Pix ${keyKind} inválida: esperado ${validator.hint}.`)
  }
}

// ─── Valor monetário: bigint centavos → string EMV, sem float ────────────────

function formatAmountCents(amountCents: bigint): string {
  const reais = amountCents / 100n
  const centavos = amountCents % 100n
  return `${reais.toString()}.${centavos.toString().padStart(2, '0')}`
}

// ─── Montagem do payload ──────────────────────────────────────────────────────

/**
 * Gera o BR Code (Pix copia-e-cola) estático para a cobrança de uma cota ou de
 * um rateio. `input.key` é sempre a chave do organizador (docs/03: Pix é P2P).
 *
 * @throws em chave inválida para o `keyKind`, `amountCents` ≤ 0n, nome/cidade
 *         vazios após sanitização, ou `txid` inválido.
 */
export function buildPixPayload(input: PixPayloadInput): PixPayload {
  validatePixKey(input.key, input.keyKind)

  if (input.amountCents <= 0n) {
    throw new Error(`amountCents deve ser positivo; veio ${input.amountCents}.`)
  }

  const merchantName = sanitizeAsciiField(input.merchantName, MERCHANT_NAME_MAX, 'merchantName')
  const merchantCity = sanitizeAsciiField(input.merchantCity, MERCHANT_CITY_MAX, 'merchantCity')
  const txid = resolveTxid(input.txid)
  const amountStr = formatAmountCents(input.amountCents)

  const merchantAccountInfo = tlv('00', PIX_GUI) + tlv('01', input.key)
  const additionalData = tlv('05', txid)

  // "6304" é literal: ID ("63") + tamanho ("04") do próprio campo CRC. O CRC é
  // calculado sobre a string inteira até aqui, incluindo esse literal.
  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amountStr) +
    tlv('58', 'BR') +
    tlv('59', merchantName) +
    tlv('60', merchantCity) +
    tlv('62', additionalData) +
    '6304'

  const crc = crc16ccitt(payloadWithoutCrc)
  const emv = payloadWithoutCrc + crc

  return { emv, txid, amountCents: input.amountCents }
}

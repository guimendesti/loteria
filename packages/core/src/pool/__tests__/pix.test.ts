import { describe, expect, it } from 'vitest'
import { buildPixPayload, crc16ccitt } from '../pix'
import type { PixPayloadInput } from '../../types'

// ─── Mini-parser TLV (ID 2 dígitos + tamanho 2 dígitos + valor) para reparsear
//     o EMV gerado e confirmar que cada campo volta com o valor esperado. ─────

interface TlvField {
  id: string
  length: number
  value: string
}

function parseTlv(payload: string): TlvField[] {
  const fields: TlvField[] = []
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const lenStr = payload.slice(i + 2, i + 4)
    const length = Number(lenStr)
    if (id.length !== 2 || lenStr.length !== 2 || !/^\d{2}$/.test(lenStr)) {
      throw new Error(`TLV malformado no offset ${i}: "${payload.slice(i, i + 12)}".`)
    }
    const value = payload.slice(i + 4, i + 4 + length)
    if (value.length !== length) {
      throw new Error(
        `Campo ${id} declara tamanho ${length} mas restam só ${value.length} caracteres.`,
      )
    }
    fields.push({ id, length, value })
    i += 4 + length
  }
  return fields
}

function fieldMap(payload: string): Map<string, TlvField> {
  return new Map(parseTlv(payload).map((f) => [f.id, f]))
}

const baseInput: PixPayloadInput = {
  key: '11122233396', // CPF-shaped (11 dígitos)
  keyKind: 'CPF',
  merchantName: 'Guilherme Bolao',
  merchantCity: 'Sao Paulo',
  amountCents: 1_000n,
  txid: 'BOLAO123',
}

describe('crc16ccitt — vetores conhecidos do padrão CRC16/CCITT-FALSE', () => {
  it('vetor padrão universal: CRC16("123456789") === 0x29B1', () => {
    // poly 0x1021, init 0xFFFF, sem reflexão, xorout 0 — o "check value" oficial
    // do catálogo de CRCs para CCITT-FALSE.
    expect(crc16ccitt('123456789')).toBe('29B1')
  })

  it('vetor canônico do Manual do BR Code (BCB): payload sem valor, txid "***"', () => {
    // Exemplo oficial reproduzido a partir do Manual do BR Code do Banco Central
    // (GUI "br.gov.bcb.pix", chave aleatória de exemplo, sem campo 54, cidade
    // "BRASILIA", nome "Fulano de Tal", txid "***"). CRC publicado: 1D3D.
    const merchantAccountInfo =
      '0014br.gov.bcb.pix' + '0136123e4567-e12b-12d1-a456-426655440000'
    const payloadWithoutCrc =
      '000201' +
      `26${merchantAccountInfo.length}${merchantAccountInfo}` +
      '52040000' +
      '5303986' +
      '5802BR' +
      '5913Fulano de Tal' +
      '6008BRASILIA' +
      '62070503***' +
      '6304'
    expect(crc16ccitt(payloadWithoutCrc)).toBe('1D3D')
  })
})

describe('buildPixPayload — estrutura EMV reparseável (TLV)', () => {
  it('todos os campos de topo batem: 00, 26, 52, 53, 54, 58, 59, 60, 62, 63', () => {
    const payload = buildPixPayload(baseInput)
    const fields = fieldMap(payload.emv)

    expect(fields.get('00')?.value).toBe('01')
    expect(fields.get('52')?.value).toBe('0000')
    expect(fields.get('53')?.value).toBe('986')
    expect(fields.get('54')?.value).toBe('10.00')
    expect(fields.get('58')?.value).toBe('BR')
    expect(fields.get('59')?.value).toBe('GUILHERME BOLAO')
    expect(fields.get('60')?.value).toBe('SAO PAULO')
    expect(fields.get('63')?.length).toBe(4)

    // comprimento declarado bate com o comprimento real do valor, para cada campo
    for (const field of parseTlv(payload.emv)) {
      expect(field.value.length).toBe(field.length)
    }
  })

  it('campo 26 (merchant account info) contém GUI e chave aninhados corretamente', () => {
    const payload = buildPixPayload(baseInput)
    const top = fieldMap(payload.emv)
    const merchantAccountInfo = top.get('26')
    expect(merchantAccountInfo).toBeDefined()

    const nested = fieldMap(merchantAccountInfo!.value)
    expect(nested.get('00')?.value).toBe('br.gov.bcb.pix')
    expect(nested.get('01')?.value).toBe(baseInput.key)
  })

  it('campo 62 (additional data) contém o txid aninhado em 05', () => {
    const payload = buildPixPayload(baseInput)
    const top = fieldMap(payload.emv)
    const additionalData = top.get('62')
    expect(additionalData).toBeDefined()

    const nested = fieldMap(additionalData!.value)
    expect(nested.get('05')?.value).toBe('BOLAO123')
    expect(payload.txid).toBe('BOLAO123')
  })

  it('CRC declarado bate com o CRC recalculado sobre o payload até "6304"', () => {
    const payload = buildPixPayload(baseInput)
    const declaredCrc = payload.emv.slice(-4)
    const withoutCrc = payload.emv.slice(0, -4)
    expect(withoutCrc.endsWith('6304')).toBe(true)
    expect(crc16ccitt(withoutCrc)).toBe(declaredCrc)
    // 4 hex chars maiúsculos
    expect(declaredCrc).toMatch(/^[0-9A-F]{4}$/)
  })

  it('payload retornado bate com amountCents de entrada', () => {
    const payload = buildPixPayload(baseInput)
    expect(payload.amountCents).toBe(1_000n)
  })
})

describe('buildPixPayload — valores monetários (bigint, sem float)', () => {
  it.each([
    { label: 'R$ 0,01', cents: 1n, expected: '0.01' },
    { label: 'R$ 10,00', cents: 1_000n, expected: '10.00' },
    { label: 'R$ 1.234,56', cents: 123_456n, expected: '1234.56' },
    { label: 'valor grande > R$ 100.000', cents: 123_456_789n, expected: '1234567.89' },
  ])('$label → campo 54 = "$expected", sem notação científica nem separador de milhar', ({ cents, expected }) => {
    const payload = buildPixPayload({ ...baseInput, amountCents: cents })
    const fields = fieldMap(payload.emv)
    const amountValue = fields.get('54')?.value
    expect(amountValue).toBe(expected)
    expect(amountValue).not.toMatch(/[eE]/) // sem notação científica
    expect(amountValue).not.toMatch(/,/) // sem separador de milhar
    expect(amountValue?.split('.')[1]).toHaveLength(2) // sempre 2 casas decimais
  })

  it('rejeita amountCents zero ou negativo', () => {
    expect(() => buildPixPayload({ ...baseInput, amountCents: 0n })).toThrow(/amountCents/)
    expect(() => buildPixPayload({ ...baseInput, amountCents: -100n })).toThrow(/amountCents/)
  })
})

describe('buildPixPayload — sanitização de nome/cidade', () => {
  it('remove acentos e cedilha, força uppercase ("João Conceição")', () => {
    const payload = buildPixPayload({ ...baseInput, merchantName: 'João Conceição' })
    const fields = fieldMap(payload.emv)
    expect(fields.get('59')?.value).toBe('JOAO CONCEICAO')
  })

  it('trunca cidade sanitizada no limite de 15 caracteres', () => {
    const payload = buildPixPayload({ ...baseInput, merchantCity: 'Rio de Janeiro Zona Sul' })
    const fields = fieldMap(payload.emv)
    const city = fields.get('60')?.value
    expect(city).toBe('RIO DE JANEIRO ')
    expect(city?.length).toBe(15)
  })

  it('trunca nome sanitizado no limite de 25 caracteres', () => {
    const payload = buildPixPayload({
      ...baseInput,
      merchantName: 'Associação dos Apostadores Unidos do Bolão',
    })
    const fields = fieldMap(payload.emv)
    const name = fields.get('59')?.value
    expect(name).toBe('ASSOCIACAO DOS APOSTADORE')
    expect(name?.length).toBe(25)
  })

  it('nome vazio após sanitização (só símbolos) rejeita com erro', () => {
    expect(() => buildPixPayload({ ...baseInput, merchantName: '!!!###' })).toThrow(/merchantName/)
  })

  it('cidade vazia após sanitização rejeita com erro', () => {
    expect(() => buildPixPayload({ ...baseInput, merchantCity: '@@@' })).toThrow(/merchantCity/)
  })
})

describe('buildPixPayload — txid', () => {
  it('txid vazio vira "***"', () => {
    const payload = buildPixPayload({ ...baseInput, txid: '' })
    expect(payload.txid).toBe('***')
    const fields = fieldMap(payload.emv)
    const additionalData = fields.get('62')
    const nested = fieldMap(additionalData!.value)
    expect(nested.get('05')?.value).toBe('***')
  })

  it('txid alfanumérico até 25 chars é preservado', () => {
    const txid = 'A1B2C3D4E5F6G7H8I9J0K1L2M'
    expect(txid.length).toBe(25)
    const payload = buildPixPayload({ ...baseInput, txid })
    expect(payload.txid).toBe(txid)
  })

  it('rejeita txid maior que 25 chars', () => {
    expect(() => buildPixPayload({ ...baseInput, txid: 'A'.repeat(26) })).toThrow(/txid/)
  })

  it('rejeita txid com caracteres não alfanuméricos', () => {
    expect(() => buildPixPayload({ ...baseInput, txid: 'bolao-123' })).toThrow(/txid/)
    expect(() => buildPixPayload({ ...baseInput, txid: 'bolao 123' })).toThrow(/txid/)
  })
})

describe('buildPixPayload — validação de chave por keyKind', () => {
  it('CPF válido (11 dígitos) constrói payload; inválido rejeita', () => {
    expect(() => buildPixPayload({ ...baseInput, key: '11122233396', keyKind: 'CPF' })).not.toThrow()
    expect(() => buildPixPayload({ ...baseInput, key: '123', keyKind: 'CPF' })).toThrow(/CPF/)
    expect(() =>
      buildPixPayload({ ...baseInput, key: '1112223339a', keyKind: 'CPF' }),
    ).toThrow(/CPF/)
  })

  it('CNPJ válido (14 dígitos) constrói payload; inválido rejeita', () => {
    expect(() =>
      buildPixPayload({ ...baseInput, key: '11222333000181', keyKind: 'CNPJ' }),
    ).not.toThrow()
    expect(() => buildPixPayload({ ...baseInput, key: '123', keyKind: 'CNPJ' })).toThrow(/CNPJ/)
  })

  it('EMAIL válido constrói payload; inválido rejeita', () => {
    expect(() =>
      buildPixPayload({ ...baseInput, key: 'organizador@example.com', keyKind: 'EMAIL' }),
    ).not.toThrow()
    expect(() =>
      buildPixPayload({ ...baseInput, key: 'nao-e-email', keyKind: 'EMAIL' }),
    ).toThrow(/EMAIL/)
  })

  it('PHONE válido em E.164 (+55) constrói payload; inválido rejeita', () => {
    expect(() =>
      buildPixPayload({ ...baseInput, key: '+5511999999999', keyKind: 'PHONE' }),
    ).not.toThrow()
    expect(() =>
      buildPixPayload({ ...baseInput, key: '11999999999', keyKind: 'PHONE' }),
    ).toThrow(/PHONE/)
    expect(() => buildPixPayload({ ...baseInput, key: '+55123', keyKind: 'PHONE' })).toThrow(
      /PHONE/,
    )
  })

  it('RANDOM válido (UUID v4) constrói payload; inválido rejeita', () => {
    expect(() =>
      buildPixPayload({
        ...baseInput,
        key: '123e4567-e89b-42d3-a456-426655440000',
        keyKind: 'RANDOM',
      }),
    ).not.toThrow()
    expect(() =>
      buildPixPayload({ ...baseInput, key: 'nao-e-uuid', keyKind: 'RANDOM' }),
    ).toThrow(/RANDOM/)
    // UUID v1 (versão errada) também deve ser rejeitado como chave aleatória Pix
    expect(() =>
      buildPixPayload({
        ...baseInput,
        key: '123e4567-e89b-11d1-a456-426655440000',
        keyKind: 'RANDOM',
      }),
    ).toThrow(/RANDOM/)
  })
})

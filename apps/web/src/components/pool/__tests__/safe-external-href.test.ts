import { describe, expect, it } from 'vitest'
import { safeExternalHref } from '../safe-external-href'

describe('safeExternalHref', () => {
  it('aceita URL http(s) absoluta', () => {
    expect(safeExternalHref('https://exemplo.com/comprovante.pdf')).toBe('https://exemplo.com/comprovante.pdf')
    expect(safeExternalHref('http://exemplo.com')).toBe('http://exemplo.com/')
  })

  it('aceita esquema em maiúsculo (normalizado pelo parser)', () => {
    expect(safeExternalHref('HTTPS://exemplo.com')).toBe('https://exemplo.com/')
  })

  it('aceita com espaços nas pontas (texto colado de app de mensagem)', () => {
    expect(safeExternalHref('  https://exemplo.com  ')).toBe('https://exemplo.com/')
  })

  it('rejeita javascript: (XSS armazenado)', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeNull()
    expect(safeExternalHref('JaVaScRiPt:alert(1)')).toBeNull()
  })

  it('rejeita data:', () => {
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejeita vbscript: e blob:', () => {
    expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull()
    expect(safeExternalHref('blob:https://exemplo.com/uuid')).toBeNull()
  })

  it('rejeita esquema relativo / caminho sem protocolo', () => {
    expect(safeExternalHref('/comprovante.pdf')).toBeNull()
    expect(safeExternalHref('//evil.com')).toBeNull()
    expect(safeExternalHref('exemplo.com/comprovante')).toBeNull()
  })

  it('rejeita string vazia, só espaço, ou lixo não parseável', () => {
    expect(safeExternalHref('')).toBeNull()
    expect(safeExternalHref('   ')).toBeNull()
    expect(safeExternalHref('não é um link')).toBeNull()
  })

  it('rejeita null/undefined', () => {
    expect(safeExternalHref(null)).toBeNull()
    expect(safeExternalHref(undefined)).toBeNull()
  })
})

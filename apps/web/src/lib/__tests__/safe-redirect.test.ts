import { describe, expect, it } from 'vitest'
import { sanitizeCallbackURL } from '../safe-redirect'

describe('sanitizeCallbackURL', () => {
  it('aceita um caminho relativo interno normal', () => {
    expect(sanitizeCallbackURL('/j/abc123')).toBe('/j/abc123')
    expect(sanitizeCallbackURL('/app/boloes/pool-1')).toBe('/app/boloes/pool-1')
  })

  it('aceita caminho com query string/hash', () => {
    expect(sanitizeCallbackURL('/j/abc123?foo=bar')).toBe('/j/abc123?foo=bar')
  })

  it('rejeita ausência/vazio', () => {
    expect(sanitizeCallbackURL(null)).toBeNull()
    expect(sanitizeCallbackURL(undefined)).toBeNull()
    expect(sanitizeCallbackURL('')).toBeNull()
  })

  it('rejeita URL absoluta (não começa com "/")', () => {
    expect(sanitizeCallbackURL('https://evil.com')).toBeNull()
    expect(sanitizeCallbackURL('evil.com')).toBeNull()
    expect(sanitizeCallbackURL('javascript:alert(1)')).toBeNull()
  })

  it('rejeita protocol-relative ("//host") — open redirect (CWE-601)', () => {
    expect(sanitizeCallbackURL('//evil.com')).toBeNull()
    expect(sanitizeCallbackURL('///evil.com')).toBeNull()
  })

  it('rejeita a variante barra-invertida ("/\\\\host")', () => {
    expect(sanitizeCallbackURL('/\\evil.com')).toBeNull()
  })

  it('rejeita quebra de linha embutida', () => {
    expect(sanitizeCallbackURL('/j/abc\nSet-Cookie: x=1')).toBeNull()
  })

  it('rejeita string absurdamente longa (defesa em profundidade)', () => {
    expect(sanitizeCallbackURL(`/${'a'.repeat(3000)}`)).toBeNull()
  })

  /**
   * ★ Regressão de segurança (achado de auditoria, severidade alta): a versão antiga só
   * testava `/[\r\n]/`, então um TAB (code point 9) embutido passava por todos os checks —
   * o parser de URL do navegador remove TAB/LF/CR de QUALQUER LUGAR da string (spec
   * WHATWG) DEPOIS que esta função já tinha aprovado o valor, então `"/\t/evil.com"`
   * (o que `searchParams.get('callbackURL')` devolve para `?callbackURL=/%09/evil.com`)
   * virava `//evil.com` só no destino final — CWE-601. Prova que o TAB sozinho, sem
   * nenhum outro caractere "suspeito", já é motivo de rejeição.
   */
  it('rejeita TAB embutido — bypass confirmado do auditor (/%09/evil.com decodifica para isto)', () => {
    expect(sanitizeCallbackURL('/\t/evil.com')).toBeNull()
    expect(sanitizeCallbackURL('/j/abc\tdef')).toBeNull()
    // TAB no meio de um caminho aparentemente inofensivo também é rejeitado — não é só o
    // caso específico "TAB logo após a barra inicial" que importa.
    expect(sanitizeCallbackURL('/app\t/evil.com')).toBeNull()
  })

  it('rejeita toda a faixa de controle ASCII (C0: 0x00–0x1F) e DEL (0x7F), não só TAB/CR/LF', () => {
    for (let code = 0x00; code <= 0x1f; code += 1) {
      const value = `/j/${String.fromCharCode(code)}evil`
      expect(sanitizeCallbackURL(value), `code point 0x${code.toString(16)} deveria ser rejeitado`).toBeNull()
    }
    expect(sanitizeCallbackURL(`/j/${String.fromCharCode(0x7f)}evil`)).toBeNull()
  })

  it('todos os vetores já confirmados fechados pelo auditor continuam bloqueados (regressão combinada)', () => {
    expect(sanitizeCallbackURL('//evil.com')).toBeNull()
    expect(sanitizeCallbackURL('/\\evil.com')).toBeNull()
    expect(sanitizeCallbackURL('https:/\\evil.com')).toBeNull()
    expect(sanitizeCallbackURL('\\/\\/evil.com')).toBeNull()
    // Duplo encoding: o valor JÁ CHEGA decodificado uma vez por `searchParams.get`, então
    // "%2Fevil.com" cru (sem decodificar de novo) não começa com "/" e cai no guard de URL
    // absoluta — nunca vira "/evil.com" por aqui.
    expect(sanitizeCallbackURL('%2Fevil.com')).toBeNull()
    expect(sanitizeCallbackURL('%252Fevil.com')).toBeNull()
  })

  it('continua aceitando caminhos internos legítimos depois da correção (sem regressão de falso positivo)', () => {
    expect(sanitizeCallbackURL('/j/abc123')).toBe('/j/abc123')
    expect(sanitizeCallbackURL('/app/boloes/pool-1?tab=extrato')).toBe('/app/boloes/pool-1?tab=extrato')
  })
})

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
})

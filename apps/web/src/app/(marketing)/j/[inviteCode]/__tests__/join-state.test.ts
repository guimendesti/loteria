/**
 * Testes puros de `resolveJoinState` (`../join-state`). Não importa `data.ts`/`page.tsx` de
 * propósito — ver o cabeçalho de `join-state.ts` para o motivo (evitar puxar `_app.ts` e o
 * Prisma real só para testar um classificador).
 */
import { describe, expect, it } from 'vitest'
import { resolveJoinState, type JoinPreviewStateInput } from '../join-state'

function preview(overrides: Partial<JoinPreviewStateInput> = {}): JoinPreviewStateInput {
  return { status: 'OPEN', expired: false, sharesAvailable: 3, ...overrides }
}

describe('resolveJoinState', () => {
  it('OPEN, não expirado, com cotas: joinable', () => {
    expect(resolveJoinState(preview())).toBe('joinable')
  })

  it('CANCELED tem prioridade sobre qualquer outro campo', () => {
    expect(resolveJoinState(preview({ status: 'CANCELED', expired: true, sharesAvailable: 0 }))).toBe('canceled')
  })

  it('DRAFT: convite ainda não vale (CLAUDE.md — link só vale a partir de OPEN)', () => {
    expect(resolveJoinState(preview({ status: 'DRAFT' }))).toBe('draft')
  })

  it('expired=true prevalece sobre status OPEN', () => {
    expect(resolveJoinState(preview({ expired: true }))).toBe('expired')
  })

  it('CLOSED/BET_PLACED/SETTLED caem todos em "closed" (não aceita mais entradas)', () => {
    expect(resolveJoinState(preview({ status: 'CLOSED' }))).toBe('closed')
    expect(resolveJoinState(preview({ status: 'BET_PLACED' }))).toBe('closed')
    expect(resolveJoinState(preview({ status: 'SETTLED' }))).toBe('closed')
  })

  it('OPEN mas sharesAvailable = 0: full', () => {
    expect(resolveJoinState(preview({ sharesAvailable: 0 }))).toBe('full')
  })

  it('OPEN mas sharesAvailable negativo (defensivo): também full', () => {
    expect(resolveJoinState(preview({ sharesAvailable: -1 }))).toBe('full')
  })
})

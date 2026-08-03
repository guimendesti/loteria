/**
 * Erro de validação de aposta — carrega os `ValidationError[]` do core
 * (`@lotopro/core`, cada um com `code` + `message` em PT-BR) para o cliente
 * poder, além de mostrar a mensagem humana, destacar o campo específico do
 * seletor de dezenas (docs/08 §C.2, CL-12 — "validação em tempo real").
 *
 * Usado como `cause` de um `TRPCError({ code: 'BAD_REQUEST' })` nos routers;
 * `server/trpc.ts` extrai `error.cause.errors` em `errorFormatter` e expõe em
 * `shape.data.betValidationErrors` na resposta tRPC.
 */
import type { GuardResult, ValidationError } from '@lotopro/core'

export class BetValidationError extends Error {
  readonly errors: ValidationError[]

  constructor(errors: ValidationError[]) {
    super(errors.map((error) => error.message).join(' '))
    this.name = 'BetValidationError'
    this.errors = errors
  }
}

/**
 * Erro de paywall — carrega a decisão negativa de um guard de entitlements
 * (`GuardResult` de `@lotopro/core`, gates G1..G10 de docs/05 §5.4) como
 * `cause` de um `TRPCError({ code: 'FORBIDDEN' })`. `server/trpc.ts` extrai
 * `error.cause.result` em `errorFormatter` e expõe `gate`/`limit`/`current`
 * em `shape.data.paywall` — mesmo padrão de `BetValidationError`/`betValidationErrors`.
 */
export class PaywallError extends Error {
  readonly result: GuardResult

  constructor(result: GuardResult) {
    super(
      result.gate
        ? `Limite do plano atingido (gate ${result.gate}).`
        : 'Recurso não disponível no seu plano atual.',
    )
    this.name = 'PaywallError'
    this.result = result
  }
}

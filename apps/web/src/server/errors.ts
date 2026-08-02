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
import type { ValidationError } from '@lotopro/core'

export class BetValidationError extends Error {
  readonly errors: ValidationError[]

  constructor(errors: ValidationError[]) {
    super(errors.map((error) => error.message).join(' '))
    this.name = 'BetValidationError'
    this.errors = errors
  }
}

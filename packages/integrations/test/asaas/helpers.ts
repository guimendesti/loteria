import { readFileSync } from 'node:fs'
import type { AsaasFetchInitLike, AsaasFetchResponseLike } from '../../src/asaas/http'

/**
 * Carrega um payload de `test/asaas/fixtures/`.
 *
 * Os fixtures reproduzem a forma real das respostas do Asaas v3 (campos, nulos e extras
 * inclusive). **Nenhum teste desta suíte abre socket** — `fetchImpl` é sempre injetado.
 */
export function loadAsaasFixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as unknown
}

export function okResponse(body: unknown, status = 200): AsaasFetchResponseLike {
  return { ok: true, status, statusText: 'OK', json: async () => body }
}

export function errorResponse(
  status: number,
  statusText: string,
  body: unknown = {},
): AsaasFetchResponseLike {
  return { ok: false, status, statusText, json: async () => body }
}

/** Corpo não-JSON (ex.: HTML de um 502 de proxy): `json()` rejeita. */
export function nonJsonResponse(status: number, statusText: string): AsaasFetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
  }
}

/** `sleep` falso: o backoff do retry não gasta tempo real na suíte. */
export const noSleep = async (): Promise<void> => {}

export function parseBody(init: AsaasFetchInitLike): Record<string, unknown> {
  if (init.body === undefined) throw new Error('requisição sem corpo')
  return JSON.parse(init.body) as Record<string, unknown>
}

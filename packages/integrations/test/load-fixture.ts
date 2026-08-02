import { readFileSync } from 'node:fs'

/**
 * Carrega um payload gravado de `test/fixtures/`.
 *
 * Os fixtures foram capturados da API real em 02/08/2026 e congelados aqui — nenhum
 * teste desta suíte toca a rede.
 */
export function loadFixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as unknown
}

/**
 * URL base pública do site — usada por `sitemap.ts`, `robots.ts` e pelos blocos
 * JSON-LD das páginas de resultados (LP-07) para montar URLs absolutas.
 *
 * TODO: não existe uma env var dedicada (`NEXT_PUBLIC_SITE_URL`) no monorepo ainda
 * (ver apps/web/.env.example) — reaproveitamos `BETTER_AUTH_URL`, que já é a URL
 * base da aplicação (`http://localhost:3000` em dev, o domínio de produção depois).
 * Trocar por uma env var própria se algum dia divergirem (ex.: multi-domínio).
 */
export const SITE_URL = (process.env.BETTER_AUTH_URL ?? 'https://lotopro.com.br').replace(/\/+$/, '')

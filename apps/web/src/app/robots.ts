import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/app/(marketing)/lib/site'

/**
 * `robots.txt` — libera todo o site público `(marketing)` para indexação
 * (é o motor de SEO, docs/08 §A.4) e bloqueia as áreas autenticadas/internas
 * ((app) painel do cliente, (admin) backoffice, rotas de API), que não têm
 * conteúdo indexável e não devem aparecer em buscas.
 *
 * ⚠️ `revalidate` é obrigatório aqui. `SITE_URL` vem de `BETTER_AUTH_URL`, que só
 * existe em RUNTIME (o compose injeta no container; o build não recebe). Sem
 * revalidação este arquivo é assado no build com o domínio de fallback e serve
 * para sempre um `Sitemap:` apontando para o domínio errado — os buscadores são
 * mandados para outro host e nunca se corrige sozinho. `sitemap.ts` já tinha
 * `revalidate = 3600` e por isso se recuperou na primeira revalidação.
 */
export const revalidate = 3600
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/admin', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}

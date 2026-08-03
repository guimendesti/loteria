import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/app/(marketing)/lib/site'

/**
 * `robots.txt` — libera todo o site público `(marketing)` para indexação
 * (é o motor de SEO, docs/08 §A.4) e bloqueia as áreas autenticadas/internas
 * ((app) painel do cliente, (admin) backoffice, rotas de API), que não têm
 * conteúdo indexável e não devem aparecer em buscas.
 */
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

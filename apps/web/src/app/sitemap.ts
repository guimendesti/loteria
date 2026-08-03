import type { MetadataRoute } from 'next'
import { ALL_LOTTERIES } from '@lotopro/core'
import { prisma } from '@lotopro/db'
import { SITE_URL } from '@/app/(marketing)/lib/site'

/**
 * Sitemap dinâmico (docs/08 §A.4: "Sitemap | sitemap.xml dinâmico, atualizado a
 * cada concurso"). Inclui as páginas estáticas públicas + as 11 páginas de
 * resultados (LP-07) + as 11 páginas do conferidor público (LP-08) — as duas
 * rotas dinâmicas por modalidade que existem em `(marketing)`.
 *
 * `lastModified` das páginas de resultado/conferidor usa a data do concurso
 * mais recente de cada modalidade quando disponível (sinaliza ao crawler que o
 * conteúdo mudou a cada sorteio); se o banco não responder no momento da
 * geração, cai no fallback `now` em vez de quebrar o sitemap inteiro.
 */
export const revalidate = 3600

const STATIC_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'daily' as const },
  { path: '/planos', priority: 0.8, changeFrequency: 'weekly' as const },
  { path: '/recursos', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/recursos/bolao', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/faq', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/jogo-responsavel', priority: 0.3, changeFrequency: 'monthly' as const },
  { path: '/termos', priority: 0.2, changeFrequency: 'yearly' as const },
  { path: '/privacidade', priority: 0.2, changeFrequency: 'yearly' as const },
  { path: '/contato', priority: 0.3, changeFrequency: 'monthly' as const },
]

async function latestDrawDateByLottery(): Promise<Map<string, Date>> {
  const map = new Map<string, Date>()
  try {
    const lotteries = await prisma.lottery.findMany({ select: { id: true, slug: true } })
    await Promise.all(
      lotteries.map(async (lottery) => {
        const contest = await prisma.contest.findFirst({
          where: { lotteryId: lottery.id },
          orderBy: { number: 'desc' },
          select: { drawDate: true },
        })
        if (contest) map.set(lottery.slug, contest.drawDate)
      }),
    )
  } catch {
    // Banco indisponível no momento da geração do sitemap: segue com o fallback `now`
    // em vez de derrubar o sitemap inteiro (todas as outras URLs continuam válidas).
  }
  return map
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const lastModifiedByLottery = await latestDrawDateByLottery()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const resultsEntries: MetadataRoute.Sitemap = ALL_LOTTERIES.map((lottery) => ({
    url: `${SITE_URL}/resultados/${lottery.slug}`,
    lastModified: lastModifiedByLottery.get(lottery.slug) ?? now,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  const checkerEntries: MetadataRoute.Sitemap = ALL_LOTTERIES.map((lottery) => ({
    url: `${SITE_URL}/conferir/${lottery.slug}`,
    lastModified: lastModifiedByLottery.get(lottery.slug) ?? now,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [...staticEntries, ...resultsEntries, ...checkerEntries]
}

/**
 * Smoke de sincronização (P1 — ORQUESTRACAO.md): roda o job de sync UMA vez,
 * contra a API real da Caixa e o Postgres local, sem BullMQ/Redis.
 * Uso:  DATABASE_URL=... pnpm -F @lotopro/worker exec tsx src/scripts/smoke-sync.ts
 */
import { prisma } from '@lotopro/db'
import {
  CaixaOfficialProvider,
  CaixaMirrorProvider,
  ResilientResultProvider,
} from '@lotopro/integrations'
import { createSyncResultsJob } from '../jobs/sync-results'
import { createSyncResultsPrismaAdapter } from '../lib/prisma-adapters'

async function main() {
  const enqueued: unknown[] = []
  const run = createSyncResultsJob({
    prisma: createSyncResultsPrismaAdapter(prisma),
    // Mesma cadeia do bootstrap (index.ts): oficial primeiro, espelho como
    // fallback. Sem isso o smoke não reproduz o comportamento de produção — foi
    // o que mascarou o 403 da API oficial no primeiro deploy.
    provider: new ResilientResultProvider(new CaixaOfficialProvider(), [new CaixaMirrorProvider()], {
      logger: (event) => {
        if (event.type === 'provider_failed') console.warn('  fallback:', event.provider, 'falhou')
      },
    }),
    checkBetsQueue: {
      add: async (_name: string, payload: unknown) => {
        enqueued.push(payload)
      },
    },
    logger: { debug: () => {}, info: () => {}, warn: console.warn, error: console.error },
  })

  const summary = await run()

  console.log('--- SMOKE SYNC ---')
  console.log('attempted :', summary.attempted.join(', '))
  console.log('new       :', summary.newContests.map((c) => `${c.lotterySlug}#${c.contestNumber}`).join(', ') || '(nenhum)')
  console.log('unchanged :', summary.unchanged.join(', ') || '(nenhum)')
  for (const e of summary.errors) console.log('ERROR     :', e.lotterySlug, '→', e.error)
  console.log('check-bets enfileirados (fake):', enqueued.length)

  const total = await prisma.contest.count()
  const sample = await prisma.contest.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { lottery: { select: { slug: true } }, prizes: true },
  })
  console.log('contests no banco:', total)
  if (sample) {
    console.log(
      `último: ${sample.lottery.slug} #${sample.number} ${sample.drawDate.toISOString().slice(0, 10)} dezenas=[${sample.numbers.join(',')}] faixas=${sample.prizes.length}`,
    )
  }
  await prisma.$disconnect()
  if (summary.errors.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

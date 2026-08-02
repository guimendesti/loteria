/**
 * Seed idempotente do LotoPro (docs/07-modelo-de-dados.md §7.11).
 *
 * Popula:
 *  - tenant "platform" (tenant padrão, multi-tenant desde o dia 1 — decisão M5)
 *  - os 4 planos (free/premium/pro/whitelabel) com entitlements (docs/05 §5.2)
 *  - as 11 modalidades com config completa (docs/09 §9.2 para os color tokens)
 *  - price_tiers 2026 (aposta simples de cada modalidade, vigentes desde 2025-07-01)
 *  - prize_tiers das 9 modalidades de dezenas priorizadas para o MVP (docs/12 Q9)
 *
 * `contests` (backfill histórico) e `closure_matrices` (biblioteca inicial) NÃO fazem parte
 * deste seed — são jobs separados (ver docs/06-arquitetura-tecnica.md e docs/07 §7.11).
 *
 * Idempotência:
 *  - tenant / plan / lottery têm `slug` único → `upsert`.
 *  - prize_tier tem `@@unique([lotteryId, tier])` → `upsert`.
 *  - price_tier NÃO tem unique constraint em (lotteryId, picks, validFrom) — o modelo é
 *    proposital-mente "append-only" (M9: reajuste = fecha validUntil do atual + insere um novo).
 *    Para poder rodar o seed várias vezes sem duplicar, apagamos e recriamos apenas as linhas
 *    com o `validFrom` exato deste seed antes de inserir — nunca tocamos em vigências diferentes.
 *
 * Uso: `pnpm -F @lotopro/db seed` (requer DATABASE_URL — ver src/README.md).
 */
import { Prisma } from '@prisma/client'
import { prisma } from './index'
import { lotteries } from './seed-data/lotteries'
import { plans, type PlanEntitlementsJson } from './seed-data/plans'
import { priceTiers, PRICE_TIERS_VALID_FROM } from './seed-data/price-tiers'
import { prizeTiers } from './seed-data/prize-tiers'
import type { LotterySlug } from './seed-data/types'

async function seedTenant() {
  await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: { name: 'LotoPro', isActive: true },
    create: { slug: 'platform', name: 'LotoPro' },
  })
  console.log('  tenant "platform" ok')
}

async function seedPlans() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        entitlements: plan.entitlements as unknown as PlanEntitlementsJson,
        isPublic: plan.isPublic,
        displayOrder: plan.displayOrder,
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        entitlements: plan.entitlements as unknown as PlanEntitlementsJson,
        isPublic: plan.isPublic,
        displayOrder: plan.displayOrder,
      },
    })
  }
  console.log(`  ${plans.length} planos ok`)
}

async function seedLotteries(): Promise<Map<LotterySlug, string>> {
  const idBySlug = new Map<LotterySlug, string>()

  for (const [index, lottery] of lotteries.entries()) {
    const displayOrder = index + 1
    const row = await prisma.lottery.upsert({
      where: { slug: lottery.slug },
      update: {
        name: lottery.name,
        caixaApiSlug: lottery.caixaApiSlug,
        format: lottery.format,
        universeMin: lottery.universeMin,
        universeMax: lottery.universeMax,
        picksMin: lottery.picksMin,
        picksMax: lottery.picksMax,
        drawsPerContest: lottery.drawsPerContest,
        extraField: lottery.extraField === null ? Prisma.JsonNull : (lottery.extraField as Prisma.InputJsonValue),
        drawSchedule: lottery.drawSchedule as unknown as Prisma.InputJsonValue,
        colorToken: lottery.colorToken,
        displayOrder,
      },
      create: {
        slug: lottery.slug,
        name: lottery.name,
        caixaApiSlug: lottery.caixaApiSlug,
        format: lottery.format,
        universeMin: lottery.universeMin,
        universeMax: lottery.universeMax,
        picksMin: lottery.picksMin,
        picksMax: lottery.picksMax,
        drawsPerContest: lottery.drawsPerContest,
        extraField: lottery.extraField === null ? Prisma.JsonNull : (lottery.extraField as Prisma.InputJsonValue),
        drawSchedule: lottery.drawSchedule as unknown as Prisma.InputJsonValue,
        colorToken: lottery.colorToken,
        displayOrder,
      },
    })
    idBySlug.set(lottery.slug, row.id)
  }

  console.log(`  ${lotteries.length} modalidades ok`)
  return idBySlug
}

async function seedPriceTiers(idBySlug: Map<LotterySlug, string>) {
  for (const tier of priceTiers) {
    const lotteryId = idBySlug.get(tier.lotterySlug)
    if (!lotteryId) throw new Error(`priceTiers: modalidade desconhecida "${tier.lotterySlug}"`)

    // Append-only (M9): remove só a vigência deste seed antes de recriar, para permanecer idempotente
    // sem afetar histórico de outras vigências.
    await prisma.priceTier.deleteMany({
      where: { lotteryId, validFrom: PRICE_TIERS_VALID_FROM },
    })
    await prisma.priceTier.create({
      data: {
        lotteryId,
        picks: tier.picks,
        extraPicks: tier.extraPicks,
        priceCents: tier.priceCents,
        validFrom: PRICE_TIERS_VALID_FROM,
      },
    })
  }
  console.log(`  ${priceTiers.length} price_tiers ok (validFrom ${PRICE_TIERS_VALID_FROM.toISOString()})`)
}

async function seedPrizeTiers(idBySlug: Map<LotterySlug, string>) {
  for (const tier of prizeTiers) {
    const lotteryId = idBySlug.get(tier.lotterySlug)
    if (!lotteryId) throw new Error(`prizeTiers: modalidade desconhecida "${tier.lotterySlug}"`)

    await prisma.prizeTier.upsert({
      where: { lotteryId_tier: { lotteryId, tier: tier.tier } },
      update: {
        label: tier.label,
        hits: tier.hits,
        extraHits: tier.extraHits,
        drawIndex: tier.drawIndex,
        isSpecialRule: tier.isSpecialRule,
      },
      create: {
        lotteryId,
        tier: tier.tier,
        label: tier.label,
        hits: tier.hits,
        extraHits: tier.extraHits,
        drawIndex: tier.drawIndex,
        isSpecialRule: tier.isSpecialRule,
      },
    })
  }
  console.log(`  ${prizeTiers.length} prize_tiers ok`)
}

async function main() {
  console.log('Seed LotoPro')

  console.log('- tenant')
  await seedTenant()

  console.log('- plans')
  await seedPlans()

  console.log('- lotteries')
  const idBySlug = await seedLotteries()

  console.log('- price_tiers')
  await seedPriceTiers(idBySlug)

  console.log('- prize_tiers')
  await seedPrizeTiers(idBySlug)

  console.log('Seed concluído.')
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

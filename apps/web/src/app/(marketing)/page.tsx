import { FaqSection } from '@/app/(marketing)/components/FaqSection'
import { FeaturesGrid } from '@/app/(marketing)/components/FeaturesGrid'
import { Hero } from '@/app/(marketing)/components/Hero'
import { HowItWorks } from '@/app/(marketing)/components/HowItWorks'
import { LiveResults } from '@/app/(marketing)/components/LiveResults'
import { PainPoints } from '@/app/(marketing)/components/PainPoints'
import { PlansSummary } from '@/app/(marketing)/components/PlansSummary'
import { PoolManagerHighlight } from '@/app/(marketing)/components/PoolManagerHighlight'

/**
 * LP-01 — Home (docs/08 §A.2/§A.3). 9 seções na ordem do doc; a 9ª (rodapé)
 * é renderizada pelo layout de (marketing), compartilhada por todas as
 * páginas públicas. Renderização "SSG + ISR" (docs/08 §A.2): a seção
 * "Resultados ao vivo" lê o banco (ver LiveResults.tsx), então a página
 * revalida a cada 5 min em vez de ser puramente estática.
 */
export const revalidate = 300

export default function HomePage() {
  return (
    <>
      <Hero />
      <PainPoints />
      <HowItWorks />
      <PoolManagerHighlight />
      <FeaturesGrid />
      <LiveResults />
      <PlansSummary />
      <FaqSection />
    </>
  )
}

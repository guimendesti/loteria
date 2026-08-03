import type { Metadata } from 'next'
import { prisma } from '@lotopro/db'

export const metadata: Metadata = {
  title: 'Status',
  description: 'Status de atualização dos resultados de loterias no LotoPro.',
}

export const revalidate = 60

interface LotteryStatus {
  name: string
  slug: string
  lastUpdated: Date | null
  lastUpdatedMinutesAgo: number | null
  status: 'green' | 'yellow' | 'red'
}

/**
 * LP-15 — Página de status de resultados.
 * Consulta diretamente o Prisma para evitar latência de rota tRPC.
 * Tolerante a banco indisponível (para o `next build` sem DB).
 */
async function getStatusData(): Promise<LotteryStatus[] | null> {
  try {
    const now = new Date()

    // Buscar todas as modalidades ativas
    const lotteries = await prisma.lottery.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, slug: true },
    })

    const statuses: LotteryStatus[] = []

    for (const lottery of lotteries) {
      // Pegar o concurso mais recente (maior createdAt)
      const lastContest = await prisma.contest.findFirst({
        where: { lotteryId: lottery.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })

      const lastUpdated = lastContest?.createdAt ?? null
      const minutesAgo = lastUpdated ? Math.floor((now.getTime() - lastUpdated.getTime()) / 60_000) : null

      // Determinar status: verde <2h, amarelo <24h, vermelho acima
      let status: 'green' | 'yellow' | 'red' = 'red'
      if (minutesAgo !== null) {
        if (minutesAgo < 120) {
          status = 'green'
        } else if (minutesAgo < 1440) {
          status = 'yellow'
        } else {
          status = 'red'
        }
      }

      statuses.push({
        name: lottery.name,
        slug: lottery.slug,
        lastUpdated,
        lastUpdatedMinutesAgo: minutesAgo,
        status,
      })
    }

    return statuses
  } catch {
    // Retorna null se banco falhar — página será gerada sem dados
    return null
  }
}

export default async function StatusPage() {
  const statuses = await getStatusData()

  const formatTimeAgo = (minutesAgo: number): string => {
    if (minutesAgo < 1) return 'agora'
    if (minutesAgo < 60) return `há ${minutesAgo} min`
    const hoursAgo = Math.floor(minutesAgo / 60)
    if (hoursAgo < 24) return `há ${hoursAgo}h`
    const daysAgo = Math.floor(hoursAgo / 24)
    return `há ${daysAgo} dia${daysAgo > 1 ? 's' : ''}`
  }

  const statusColor = {
    green: 'bg-success-50 border-success-200 text-success-700',
    yellow: 'bg-warning-50 border-warning-200 text-warning-700',
    red: 'bg-error-50 border-error-200 text-error-700',
  }

  const statusDot = {
    green: 'bg-success-500',
    yellow: 'bg-warning-500',
    red: 'bg-error-500',
  }

  return (
    <div className="min-h-screen bg-ink-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">Status</h1>
        <p className="mt-2 text-lg text-ink-600">Última atualização de resultados por modalidade</p>

        {statuses === null ? (
          <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6 text-center text-ink-600">
            Não foi possível carregar o status. Tente novamente em alguns momentos.
          </div>
        ) : statuses.length === 0 ? (
          <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6 text-center text-ink-600">
            Nenhuma modalidade ativa encontrada.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {statuses.map((item) => (
              <div
                key={item.slug}
                className={`flex items-center justify-between rounded-lg border p-4 ${statusColor[item.status]}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${statusDot[item.status]}`} />
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    {item.lastUpdatedMinutesAgo !== null && (
                      <p className="text-sm opacity-75">
                        {formatTimeAgo(item.lastUpdatedMinutesAgo)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm opacity-75">
                  {item.status === 'green' && '✓ Atualizado'}
                  {item.status === 'yellow' && '⚠ Desatualizado'}
                  {item.status === 'red' && '✕ Crítico'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-lg border border-ink-200 bg-white p-6">
          <h2 className="font-display font-semibold text-ink-900">Legenda</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full bg-success-500" />
              <div>
                <p className="font-semibold text-success-700">Verde</p>
                <p className="text-ink-600">Resultado atualizado há menos de 2 horas</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full bg-warning-500" />
              <div>
                <p className="font-semibold text-warning-700">Amarelo</p>
                <p className="text-ink-600">Resultado atualizado há 2 a 24 horas</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full bg-error-500" />
              <div>
                <p className="font-semibold text-error-700">Vermelho</p>
                <p className="text-ink-600">Resultado desatualizado há mais de 24 horas</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** CL-01 — Dashboard: 4 cards de resumo (docs/08 §C.1). Placeholders — sem dados reais ainda. */
const CARDS = [
  { label: 'Jogos ativos', value: '—' },
  { label: 'Próximo sorteio', value: '—' },
  { label: 'Gasto do mês', value: 'R$ 0,00' },
  { label: 'Prêmios do mês', value: 'R$ 0,00' },
] as const

export default function DashboardPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-ink-200 bg-white p-5"
          >
            <p className="text-sm text-ink-600">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-400">
        Feed de últimos resultados, alerta de acumulado e bolões ativos (CL-02
        a CL-04) entram aqui — fora do escopo deste shell.
      </div>
    </div>
  )
}

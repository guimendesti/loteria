/** Seção 5 — Recursos, grid dos 10 diferenciais (docs/08 §A.3.5, docs/04 §4.3). */
const FEATURES = [
  { title: 'Bolão Manager', description: 'Gestão completa de bolões privados, por convite.' },
  { title: 'Conferência automática', description: 'Multi-concurso, com notificação assim que sair o resultado.' },
  { title: 'Fechamentos com garantia', description: 'Matrizes verificadas — custo e garantia claros antes de gerar.' },
  { title: 'Backtesting honesto', description: 'Simula uma estratégia no histórico, sem prometer método vencedor.' },
  { title: 'Scanner de volante (OCR)', description: 'Fotografe o comprovante e o jogo é cadastrado sozinho.' },
  { title: 'Carteira e ROI real', description: 'Quanto você gastou, quanto recuperou — inclusive quando é negativo.' },
  { title: 'Alertas inteligentes', description: 'Acumulado, fechamento de apostas e concursos especiais.' },
  { title: 'Impressão em formato oficial', description: 'Exporte seus jogos prontos para levar à lotérica.' },
  { title: 'Assistente de análise com IA', description: 'Perguntas sobre seu histórico, sem prever resultado.' },
  { title: 'API pessoal e White-label', description: 'Integração própria ou instância com sua marca (B2B).' },
]

export function FeaturesGrid() {
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-2xl font-bold text-ink-900">
          Recursos
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-ink-200 p-4">
              <p className="font-display font-semibold text-ink-900">{feature.title}</p>
              <p className="mt-2 text-sm text-ink-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

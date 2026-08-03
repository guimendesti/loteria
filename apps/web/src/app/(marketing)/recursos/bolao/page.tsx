import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Bolão Manager — organize seu bolão sem planilha',
  description:
    'Convite por link, Pix direto para o organizador, comprovante visível a todos e rateio automático depois do sorteio. O LotoPro nunca recebe, guarda ou repassa dinheiro de bolão.',
}

/** LP-04 — Recurso: Bolão Manager (docs/08 §A.2). Fluxo de 7 passos, docs/04 §4.3 D1. */
const FLOW_STEPS = [
  {
    title: 'Você cria o bolão',
    detail:
      'Escolhe a modalidade, os concursos, os jogos que serão apostados e o número de cotas. O LotoPro calcula sozinho o custo total, o valor de cada cota e quantas cotas ainda estão disponíveis.',
  },
  {
    title: 'Gera o convite',
    detail: 'Um link e um QR code prontos para compartilhar no WhatsApp com um toque.',
  },
  {
    title: 'Participantes entram e pagam',
    detail:
      'Cada participante escolhe quantas cotas quer e recebe um Pix copia-e-cola apontando para a sua chave. O pagamento é sempre direto para você — o LotoPro não toca no dinheiro.',
  },
  {
    title: 'Você marca quem pagou',
    detail: 'Confirmação manual de pagamento, participante por participante.',
  },
  {
    title: 'Você aposta e anexa o comprovante',
    detail:
      'Aposte nos canais oficiais da CAIXA e fotografe o comprovante. Ele fica anexado e visível para todos os participantes — fim da desconfiança sobre se o jogo foi feito.',
  },
  {
    title: 'Conferência automática',
    detail:
      'Depois do sorteio, o LotoPro confere sozinho. Se premiado, calcula o rateio proporcional por cota e mostra exatamente quanto cada participante tem a receber.',
  },
  {
    title: 'Recibo digital para todos',
    detail: 'Cada participante recebe um recibo com cotas, pagamento, jogos e rateio registrados.',
  },
]

export default function BolaoManagerPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">Recurso</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Bolão Manager
        </h1>
        <p className="mt-4 text-lg text-ink-600">
          O bolão do escritório ou da família, organizado num só lugar — sem planilha, sem cobrança
          chata por WhatsApp e sem ninguém desconfiando do rateio.
        </p>

        {/* Banner de compliance — texto de docs/08 CL-63, o mesmo exibido em toda tela de bolão do produto. */}
        <div className="mt-8 rounded-lg border border-brand-500/30 bg-brand-100 p-5">
          <p className="text-sm font-medium text-brand-900">
            O LotoPro não recebe, não guarda e não repassa valores. Os pagamentos são feitos
            diretamente entre você e o organizador. O organizador é o único responsável por
            realizar a aposta e guardar o comprovante.
          </p>
        </div>

        <h2 className="mt-12 font-display text-xl font-bold text-ink-900">Como funciona, passo a passo</h2>
        <ol className="mt-6 space-y-6">
          {FLOW_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold text-ink-900">{step.title}</p>
                <p className="mt-1 text-sm text-ink-600">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-lg border border-ink-200 bg-white p-6">
          <p className="font-display font-semibold text-ink-900">Quantos bolões cabem no seu plano?</p>
          <ul className="mt-3 space-y-1 text-sm text-ink-600">
            <li>
              <strong className="text-ink-900">Free</strong> — 1 bolão ativo, até 5 participantes.
            </li>
            <li>
              <strong className="text-ink-900">Premium</strong> — 5 bolões, até 30 participantes cada.
            </li>
            <li>
              <strong className="text-ink-900">Pro</strong> — bolões e participantes ilimitados.
            </li>
          </ul>
          <p className="mt-3 text-sm text-ink-600">
            Organizando só na Mega da Virada? Existe também o bolão avulso, sem assinatura mensal.
          </p>
          <Link href="/planos" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Ver todos os planos →
          </Link>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/cadastro"
            className="inline-block rounded-md bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Criar meu bolão grátis
          </Link>
        </div>
      </div>
    </div>
  )
}

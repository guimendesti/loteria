import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'Termos de uso do LotoPro — esqueleto para revisão jurídica antes do lançamento comercial.',
}

/**
 * LP-12 — Termos de uso (docs/08 §A.2, P0 de compliance).
 *
 * REVISÃO JURÍDICA PENDENTE — esqueleto sério, cobrindo os pontos obrigatórios de
 * docs/03-marco-legal-e-compliance.md §3.4 (declarações de não-vínculo e
 * não-intermediação, D1-D6) e §3.5 (LGPD) e o checklist de §3.8. NÃO É PARECER
 * JURÍDICO — precisa de revisão por advogado especializado em direito regulatório
 * de jogos e loterias antes do lançamento comercial (docs/03, aviso do topo).
 */
export default function TermosDeUsoPage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Marcador visível para revisão jurídica — não remover até o parecer formal (docs/03 §3.8). */}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">⚠ REVISÃO JURÍDICA PENDENTE</p>
          <p className="mt-1 text-sm text-ink-900">
            Este documento é um esqueleto técnico de produto, não um parecer jurídico. Antes do
            lançamento comercial, precisa ser revisado e validado por advogado especializado em
            direito regulatório de jogos e loterias (ver docs/03-marco-legal-e-compliance.md §3.8).
          </p>
        </div>

        <h1 className="mt-8 font-display text-3xl font-bold text-ink-900">Termos de uso</h1>
        <p className="mt-2 text-sm text-ink-400">Última atualização: a definir na publicação.</p>

        <div className="mt-8 space-y-8 text-ink-700">
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">1. O que é o LotoPro</h2>
            <p className="mt-2 leading-relaxed">
              O LotoPro é um software independente de organização, conferência e análise de apostas
              de loteria. Nossa receita é exclusivamente a assinatura do software — nunca uma
              comissão, taxa ou percentual sobre valor apostado, valor movimentado em bolão ou
              prêmios recebidos.
            </p>
            <p className="mt-2 leading-relaxed">
              <strong className="text-ink-900">O LotoPro não tem vínculo, parceria ou autorização da Caixa Econômica Federal.</strong>{' '}
              Não realizamos apostas, não vendemos cotas de bolão e não intermediamos pagamentos de
              jogos. Todas as apostas devem ser feitas nos canais oficiais da CAIXA.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">2. Elegibilidade</h2>
            <p className="mt-2 leading-relaxed">
              O uso do LotoPro é restrito a maiores de 18 anos. Ao se cadastrar, você declara ter 18
              anos ou mais. Se identificarmos um cadastro de menor de idade, a conta será excluída
              imediatamente.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">3. Natureza dos recursos oferecidos</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed">
              <li>Registro e organização de apostas que você já fez ou pretende fazer.</li>
              <li>Geração de combinações, fechamentos e desdobramentos (cálculo combinatório).</li>
              <li>Conferência de resultados contra dados públicos oficiais.</li>
              <li>Exibição de estatísticas históricas.</li>
              <li>
                Organização de bolões privados, por convite, entre pessoas que você conhece — nunca
                um bolão público ou marketplace de cotas.
              </li>
            </ul>
            <p className="mt-2 leading-relaxed">
              Nenhum desses recursos altera a probabilidade de acerto em um sorteio. Loterias são
              jogos de azar: sorteios são eventos independentes e aleatórios.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">4. Bolões — regras e responsabilidades</h2>
            <p className="mt-2 leading-relaxed">
              O LotoPro nunca recebe, guarda ou repassa valores de aposta ou de bolão. Os pagamentos
              entre participante e organizador acontecem diretamente, via Pix, usando a chave
              cadastrada pelo próprio organizador — o LotoPro apenas gera o payload de pagamento e
              registra a confirmação.
            </p>
            <p className="mt-2 leading-relaxed">
              O organizador de um bolão é sempre o único responsável por realizar a aposta nos canais
              oficiais da CAIXA, guardar o comprovante e efetuar o rateio do prêmio entre os
              participantes. Ao criar um bolão, o organizador aceita expressamente esta
              responsabilidade.
            </p>
            <p className="mt-2 leading-relaxed">
              Bolões são sempre privados, acessíveis apenas por link ou código de convite gerado pelo
              organizador. Não existe diretório público, busca ou marketplace de bolões.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">5. Assinatura e cobrança</h2>
            <p className="mt-2 leading-relaxed">
              Os planos pagos são cobrados por assinatura (mensal ou anual), via Pix Automático,
              cartão de crédito ou boleto, conforme disponibilidade. O valor da assinatura não varia
              em função de quantos jogos você cadastra, quanto aposta ou quanto ganha em prêmios.
              Você pode cancelar a qualquer momento; o cancelamento não é retroativo e sua conta
              retorna ao plano gratuito ao final do período já pago.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">6. Conta e uso aceitável</h2>
            <p className="mt-2 leading-relaxed">
              Você é responsável por manter a confidencialidade das suas credenciais de acesso e por
              todas as atividades realizadas na sua conta. É proibido usar o LotoPro para tentar
              viabilizar comercialização de cotas de bolão com caráter empresarial, contornar os
              limites de convite privado dos bolões, ou qualquer uso que viole a legislação
              aplicável.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">7. Propriedade intelectual</h2>
            <p className="mt-2 leading-relaxed">
              O software, a marca e o conteúdo do LotoPro pertencem à empresa operadora do serviço.
              Os dados dos seus jogos, bolões e conta permanecem seus — veja a nossa Política de
              Privacidade sobre como tratamos esses dados.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">8. Limitação de responsabilidade</h2>
            <p className="mt-2 leading-relaxed">
              O LotoPro se esforça para manter os resultados sincronizados corretamente, mas não
              garante disponibilidade ininterrupta nem se responsabiliza por decisões de aposta
              tomadas com base nas informações do serviço. Em caso de divergência, o resultado
              oficial da CAIXA sempre prevalece.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">9. Alterações destes termos</h2>
            <p className="mt-2 leading-relaxed">
              Podemos atualizar estes termos para refletir mudanças no serviço ou na legislação.
              Alterações relevantes serão comunicadas com antecedência razoável.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">10. Lei aplicável e contato</h2>
            <p className="mt-2 leading-relaxed">
              Estes termos são regidos pela legislação brasileira. Dúvidas podem ser enviadas pela
              nossa página de{' '}
              <a href="/contato" className="font-semibold text-brand-700 hover:underline">
                Contato
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

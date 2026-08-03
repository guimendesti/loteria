import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Política de privacidade do LotoPro (LGPD) — esqueleto para revisão jurídica antes do lançamento comercial.',
}

/**
 * LP-13 — Política de privacidade (docs/08 §A.2, P0 de compliance).
 *
 * REVISÃO JURÍDICA PENDENTE — esqueleto sério, transcrevendo linha a linha a
 * tabela de docs/03-marco-legal-e-compliance.md §3.5 (LGPD): papel de
 * controlador, bases legais, dados coletados, subprocessadores, retenção,
 * direitos do titular, DPO. NÃO É PARECER JURÍDICO — precisa de revisão por
 * advogado especializado antes do lançamento comercial (docs/03, aviso do topo,
 * e checklist §3.8: "Termos de Uso e Política de Privacidade revisados por
 * advogado").
 */
export default function PoliticaDePrivacidadePage() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Marcador visível para revisão jurídica — não remover até o parecer formal (docs/03 §3.8). */}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">⚠ REVISÃO JURÍDICA PENDENTE</p>
          <p className="mt-1 text-sm text-ink-900">
            Este documento é um esqueleto técnico de produto, não um parecer jurídico. Antes do
            lançamento comercial, precisa ser revisado e validado por advogado especializado (ver
            docs/03-marco-legal-e-compliance.md §3.5 e §3.8).
          </p>
        </div>

        <h1 className="mt-8 font-display text-3xl font-bold text-ink-900">Política de privacidade</h1>
        <p className="mt-2 text-sm text-ink-400">Última atualização: a definir na publicação.</p>

        <div className="mt-8 space-y-8 text-ink-700">
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">1. Quem é o controlador</h2>
            <p className="mt-2 leading-relaxed">
              O LotoPro é o controlador dos dados pessoais tratados neste serviço, nos termos da Lei
              nº 13.709/2018 (LGPD).
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">2. Quais dados coletamos</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed">
              <li>Nome, e-mail e, opcionalmente, telefone.</li>
              <li>Os jogos que você cadastra (dezenas, modalidade, concursos) e o histórico de conferências.</li>
              <li>Dados de bolões: participantes, cotas, e a chave Pix do organizador (criptografada em repouso).</li>
              <li>Imagens de comprovantes de aposta que você anexa (armazenamento privado, acesso por URL assinada e de curta duração).</li>
              <li>Dados de uso do produto, para operação, segurança e melhoria do serviço.</li>
            </ul>
            <p className="mt-2 leading-relaxed">
              Não coletamos dados sensíveis (saúde, biometria, etc.). CPF não é coletado no cadastro
              — só seria solicitado, no futuro, se um meio de pagamento exigir, exclusivamente no
              momento do checkout.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">3. Por que tratamos seus dados (bases legais)</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed">
              <li>
                <strong className="text-ink-900">Execução de contrato</strong> — para fornecer a conta, os
                recursos de organização de jogos e a assinatura que você contratou.
              </li>
              <li>
                <strong className="text-ink-900">Consentimento</strong> — para comunicações de marketing,
                sempre com opt-in separado e revogável a qualquer momento.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">4. Com quem compartilhamos dados</h2>
            <p className="mt-2 leading-relaxed">
              Não vendemos dados pessoais. Compartilhamos dados apenas com prestadores de serviço
              (subprocessadores) necessários para operar o LotoPro, entre eles: hospedagem e
              infraestrutura (Vercel, Neon/Supabase), processamento de pagamento de assinatura
              (Asaas), e-mail transacional (Resend), armazenamento de arquivos (Cloudflare R2),
              monitoramento e analytics (Sentry, PostHog) e, quando aplicável, provedores de IA
              (Anthropic). Alguns desses provedores podem processar dados fora do Brasil — nesses
              casos, utilizamos salvaguardas contratuais adequadas (cláusulas-padrão).
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">5. Por quanto tempo guardamos seus dados</h2>
            <p className="mt-2 leading-relaxed">
              Mantemos seus dados enquanto sua conta estiver ativa e por até 5 anos após o
              encerramento (prazo prescricional civil), após o que são anonimizados.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">6. Seus direitos</h2>
            <p className="mt-2 leading-relaxed">
              Você pode, a qualquer momento, exportar seus dados (JSON/CSV), corrigir informações
              incorretas e excluir sua conta — tudo pelo painel, em Conta e Assinatura. Ao excluir a
              conta, anonimizamos (em vez de apagar) registros vinculados a bolões de outras
              pessoas, para não corromper o histórico de terceiros.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">7. Menores de idade</h2>
            <p className="mt-2 leading-relaxed">
              O LotoPro não é destinado a menores de 18 anos. O cadastro exige declaração de
              maioridade; se identificarmos uma conta de menor de idade, ela é excluída
              imediatamente.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">8. Segurança</h2>
            <p className="mt-2 leading-relaxed">
              Chaves Pix de organizadores de bolão são criptografadas em repouso e nunca aparecem em
              logs. Imagens de comprovante ficam em armazenamento privado, acessível apenas por link
              assinado e temporário.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">9. Cookies</h2>
            <p className="mt-2 leading-relaxed">
              Usamos cookies essenciais para o funcionamento do site e, mediante seu consentimento,
              cookies de analytics. Uma Política de Cookies dedicada, com banner de consentimento,
              será publicada antes do lançamento comercial (docs/03 §3.5, item obrigatório).
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">10. Encarregado de dados (DPO)</h2>
            <p className="mt-2 leading-relaxed">
              Dúvidas sobre o tratamento dos seus dados podem ser enviadas pela nossa página de{' '}
              <a href="/contato" className="font-semibold text-brand-700 hover:underline">
                Contato
              </a>
              . O nome e o contato direto do Encarregado (DPO) serão publicados aqui antes do
              lançamento comercial.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">11. Alterações desta política</h2>
            <p className="mt-2 leading-relaxed">
              Podemos atualizar esta política para refletir mudanças no serviço ou na legislação.
              Alterações relevantes serão comunicadas com antecedência razoável.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

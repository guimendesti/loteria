/**
 * SY-04 — templates de notificação. Funções PURAS `(payload) => {subject, html, text}`,
 * uma por tipo, com os textos EXATOS de docs/09-design-system-e-ux.md §9.6 ("Notificações
 * — texto"). Regras do doc: título com no máximo 60 caracteres, sem promessa, sem urgência
 * artificial, no máximo 1 emoji — os textos abaixo são a transcrição literal da tabela, não
 * reinvente a redação aqui; se o texto mudar, muda primeiro no doc.
 *
 * `subject`/`text` alimentam tanto o e-mail quanto `Notification.title`/`Notification.body`
 * (IN_APP) — um único texto para os dois canais, textual.
 *
 * ⚠️ MELHORIA FUTURA (anotado no escopo): HTML é uma string simples montada à mão aqui.
 * Sem React Email por enquanto — trocar quando o pacote for adotado no projeto (dá layout
 * responsivo de verdade, dark mode, etc. de graça). Até lá, o HTML abaixo é deliberadamente
 * minimalista (sem imagens, sem grid) para renderizar bem em qualquer cliente de e-mail.
 */
import type {
  BetCheckedTemplatePayload,
  BetPrizedTemplatePayload,
  ContestAccumulatedTemplatePayload,
  NotificationTemplateOutput,
  PoolBetPlacedTemplatePayload,
  PoolPaymentConfirmedTemplatePayload,
  PoolPaymentDeclaredTemplatePayload,
  PoolPaymentPendingTemplatePayload,
  PoolPrizedTemplatePayload,
} from './types'

// ─── HTML/rendering helpers ────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Remove quebras de linha do assunto. Defesa em profundidade: o transporte real (API HTTP
 * JSON da Resend, `resend.ts`) já não é vulnerável a injeção de cabeçalho estilo SMTP, mas
 * um `subject` com `\n` ainda seria um valor esquisito para logar/exibir em `Notification.title`.
 */
function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function renderTemplate(rawSubject: string, bodyText: string): NotificationTemplateOutput {
  const subject = sanitizeSubject(rawSubject)
  const html = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head><meta charset="utf-8" /></head>',
    '<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">',
    `<h1 style="font-size:18px;line-height:1.3;color:#111827;margin:0 0 12px;">${escapeHtml(subject)}</h1>`,
    `<p style="font-size:14px;line-height:1.5;color:#374151;margin:0;">${escapeHtml(bodyText).replace(/\n/g, '<br />')}</p>`,
    '<p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">LotoPro</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('')
  return { subject, html, text: bodyText }
}

/**
 * Fallback genérico — NÃO é um dos textos-padrão do doc 9.6. Usado por `jobs/notify.ts`
 * quando o `type` do job não tem template dedicado (ex.: `pool.*` ainda sem job que o
 * enfileire) ou quando o payload não trouxe os campos que o template específico exige.
 * Ainda assim passa pelo mesmo `renderTemplate` (escapa HTML, sanitiza assunto).
 */
export function renderPlainTemplate(subject: string, bodyText: string): NotificationTemplateOutput {
  return renderTemplate(subject, bodyText)
}

// ─── Dinheiro → "R$ N milhões" (só para o título do alerta de acumulado) ──────

const CENTS_PER_MILLION = 100_000_000n // R$ 1.000.000,00

/**
 * Arredonda para o milhão de reais mais próximo, inteiramente em `bigint` (CLAUDE.md §5:
 * dinheiro nunca passa por `number`/float). Usado só para o título abreviado do alerta de
 * acumulado ("Mega-Sena acumulou R$ 120 milhões") — o valor exato continua disponível no
 * `payload` da notificação para quem precisar dele.
 */
export function formatMillionsBRL(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const millions = (abs + CENTS_PER_MILLION / 2n) / CENTS_PER_MILLION
  const unit = millions === 1n ? 'milhão' : 'milhões'
  return `${negative ? '-' : ''}R$ ${millions.toLocaleString('pt-BR')} ${unit}`
}

// ─── bet.prized — "Premiado" (doc 9.6, linha 1) ───────────────────────────────

export function betPrizedTemplate(payload: BetPrizedTemplatePayload): NotificationTemplateOutput {
  const subject = `🎉 Você foi premiado na ${payload.lotteryName}!`
  const text = `Acertou ${payload.hits} números no concurso ${payload.contestNumber}. Confira o valor.`
  return renderTemplate(subject, text)
}

// ─── bet.checked — "Acertos sem prêmio" / "Nenhum acerto" (doc 9.6, linhas 2 e 3) ─────
//
// As duas linhas do doc compartilham o mesmo `type` (`bet.checked` — ver
// `apps/worker/src/jobs/check-bets.ts`, que já usa esse nome para "conferido, sem prêmio"):
// o texto varia com `hits`, não o tipo da notificação.

export function betCheckedTemplate(payload: BetCheckedTemplatePayload): NotificationTemplateOutput {
  const subject = `Resultado da ${payload.lotteryName} ${payload.contestNumber}`
  if (payload.hits <= 0) {
    return renderTemplate(subject, 'Confira as dezenas sorteadas e seus jogos.')
  }
  const remaining =
    payload.remainingContests !== undefined && payload.remainingContests > 0
      ? ` Seu jogo vale mais ${payload.remainingContests} concurso${payload.remainingContests === 1 ? '' : 's'}.`
      : ''
  const text = `Você acertou ${payload.hits} número${payload.hits === 1 ? '' : 's'}.${remaining}`
  return renderTemplate(subject, text)
}

// ─── contest.accumulated — "Acumulado" (doc 9.6, linha 4) ─────────────────────

export function contestAccumulatedTemplate(payload: ContestAccumulatedTemplatePayload): NotificationTemplateOutput {
  const subject = `${payload.lotteryName} acumulou ${formatMillionsBRL(payload.estimatedNextCents)}`
  const text = `Próximo sorteio: ${payload.nextDrawLabel}.`
  return renderTemplate(subject, text)
}

// ─── pool.* — (doc 9.6, linhas "Bolão — ...") ──────────────────────────────────
//
// Onda 8 (`apps/worker/src/jobs/pool-notify.ts`) é o primeiro job a enfileirar `notify` com
// estes tipos — ver `buildEmailContent` em `apps/worker/src/jobs/notify.ts` para o mapeamento
// `type` → template. `poolPaymentPendingTemplate`/`poolBetPlacedTemplate`/`poolPrizedTemplate`
// já existiam como placeholder (textos exatos do doc); `poolPaymentDeclaredTemplate` e
// `poolPaymentConfirmedTemplate` são novos desta tarefa (sem linha própria anterior no doc —
// texto autoral no mesmo tom, adicionado à tabela).

export function poolPaymentPendingTemplate(payload: PoolPaymentPendingTemplatePayload): NotificationTemplateOutput {
  const subject = `${payload.memberName} entrou no bolão "${payload.poolName}"`
  const text = `${payload.shares} cota${payload.shares === 1 ? '' : 's'} · aguardando pagamento.`
  return renderTemplate(subject, text)
}

/** doc 9.6, linha "Bolão — pagamento declarado" — avisa o ORGANIZADOR. */
export function poolPaymentDeclaredTemplate(payload: PoolPaymentDeclaredTemplatePayload): NotificationTemplateOutput {
  const subject = `${payload.memberName} declarou pagamento no bolão "${payload.poolName}"`
  const text = 'Confirme o recebimento para liberar a cota.'
  return renderTemplate(subject, text)
}

/** doc 9.6, linha "Bolão — pagamento confirmado" — avisa o PARTICIPANTE. */
export function poolPaymentConfirmedTemplate(
  payload: PoolPaymentConfirmedTemplatePayload,
): NotificationTemplateOutput {
  const subject = `Pagamento confirmado no bolão "${payload.poolName}"`
  const text = 'Você já está garantido nessa aposta.'
  return renderTemplate(subject, text)
}

export function poolBetPlacedTemplate(payload: PoolBetPlacedTemplatePayload): NotificationTemplateOutput {
  const subject = `Bolão "${payload.poolName}" apostado ✅`
  const text = 'O comprovante já está disponível para todos.'
  return renderTemplate(subject, text)
}

export function poolPrizedTemplate(payload: PoolPrizedTemplatePayload): NotificationTemplateOutput {
  const subject = `🎉 O bolão "${payload.poolName}" foi premiado!`
  const text = `Sua parte: ${payload.memberShareText}. Veja o rateio.`
  return renderTemplate(subject, text)
}

// ─── billing.* — cobrança e mudanças de plano (P4b) ────────────────────────────
//
// `billing.payment_failed` é a linha "Cobrança falhou" do doc 9.6 — texto LITERAL, sem
// interpolação (o doc não parametriza). `billing.downgraded`/`billing.trial_ended` não têm
// linha própria no doc (só existem em `apps/worker/jobs/billing-dunning.ts`, que hoje monta
// o título/corpo à mão OUTSIDE deste pacote) — os textos abaixo seguem o MESMO tom (docs/09
// §9.6: sem promessa, sem urgência artificial, título ≤60 caracteres) e a mesma redação já
// usada por aquele job, só formalizada aqui como template reaproveitável por `notify.ts`.

export interface BillingPaymentFailedTemplatePayload {
  /**
   * Nome do plano em risco de cancelamento — o texto EXATO do doc 9.6 já embute "Premium"
   * ("... continuar no Premium"). O payload que `billing-dunning.ts` enfileira hoje
   * (`invoiceId`/`amountCents`/`daysOverdue`/`downgradeInDays`) não carrega o nome do
   * plano atual, então este campo é opcional — ausente, cai no texto literal do doc.
   */
  planName?: string
}

/** doc 9.6, linha "Cobrança falhou" — título e corpo TRANSCRITOS, não reformule. */
export function billingPaymentFailedTemplate(
  payload: BillingPaymentFailedTemplatePayload = {},
): NotificationTemplateOutput {
  const planName = payload.planName ?? 'Premium'
  const subject = 'Não conseguimos renovar sua assinatura'
  const text = `Atualize seu meio de pagamento para continuar no ${planName}.`
  return renderTemplate(subject, text)
}

export interface BillingDowngradedTemplatePayload {
  /** Plano para onde a assinatura caiu — docs/05 §5.4: downgrade nunca apaga dado. */
  targetPlanName: string
  reason: 'payment_failed' | 'canceled' | 'scheduled_downgrade'
}

const BILLING_DOWNGRADE_REASON_TEXT: Record<
  BillingDowngradedTemplatePayload['reason'],
  (planName: string) => string
> = {
  payment_failed: (planName) => `Como a cobrança não foi confirmada, seu acesso passou para o plano ${planName}.`,
  canceled: (planName) => `Seu cancelamento foi concluído e você está no plano ${planName}.`,
  scheduled_downgrade: (planName) => `A troca que você agendou foi aplicada: você está no plano ${planName}.`,
}

/**
 * Cobre os 3 motivos de downgrade que viram `type: "billing.downgraded"` em
 * `billing-dunning.ts` (`payment_failed` | `canceled` | `scheduled_downgrade` — fim de
 * trial é um `type` próprio, `billingTrialEndedTemplate` abaixo). Título neutro (sem "você
 * perdeu"), corpo sempre reforça que nenhum dado foi apagado.
 */
export function billingDowngradedTemplate(payload: BillingDowngradedTemplatePayload): NotificationTemplateOutput {
  const subject = `Seu plano agora é ${payload.targetPlanName}`
  const reasonText = BILLING_DOWNGRADE_REASON_TEXT[payload.reason](payload.targetPlanName)
  const text = `${reasonText} Nenhum dado foi apagado: seus jogos e seu histórico continuam disponíveis.`
  return renderTemplate(subject, text)
}

export interface BillingTrialEndedTemplatePayload {
  /** Plano para onde o usuário volta ao fim do trial (normalmente "Grátis"). */
  targetPlanName: string
}

export function billingTrialEndedTemplate(payload: BillingTrialEndedTemplatePayload): NotificationTemplateOutput {
  const subject = `Seu plano agora é ${payload.targetPlanName}`
  const text =
    `Seu período de teste terminou e você voltou para o plano ${payload.targetPlanName}. ` +
    'Nenhum dado foi apagado: seus jogos e seu histórico continuam disponíveis.'
  return renderTemplate(subject, text)
}

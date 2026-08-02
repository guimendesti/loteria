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

// ─── pool.* — PLACEHOLDER (doc 9.6, linhas 6–8) ───────────────────────────────
//
// Nenhum job de `apps/worker` hoje enfileira `notify` com estes tipos — bolões (SY-*
// específico de Pool) não fazem parte deste território. As funções existem prontas para
// quando esse job existir; textos já são os exatos do doc, só falta o payload real.

export function poolPaymentPendingTemplate(payload: PoolPaymentPendingTemplatePayload): NotificationTemplateOutput {
  const subject = `${payload.memberName} entrou no bolão "${payload.poolName}"`
  const text = `${payload.shares} cota${payload.shares === 1 ? '' : 's'} · aguardando pagamento.`
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

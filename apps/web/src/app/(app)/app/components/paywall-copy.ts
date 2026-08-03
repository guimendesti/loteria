import type { PaywallGate } from '@lotopro/core'
import type { PaywallPlanSlug } from './paywall-plans'

export interface PaywallCopy {
  /** O que foi bloqueado — sempre no passado/factual, nunca alarmista. */
  title: string
  /** Exatamente 3 bullets do que o plano de destino destrava (docs/09 C6). */
  bullets: readonly [string, string, string]
  plan: PaywallPlanSlug
}

/**
 * Copy dos gatilhos de paywall — docs/05 §5.4 (tabela G1–G10). Honesta por
 * princípio (docs/09 DS3 "Honestidade visual"): descreve o que o plano
 * superior destrava de fato (limites, recursos), nunca promete ganho, sorte
 * ou "método". Cada bullet é uma linha real de docs/05 §5.2.
 */
export const PAYWALL_COPY: Record<PaywallGate, PaywallCopy> = {
  G1: {
    title: 'Você atingiu o limite de jogos ativos do plano gratuito',
    bullets: [
      'Jogos ativos ilimitados',
      'Histórico completo, sem corte de 90 dias',
      'Conferência automática em todas as modalidades',
    ],
    plan: 'premium',
  },
  G2: {
    title: 'O plano gratuito conta com conferência automática em até 2 modalidades',
    bullets: [
      'Conferência automática em todas as modalidades',
      'Jogos ativos ilimitados',
      'Notificação por e-mail e push',
    ],
    plan: 'premium',
  },
  G3: {
    title: 'Esse bolão já tem o máximo de participantes do plano gratuito',
    bullets: ['Até 30 participantes por bolão', 'Recibo digital automático', 'Até 5 bolões ativos simultâneos'],
    plan: 'premium',
  },
  G4: {
    title: 'O plano gratuito permite organizar 1 bolão por vez',
    bullets: ['Até 5 bolões ativos simultâneos', 'Até 30 participantes por bolão', 'Recibo digital automático'],
    plan: 'premium',
  },
  G5: {
    title: 'Seus scans de comprovante deste mês acabaram',
    bullets: ['30 scans de comprovante por mês', 'Jogos ativos ilimitados', 'Histórico completo'],
    plan: 'premium',
  },
  G6: {
    title: 'Esse fechamento passa do limite de 16 dezenas do plano gratuito',
    bullets: [
      'Fechamentos com até 20 dezenas',
      'Estatísticas completas, com gráficos e ciclos',
      'Gerador com filtros avançados',
    ],
    plan: 'premium',
  },
  G7: {
    title: 'Esse jogo está fora da janela de histórico do plano gratuito (90 dias)',
    bullets: ['Histórico completo, sem corte de 90 dias', 'Jogos ativos ilimitados', 'Exportação em todos os formatos'],
    plan: 'premium',
  },
  G8: {
    title: 'Backtesting histórico é um recurso do plano Pro',
    bullets: [
      'Backtesting de estratégias com dados históricos',
      'Assistente de IA (150 mensagens/mês)',
      'API pessoal',
    ],
    plan: 'pro',
  },
  G9: {
    title: 'Esse volume de bolões passa do limite do plano Premium',
    bullets: ['Bolões e participantes ilimitados', 'Backtesting histórico', 'Suporte prioritário (12h) + WhatsApp'],
    plan: 'pro',
  },
  G10: {
    title: 'Notificação por WhatsApp é exclusiva do plano Pro',
    bullets: ['Notificações por WhatsApp', 'Assistente de IA', 'Suporte prioritário com WhatsApp'],
    plan: 'pro',
  },
}

/** Bloqueio sem gate mapeado em docs/05 §5.4 (ex.: recurso sem gatilho definido ainda). */
export const DEFAULT_PAYWALL_COPY: PaywallCopy = {
  title: 'Esse recurso não está disponível no seu plano atual',
  bullets: ['Jogos ativos ilimitados', 'Histórico completo', 'Conferência automática em todas as modalidades'],
  plan: 'premium',
}

/**
 * LP-03 — Os 10 diferenciais comercializáveis (docs/04-produto-personas-e-diferenciais.md §4.3),
 * na mesma ordem do documento (força competitiva). Fonte única usada pelo grid da home
 * (seção 5, docs/08 §A.3.5) e pela página `/recursos`.
 *
 * Copy revisada contra docs/03 §3.4 D6 (proibido "aumente suas chances", "método",
 * "estratégia vencedora"): nenhuma frase abaixo promete resultado. "Garantia" nos
 * fechamentos (D3) é termo técnico de matemática combinatória (covering design) — garante
 * PONTOS SE certas dezenas saírem, não garante ganhar; docs/04 usa o mesmo termo.
 */
export interface FeatureDefinition {
  id: string
  title: string
  /** Texto curto — card do grid (home e /recursos). */
  short: string
  /** Parágrafo — usado só em /recursos, sob o card. */
  description: string
  /** Rota de destino, se a feature tiver página própria (LP-04). */
  href?: string
}

export const FEATURES: FeatureDefinition[] = [
  {
    id: 'bolao-manager',
    title: 'Bolão Manager',
    short: 'Gestão completa de bolões privados, por convite.',
    description:
      'Organize o bolão do escritório ou da família sem planilha e sem desconfiança: convite por link, Pix direto para o organizador, comprovante da aposta visível a todos e rateio calculado automaticamente após o sorteio.',
    href: '/recursos/bolao',
  },
  {
    id: 'conferencia-automatica',
    title: 'Conferência automática',
    short: 'Multi-concurso, com notificação assim que sair o resultado.',
    description:
      'Cadastre um jogo uma vez e diga para quantos concursos ele vale. O LotoPro confere sozinho, minutos após cada sorteio, e te avisa — você não precisa abrir o app para descobrir se ganhou.',
  },
  {
    id: 'fechamentos',
    title: 'Fechamentos com garantia',
    short: 'Matrizes verificadas — custo e garantia claros antes de gerar.',
    description:
      'Escolha suas dezenas e a garantia desejada (ex.: 14 pontos se 15 delas saírem) e receba o menor conjunto de jogos que cobre essa garantia, com o custo total mostrado antes de você decidir apostar.',
  },
  {
    id: 'backtesting',
    title: 'Backtesting honesto',
    short: 'Simula uma estratégia no histórico, sem prometer método vencedor.',
    description:
      'Veja quanto uma combinação de filtros teria custado e recuperado nos últimos concursos. O relatório mostra o resultado real — que tende a ser negativo, porque sorteios são independentes — e não vende isso como fórmula de ganhar.',
  },
  {
    id: 'ocr',
    title: 'Scanner de volante (OCR)',
    short: 'Fotografe o comprovante e o jogo é cadastrado sozinho.',
    description:
      'Tire uma foto do comprovante da lotérica e o LotoPro reconhece modalidade, concurso e dezenas automaticamente. Você sempre revisa antes de salvar — o cadastro nunca é automático sem confirmação.',
  },
  {
    id: 'carteira',
    title: 'Carteira e ROI real',
    short: 'Quanto você gastou, quanto recuperou — inclusive quando é negativo.',
    description:
      'Um resumo financeiro pessoal: quanto você gastou por mês e por modalidade, quanto recuperou em prêmios e o retorno sobre o investimento, exibido com honestidade mesmo quando o número é negativo.',
  },
  {
    id: 'alertas',
    title: 'Alertas inteligentes',
    short: 'Acumulado, fechamento de apostas e concursos especiais.',
    description:
      '"A Mega acumulou R$ 120 milhões", "faltam 2 horas para o encerramento do concurso" ou "a Mega da Virada abriu" — avisos automáticos que trazem você de volta no momento certo, sem custo de mídia.',
  },
  {
    id: 'impressao',
    title: 'Impressão em formato oficial',
    short: 'Exporte seus jogos prontos para levar à lotérica.',
    description:
      'Gere o PDF dos seus jogos em layout compacto para marcar e apostar na lotérica, fechando o ciclo "organizei aqui, apostei nos canais oficiais da Caixa".',
  },
  {
    id: 'assistente-ia',
    title: 'Assistente de análise com IA',
    short: 'Perguntas sobre seu histórico, sem prever resultado.',
    description:
      'Converse em linguagem natural sobre os seus dados: "quais dezenas eu mais joguei nos últimos 50 concursos?", "resuma meu semestre". O assistente nunca sugere que uma dezena é "mais provável" — sorteios são independentes.',
  },
  {
    id: 'api-whitelabel',
    title: 'API pessoal e White-label',
    short: 'Integração própria ou instância com sua marca (B2B).',
    description:
      'No plano Pro, um token pessoal para integrar seus jogos com planilha ou automações próprias. Para lotéricas e comunidades, uma instância com marca e domínio próprios (sob contrato — fale com a gente).',
  },
]

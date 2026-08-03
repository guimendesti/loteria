/**
 * FAQ — fonte única usada pela seção 8 da home (docs/08 §A.3.8, as 3 objeções centrais)
 * e pela página completa `/faq` (LP-10). Fundamentos de compliance em docs/03 §3.2/§3.3;
 * nenhuma resposta usa linguagem vetada por §3.4 D6 ("aumenta chance", "método", etc.).
 */
export interface FaqItem {
  question: string
  answer: string
}

/** Seção 8 da home — as 3 objeções centrais (docs/08 §A.3.8), texto exato. */
export const HOME_FAQ: FaqItem[] = [
  {
    question: 'Vocês apostam por mim?',
    answer:
      'Não. O LotoPro organiza e confere os jogos que você já fez ou pretende fazer. Todas as apostas devem ser feitas nos canais oficiais da CAIXA.',
  },
  {
    question: 'Tem vínculo com a Caixa?',
    answer:
      'Não. Somos um software independente, sem vínculo, parceria ou autorização da Caixa Econômica Federal.',
  },
  {
    question: 'Isso aumenta minha chance de ganhar?',
    answer:
      'Não. Sorteios são eventos independentes e aleatórios — nenhuma ferramenta de organização, estatística ou fechamento muda a probabilidade de acerto. O LotoPro existe para organizar e analisar, não para prever.',
  },
]

export interface FaqCategory {
  title: string
  items: FaqItem[]
}

/** Página `/faq` completa (LP-10) — inclui as 3 objeções da home + demais dúvidas comuns. */
export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: 'Sobre o LotoPro',
    items: [
      ...HOME_FAQ,
      {
        question: 'O que exatamente o LotoPro faz?',
        answer:
          'Organizamos os jogos que você registra, conferimos automaticamente contra os resultados oficiais e avisamos você. Também ajudamos a organizar bolões entre pessoas conhecidas e a analisar seu histórico de gastos e prêmios.',
      },
      {
        question: 'Preciso ter conta na Caixa ou em alguma lotérica para usar o LotoPro?',
        answer:
          'Não é preciso conta em lotérica para usar o conferidor público. Para apostar, você usa os canais oficiais da CAIXA (lotérica física ou app/site oficiais) normalmente — o LotoPro entra depois, para organizar e conferir o que você já apostou.',
      },
    ],
  },
  {
    title: 'Bolões',
    items: [
      {
        question: 'O LotoPro recebe o dinheiro do bolão?',
        answer:
          'Não. O LotoPro nunca recebe, guarda ou repassa valores de bolão. O Pix é sempre direto entre o participante e o organizador, usando a chave Pix cadastrada pelo próprio organizador. Nós apenas geramos o Pix copia-e-cola, registramos a confirmação e calculamos o rateio.',
      },
      {
        question: 'Quem é responsável por fazer a aposta do bolão?',
        answer:
          'O organizador do bolão é sempre o único responsável por realizar a aposta nos canais oficiais da Caixa, guardar o comprovante e efetuar o rateio do prêmio. O LotoPro apenas registra e calcula.',
      },
      {
        question: 'Posso criar um bolão público, aberto para qualquer pessoa entrar?',
        answer:
          'Não. Bolões no LotoPro são sempre privados e por convite — só entra quem recebe o link ou código do organizador. Não existe diretório público ou busca de bolões.',
      },
    ],
  },
  {
    title: 'Planos e cobrança',
    items: [
      {
        question: 'O preço da assinatura muda conforme eu jogo mais ou ganho um prêmio?',
        answer:
          'Nunca. A assinatura do LotoPro é 100% licença de software — o valor não varia com quanto você aposta, com o valor movimentado em um bolão ou com prêmios recebidos.',
      },
      {
        question: 'Posso cancelar quando quiser?',
        answer:
          'Sim, o cancelamento é self-service a qualquer momento em Conta e Assinatura. Ao cancelar, sua conta volta para o plano Free — seus dados e histórico não são apagados.',
      },
      {
        question: 'O que acontece se eu ultrapassar um limite do plano Free?',
        answer:
          'Você é avisado antes de perder qualquer trabalho (por exemplo, ao cadastrar o 20º jogo). Nada é apagado por atingir um limite — só a criação de itens novos além do limite fica bloqueada até você assinar um plano pago.',
      },
    ],
  },
  {
    title: 'Resultados e conferência',
    items: [
      {
        question: 'De onde vêm os resultados exibidos no LotoPro?',
        answer:
          'Os resultados são dados públicos, sincronizados a partir da fonte oficial de cada modalidade assim que são divulgados.',
      },
      {
        question: 'Posso conferir um jogo sem criar conta?',
        answer:
          'Sim — o conferidor público em /conferir permite marcar suas dezenas e conferir contra os últimos concursos, sem login. Com uma conta grátis, a conferência passa a ser automática em todo concurso novo.',
      },
    ],
  },
  {
    title: 'Privacidade e conta',
    items: [
      {
        question: 'Meus dados são vendidos para terceiros?',
        answer:
          'Não. Seguimos a LGPD e não vendemos dados de usuários. Veja os detalhes na nossa Política de Privacidade.',
      },
      {
        question: 'Posso excluir minha conta e meus dados?',
        answer:
          'Sim, a exclusão de conta é self-service, disponível em Conta e Assinatura. Dados vinculados a bolões de outras pessoas são anonimizados, não apagados, para não corromper o histórico de terceiros.',
      },
    ],
  },
]

/**
 * Schema Zod do payload da API não-documentada da Caixa.
 *
 * Fonte: `https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}[/{numero}]`
 * Ver docs/01-pesquisa-de-mercado.md §1.3 e docs/06-arquitetura-tecnica.md §6.6.
 *
 * Princípio: **tolerância máxima na borda**. A API não tem contrato nem SLA e pode mudar
 * sem aviso (doc 01 §1.3). Portanto:
 * - campos desconhecidos são preservados (`.passthrough()`), nunca causam falha;
 * - tipos numéricos aceitam `number` **ou** `string` (a API já variou entre os dois);
 * - listas aceitam `null` (Loteca devolve `listaDezenas: null`);
 * - só `numero` e `dataApuracao` são obrigatórios — sem eles o registro é inútil.
 *
 * Este módulo NÃO converte nada (nem dinheiro, nem data). Conversão é responsabilidade
 * de `parse.ts`, para manter a validação separada da normalização.
 */

import { z } from 'zod'

// ─── Primitivos tolerantes ───────────────────────────────────────────────────

/** Inteiro que pode chegar como `3038` ou `"3038"`. */
const numberLike = z.union([z.number(), z.string()])

/** Dezena: sempre string zero-paddeada no payload real (`"07"`), mas toleramos number. */
const dezenaLike = z.union([z.string(), z.number()])

/** Lista de dezenas; a Caixa devolve `null` quando a modalidade não tem dezenas (Loteca). */
const dezenaListLike = z.array(dezenaLike).nullish()

/**
 * Valor monetário. Chega como float JSON (`64733.96`) na API oficial, mas mirrors e
 * fallbacks devolvem string BR (`"64.733,96"`). Aceitamos ambos; a conversão exata para
 * centavos acontece em `parse.ts` (nunca aritmética de float — CLAUDE.md regra 5).
 */
const moneyLike = z.union([z.number(), z.string()]).nullish()

/** Booleano que pode chegar como `true`, `"true"` ou `1`. */
const booleanLike = z.union([z.boolean(), z.string(), z.number()]).nullish()

/** Texto livre; a Caixa preenche campos vazios com NULs (`"\u0000..."`). */
const textLike = z.union([z.string(), z.number()]).nullish()

// ─── Faixa de premiação ──────────────────────────────────────────────────────

export const caixaRateioPremioSchema = z
  .object({
    /** Ex.: `"6 acertos"`, `"Mês da Sorte"`, `"6 acertos + 2 trevos"`. */
    descricaoFaixa: textLike,
    /** Índice da faixa, 1-based. Dupla Sena usa 1–8 (1–4 = 1º sorteio, 5–8 = 2º). */
    faixa: numberLike.nullish(),
    numeroDeGanhadores: numberLike.nullish(),
    valorPremio: moneyLike,
  })
  .passthrough()

export type CaixaRateioPremio = z.infer<typeof caixaRateioPremioSchema>

// ─── Payload do concurso ─────────────────────────────────────────────────────

export const caixaPayloadSchema = z
  .object({
    // Identificação — obrigatórios
    numero: numberLike,
    /** `DD/MM/AAAA` no fuso America/São_Paulo. */
    dataApuracao: z.string(),

    // Identificação — opcionais
    tipoJogo: textLike,
    nome: textLike,
    loteria: textLike,
    numeroConcursoAnterior: numberLike.nullish(),
    numeroConcursoProximo: numberLike.nullish(),
    /** Pode vir `""` (Loteria Federal sem próximo concurso definido). */
    dataProximoConcurso: z.string().nullish(),

    // Dezenas
    listaDezenas: dezenaListLike,
    dezenasSorteadasOrdemSorteio: dezenaListLike,
    /** Dupla Sena: dezenas do 2º sorteio. `null` nas demais modalidades. */
    listaDezenasSegundoSorteio: dezenaListLike,

    // Campos extras por modalidade
    /** +Milionária: trevos sorteados (`["3","4"]`). Ausente nas demais. */
    trevosSorteados: dezenaListLike,
    /** Aliases defensivos — nunca observados na API oficial, vistos em mirrors. */
    listaTrevos: dezenaListLike,
    trevos: dezenaListLike,
    /**
     * Campo compartilhado (sic) entre Timemania e Dia de Sorte:
     * - Timemania → nome do time (`"TOMBENSE         /MG"`)
     * - Dia de Sorte → nome do mês (`"Abril"`)
     * - demais → `null` ou string de NULs
     */
    nomeTimeCoracaoMesSorte: textLike,

    // Premiação
    listaRateioPremio: z.array(caixaRateioPremioSchema).nullish(),
    listaMunicipioUFGanhadores: z.array(z.unknown()).nullish(),
    /** Loteca: jogos e placares. Estrutura preservada apenas em `raw`. */
    listaResultadoEquipeEsportiva: z.array(z.unknown()).nullish(),
    premiacaoContingencia: z.unknown().nullish(),

    // Valores
    valorArrecadado: moneyLike,
    valorAcumuladoProximoConcurso: moneyLike,
    valorAcumuladoConcursoEspecial: moneyLike,
    valorEstimadoProximoConcurso: moneyLike,
    valorSaldoReservaGarantidora: moneyLike,
    valorTotalPremioFaixaUm: moneyLike,

    // Flags e metadados
    acumulado: booleanLike,
    ultimoConcurso: booleanLike,
    indicadorConcursoEspecial: numberLike.nullish(),
    tipoPublicacao: numberLike.nullish(),
    numeroJogo: numberLike.nullish(),
    exibirDetalhamentoPorCidade: booleanLike,
    localSorteio: textLike,
    nomeMunicipioUFSorteio: textLike,
    observacao: textLike,
  })
  .passthrough()

export type CaixaPayload = z.infer<typeof caixaPayloadSchema>

/**
 * Valida sem lançar. Útil no worker: se falhar, alertar via Sentry e cair para o
 * fallback em vez de derrubar o job (doc 06 §6.6, linha "Mudança de schema").
 */
export function safeParseCaixaPayload(raw: unknown) {
  return caixaPayloadSchema.safeParse(raw)
}

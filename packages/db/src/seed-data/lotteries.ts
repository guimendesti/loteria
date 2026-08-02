/**
 * As 11 modalidades da Caixa (docs/07-modelo-de-dados.md §7.11).
 *
 * `displayOrder` é a posição no array + 1 — segue a ordem das "9 modalidades de dezenas"
 * priorizadas para o MVP (docs/12-riscos-e-decisoes-pendentes.md Q9), com Loteca e Federal
 * (Fase 2, formato estruturalmente diferente) ao final.
 *
 * ⚠️ Loteca e Federal: os documentos de produto não detalham universo/picks/agenda para essas
 * duas modalidades (deferidas para a Fase 2). Os valores abaixo são uma modelagem de melhor
 * esforço com base nas regras públicas da Caixa e devem ser revisados antes de ativar
 * conferência automática para elas:
 *  - Loteca: 14 jogos por cartela; cada "pick" é o resultado (1 = mandante, 2 = empate,
 *    3 = visitante) de um jogo — por isso `universeMin/Max` = 1..3 aqui representa códigos de
 *    resultado, não dezenas.
 *  - Federal: não há escolha de dezenas — o apostador compra fração de um bilhete pré-numerado
 *    (00000–99999) e concorrem 5 prêmios por concurso. Modelado como PICK_N de 1 "pick" sobre o
 *    universo 0..99999 apenas para caber no `LotteryFormat` existente; a granularidade real de
 *    prêmios (1º ao 5º) fica para `contest_prizes`, não para `prize_tiers` (por isso não há seed
 *    de prizeTiers para `federal` — também fora do escopo desta tarefa).
 *
 * Dias da semana em `drawSchedule.days`: 0=domingo … 6=sábado (mesma convenção de
 * packages/core/src/types.ts `DrawSchedule`). Horários e `cutoffMinutes` refletem a agenda
 * pública recente da Caixa e devem ser conferidos contra `packages/integrations/caixa` antes do
 * backfill de concursos.
 */
import type { LotterySeed } from './types'

export const lotteries: LotterySeed[] = [
  {
    slug: 'megasena',
    name: 'Mega-Sena',
    caixaApiSlug: 'megasena',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 60,
    picksMin: 6,
    picksMax: 20,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [3, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // quarta e sábado
    colorToken: '--lot-megasena',
  },
  {
    slug: 'lotofacil',
    name: 'Lotofácil',
    caixaApiSlug: 'lotofacil',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 25,
    picksMin: 15,
    picksMax: 20,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [1, 2, 3, 4, 5, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // segunda a sábado
    colorToken: '--lot-lotofacil',
  },
  {
    slug: 'quina',
    name: 'Quina',
    caixaApiSlug: 'quina',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 80,
    picksMin: 5,
    picksMax: 15,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [1, 2, 3, 4, 5, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // segunda a sábado
    colorToken: '--lot-quina',
  },
  {
    slug: 'lotomania',
    name: 'Lotomania',
    caixaApiSlug: 'lotomania',
    format: 'PICK_N',
    // Volante 00–99; "00" é representado como 0 (universo 0–99, 100 dezenas) — mesma
    // convenção de packages/core/src/lottery/configs.ts.
    universeMin: 0,
    universeMax: 99,
    picksMin: 50, // aposta é sempre de 50 dezenas fixas
    picksMax: 50,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [1, 3, 5], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // segunda, quarta e sexta
    colorToken: '--lot-lotomania',
  },
  {
    slug: 'duplasena',
    name: 'Dupla Sena',
    caixaApiSlug: 'duplasena',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 50,
    picksMin: 6,
    picksMax: 15,
    drawsPerContest: 2, // dois sorteios por concurso — ver PrizeTier.drawIndex / BetCheck.drawIndex
    extraField: null,
    drawSchedule: { days: [2, 4, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // terça, quinta e sábado
    colorToken: '--lot-duplasena',
  },
  {
    slug: 'timemania',
    name: 'Timemania',
    caixaApiSlug: 'timemania',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 80,
    picksMin: 10, // aposta é sempre de 10 dezenas fixas
    picksMax: 10,
    drawsPerContest: 1,
    extraField: { kind: 'TEAM' }, // time do coração
    drawSchedule: { days: [2, 4, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // terça, quinta e sábado
    colorToken: '--lot-timemania',
  },
  {
    slug: 'diadesorte',
    name: 'Dia de Sorte',
    caixaApiSlug: 'diadesorte',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 31,
    picksMin: 7,
    picksMax: 15,
    drawsPerContest: 1,
    extraField: { kind: 'MONTH' }, // mês da sorte (1–12)
    drawSchedule: { days: [2, 4, 6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // terça, quinta e sábado
    colorToken: '--lot-diadesorte',
  },
  {
    slug: 'supersete',
    name: 'Super Sete',
    caixaApiSlug: 'supersete',
    format: 'COLUMNS',
    // universo por coluna: dígitos 0–9. picksMin/Max seguem a convenção de
    // packages/core/src/lottery/configs.ts (`columnLayout`): picksMin = nº de colunas
    // (7), picksMax = colunas × máx. de palpites por coluna (7 × 3 = 21) — não o nº de
    // palpites por coluna isoladamente (esse é 1–3, ver `BetInput.columns` no core).
    universeMin: 0,
    universeMax: 9,
    picksMin: 7,
    picksMax: 21,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [1, 3, 5], time: '15:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // segunda, quarta e sexta — sorteio vespertino
    colorToken: '--lot-supersete',
  },
  {
    slug: 'maismilionaria',
    name: '+Milionária',
    caixaApiSlug: 'maismilionaria',
    format: 'PICK_N',
    universeMin: 1,
    universeMax: 50,
    picksMin: 6,
    picksMax: 12,
    drawsPerContest: 1,
    extraField: { kind: 'CLOVER', min: 1, max: 6, picksMin: 2, picksMax: 6 },
    drawSchedule: { days: [6], time: '20:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // sábado
    colorToken: '--lot-maismilionaria',
  },
  {
    slug: 'loteca',
    name: 'Loteca',
    caixaApiSlug: 'loteca',
    format: 'MATCH_LIST',
    universeMin: 1, // 1 = mandante vence
    universeMax: 3, // 3 = visitante vence (2 = empate)
    picksMin: 14, // 14 jogos por cartela, sempre
    picksMax: 42, // 14 jogos × até 3 palpites (duplos/triplos) por jogo
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [6], time: '19:00', cutoffMinutes: 120, tz: 'America/Sao_Paulo' }, // encerra sábado, resultado apurado ao longo do fim de semana
    colorToken: '--lot-loteca',
  },
  {
    slug: 'federal',
    name: 'Loteria Federal',
    caixaApiSlug: 'federal',
    format: 'PICK_N',
    universeMin: 0,
    universeMax: 99999, // bilhete de 5 dígitos
    picksMin: 1,
    picksMax: 1,
    drawsPerContest: 1,
    extraField: null,
    drawSchedule: { days: [3, 6], time: '19:00', cutoffMinutes: 60, tz: 'America/Sao_Paulo' }, // quarta e sábado
    colorToken: '--lot-federal',
  },
]

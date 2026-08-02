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
 * ⚠️ `drawSchedule` — contrato v2: horário POR DIA (`entries[]`, não mais `days`+`time` único).
 * Dias da semana em `entries[].day`: 0=domingo … 6=sábado (mesma convenção de
 * packages/core/src/types.ts `DrawScheduleEntry`). `cutoffMinutes` é sempre contado a partir
 * do horário do SORTEIO daquele dia.
 *
 * Em julho/2026 os sorteios de SÁBADO migraram para DOMINGO às 11h, com apostas simples
 * encerrando às 22h de sábado — 13h antes = `cutoffMinutes: 780` (doc 01 §1.2, nota de rodapé).
 * A agenda abaixo espelha 1:1 `packages/core/src/lottery/configs.ts`, que é a fonte de verdade
 * (garantido pelo teste `test/seed-consistency.test.ts`, caso "e").
 */
import type { DrawScheduleConfig, LotterySeed } from './types'

const TZ = 'America/Sao_Paulo'

/** Entradas de dias de semana com o mesmo horário e corte. */
function onDays(days: readonly number[], time = '20:00', cutoffMinutes = 60): DrawScheduleConfig['entries'] {
  return days.map((day) => ({ day, time, cutoffMinutes }))
}

/**
 * Sorteio migrado do sábado: domingo 11h, corte às 22h de sábado (780 min antes).
 * Função, e não constante compartilhada: cada modalidade leva a sua própria cópia do objeto
 * (este array é serializado para Json no seed — nenhuma referência cruzada entre linhas).
 */
function sundayDraw(): DrawScheduleConfig['entries'][number] {
  return { day: 0, time: '11:00', cutoffMinutes: 780 }
}

function schedule(entries: DrawScheduleConfig['entries']): DrawScheduleConfig {
  return { entries, tz: TZ }
}

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
    // ter, qui + dom 11h — o sorteio de sábado migrou (doc 01 §1.2, "Ter, Qui, Sáb/Dom*")
    drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
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
    // "Seg a Sáb" → seg–sex + dom 11h — CONFIRMADO (S3).
    drawSchedule: schedule([...onDays([1, 2, 3, 4, 5]), sundayDraw()]),
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
    // "Seg a Sáb" → seg–sex + dom 11h — CONFIRMADO (S3).
    drawSchedule: schedule([...onDays([1, 2, 3, 4, 5]), sundayDraw()]),
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
    // segunda, quarta e sexta — sem sorteio sabatino, nada a migrar
    drawSchedule: schedule(onDays([1, 3, 5])),
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
    // CONFIRMADO (S3, notícias jul/2026): Dupla Sena NÃO está entre as sete
    // modalidades migradas para domingo. Grade 3x/semana em dias úteis.
    drawSchedule: schedule(onDays([1, 3, 5])),
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
    // ter, qui + dom 11h — o sábado migrou — CONFIRMADO (S3).
    drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
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
    // ter, qui + dom 11h — o sábado migrou — CONFIRMADO (S3).
    drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
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
    // segunda, quarta e sexta — sorteio vespertino (15h), sem sábado a migrar
    drawSchedule: schedule(onDays([1, 3, 5], '15:00')),
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
    // único sorteio da semana, migrado de sábado para domingo 11h — CONFIRMADO (S3).
    drawSchedule: schedule([sundayDraw()]),
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
    // encerrava no sábado e era apurada ao longo do fim de semana; modelada como domingo 11h
    // junto com as demais — CONFIRMADO (S3).
    drawSchedule: schedule([sundayDraw()]),
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
    // CONFIRMADO (S3, notícias jul/2026): a Federal ESTÁ entre as sete migradas —
    // extração de sábado foi para domingo 11h; a de quarta segue às 19h.
    drawSchedule: schedule([...onDays([3], '19:00'), sundayDraw()]),
    colorToken: '--lot-federal',
  },
]

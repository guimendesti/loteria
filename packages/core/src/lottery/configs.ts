/**
 * Configuração das 11 modalidades — **modalidade é dado, não código** (CLAUDE.md §6).
 *
 * Fonte dos dados: docs/01-pesquisa-de-mercado.md §1.2 (tabela vigente em 2026).
 * Este é o único arquivo do pacote que conhece slugs. Todo o resto (validate, price, check)
 * opera exclusivamente sobre `LotteryConfig`.
 *
 * ⚠️ Em produção esta tabela vive no banco (`lotteries` + `price_tiers` + `prize_tiers`),
 * versionada por data de vigência — ver docs/01 §1.2 e docs/07. O objeto abaixo é o
 * *seed* canônico e a fonte de verdade dos testes.
 *
 * ── Convenções de modelagem ──────────────────────────────────────────────────
 *
 * PREÇO (`priceTiers`)
 *  • PICK_N: a tabela é enumerada por completo, `priceCents = simples × C(picks, picksMin)`.
 *  • +Milionária: grade `picks × trevos`, `priceCents = simples × C(picks,6) × C(trevos,2)/C(2,2)`.
 *  • COLUMNS / MATCH_LIST (Super Sete, Loteca): o número de apostas simples contidas é o
 *    PRODUTO dos palpites por coluna/jogo (ex.: 2·1·1·1·1·1·1 = 2), e não uma combinação
 *    C(n,k) — o mesmo total de dezenas marcadas admite produtos diferentes (9 dezenas =
 *    3·1·1·1·1·1·1 = 3 ou 2·2·1·1·1·1·1 = 4). Por isso a tabela guarda apenas a faixa
 *    simples e `priceBet` aplica o multiplicador do formato. Ver `price.ts`.
 *
 * COLUNAS (`format: 'COLUMNS' | 'MATCH_LIST'`)
 *  • Número de colunas   = `picksMin` (mínimo de 1 palpite por coluna).
 *  • Palpites por coluna = 1 … `picksMax / picksMin`.
 *    Super Sete: 7 colunas × 1–3 dígitos (0–9). Loteca: 14 jogos × 1–3 palpites (1=mandante,
 *    2=empate, 3=visitante — codificados no universo 1–3 para não colidir com "coluna vazia").
 *
 * FAIXAS (`prizeTiers`)
 *  • `extraHits === null` → faixa numérica pura: casa por `hits` exato.
 *  • `extraField.kind === 'CLOVER'` → faixa cruzada: casa por (`hits`, `extraHits`) exatos.
 *    "1 ou 0 trevos" vira DUAS linhas com o MESMO `tier` (a Caixa publica um único rateio
 *    para a faixa) — ver `check.ts`.
 *  • `extraField.kind === 'MONTH' | 'TEAM'` → faixa independente das dezenas (Mês da Sorte,
 *    Time do Coração são prêmios próprios, acumuláveis com a faixa numérica). Modeladas com
 *    `hits: 0, extraHits: 1`; `check.ts` ignora `hits` nessas faixas.
 *  • Dupla Sena: as 4 faixas se repetem nos dois sorteios — mesmo `tier`, `drawIndex` 1 e 2.
 *
 * AGENDA (`drawSchedule`) — contrato v2, horário POR DIA
 *  • Em julho/2026 a Caixa migrou os sorteios que aconteciam aos SÁBADOS para DOMINGO às 11h,
 *    no Espaço da Sorte (SP), mantendo o encerramento das apostas simples às 22h de SÁBADO
 *    (doc 01 §1.2, nota de rodapé). Como `cutoffMinutes` é sempre contado a partir do horário
 *    do sorteio, o corte de sábado 22h vira `780` minutos antes do sorteio de domingo 11h.
 *  • Sorteios de segunda a sexta continuam às 20h (Super Sete às 15h) com corte de 60 min.
 *  • Um `time` único por modalidade não representava isso — daí `entries[]` com `{day, time,
 *    cutoffMinutes}` por dia.
 */

import type {
  DrawSchedule,
  DrawScheduleEntry,
  ExtraFieldConfig,
  LotteryConfig,
  LotterySlug,
  PriceTierData,
  PrizeTierData,
} from '../types'
import { combinations } from './combinatorics'

// ─── Helpers de construção ───────────────────────────────────────────────────

/** 0 = domingo … 6 = sábado (convenção de `DrawScheduleEntry.day`). */
const SUNDAY = 0

/** Sorteios de semana: 20h, apostas encerram 1h antes. */
const WEEKDAY_TIME = '20:00'
const WEEKDAY_CUTOFF_MINUTES = 60

/**
 * Sorteio de domingo às 11h (migração de jul/2026). Corte às 22h do SÁBADO anterior:
 * 11:00 − 13h = 22:00 do dia anterior → 13 × 60 = 780 minutos antes do sorteio.
 */
const SUNDAY_TIME = '11:00'
const SUNDAY_CUTOFF_MINUTES = 13 * 60

/** Entradas de dias de semana, todas com o mesmo horário e corte. */
function onDays(
  days: readonly number[],
  time: string = WEEKDAY_TIME,
  cutoffMinutes: number = WEEKDAY_CUTOFF_MINUTES,
): DrawScheduleEntry[] {
  return days.map((day) => ({ day, time, cutoffMinutes }))
}

/** O sorteio que era de sábado, hoje domingo 11h com corte às 22h de sábado. */
function sundayDraw(): DrawScheduleEntry {
  return { day: SUNDAY, time: SUNDAY_TIME, cutoffMinutes: SUNDAY_CUTOFF_MINUTES }
}

function schedule(entries: DrawScheduleEntry[]): DrawSchedule {
  return { entries }
}

/** Tabela completa de PICK_N: preçoSimples × C(picks, picksMin). */
function pickNPriceTiers(picksMin: number, picksMax: number, simpleCents: bigint): PriceTierData[] {
  const tiers: PriceTierData[] = []
  for (let picks = picksMin; picks <= picksMax; picks++) {
    tiers.push({
      picks,
      extraPicks: null,
      priceCents: simpleCents * combinations(picks, picksMin),
    })
  }
  return tiers
}

/** Grade dezenas × trevos da +Milionária: simples × C(picks,6) × C(trevos,2)/C(2,2). */
function cloverPriceTiers(
  picksMin: number,
  picksMax: number,
  cloverMin: number,
  cloverMax: number,
  simpleCents: bigint,
): PriceTierData[] {
  const base = combinations(cloverMin, cloverMin) // C(2,2) === 1n — explícito para rastrear a fórmula
  const tiers: PriceTierData[] = []
  for (let picks = picksMin; picks <= picksMax; picks++) {
    for (let extraPicks = cloverMin; extraPicks <= cloverMax; extraPicks++) {
      tiers.push({
        picks,
        extraPicks,
        priceCents:
          (simpleCents * combinations(picks, picksMin) * combinations(extraPicks, cloverMin)) / base,
      })
    }
  }
  return tiers
}

/** COLUMNS / MATCH_LIST: apenas a faixa simples; o multiplicador é o produto por coluna. */
function simpleOnlyPriceTiers(picksMin: number, simpleCents: bigint): PriceTierData[] {
  return [{ picks: picksMin, extraPicks: null, priceCents: simpleCents }]
}

/** Faixas numéricas puras, na ordem (tier 1 = melhor). */
function hitTiers(
  entries: ReadonlyArray<readonly [hits: number, label: string]>,
  drawIndex: number | null = null,
): PrizeTierData[] {
  return entries.map(([hits, label], i) => ({
    tier: i + 1,
    label,
    hits,
    extraHits: null,
    drawIndex,
  }))
}

/** Faixa própria do campo extra (Mês da Sorte / Time do Coração). */
function extraOnlyTier(tier: number, label: string): PrizeTierData {
  return { tier, label, hits: 0, extraHits: 1, drawIndex: null }
}

const CLOVER_FIELD: ExtraFieldConfig = { kind: 'CLOVER', min: 1, max: 6, picksMin: 2, picksMax: 6 }
const MONTH_FIELD: ExtraFieldConfig = { kind: 'MONTH' }
const TEAM_FIELD: ExtraFieldConfig = { kind: 'TEAM' }

// ─── Modalidades ─────────────────────────────────────────────────────────────

const megasena: LotteryConfig = {
  slug: 'megasena',
  name: 'Mega-Sena',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 60,
  picksMin: 6,
  picksMax: 20,
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "Ter, Qui, Sáb/Dom*" — o sorteio de sábado migrou para domingo (jul/2026),
  // 11h, com apostas encerrando às 22h de sábado. Migração CONFIRMADA no doc para a Mega.
  drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
  priceTiers: pickNPriceTiers(6, 20, 600n),
  prizeTiers: hitTiers([
    [6, 'Sena'],
    [5, 'Quina'],
    [4, 'Quadra'],
  ]),
}

const lotofacil: LotteryConfig = {
  slug: 'lotofacil',
  name: 'Lotofácil',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 25,
  picksMin: 15,
  picksMax: 20,
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "Seg a Sáb" — sábado → domingo 11h. // TODO confirmar migração dom.
  drawSchedule: schedule([...onDays([1, 2, 3, 4, 5]), sundayDraw()]),
  priceTiers: pickNPriceTiers(15, 20, 350n),
  prizeTiers: hitTiers([
    [15, '15 acertos'],
    [14, '14 acertos'],
    [13, '13 acertos'],
    [12, '12 acertos'],
    [11, '11 acertos'],
  ]),
}

const quina: LotteryConfig = {
  slug: 'quina',
  name: 'Quina',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 80,
  picksMin: 5,
  picksMax: 15,
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "Seg a Sáb" — sábado → domingo 11h. // TODO confirmar migração dom.
  drawSchedule: schedule([...onDays([1, 2, 3, 4, 5]), sundayDraw()]),
  priceTiers: pickNPriceTiers(5, 15, 300n),
  prizeTiers: hitTiers([
    [5, 'Quina'],
    [4, 'Quadra'],
    [3, 'Terno'],
    [2, 'Duque'],
  ]),
}

const lotomania: LotteryConfig = {
  slug: 'lotomania',
  name: 'Lotomania',
  format: 'PICK_N',
  // Volante 00–99; representamos 00 como 0 (universo 0–99, 100 dezenas).
  universeMin: 0,
  universeMax: 99,
  picksMin: 50,
  picksMax: 50,
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "3x/semana" — seg/qua/sex. Sem sorteio sabatino: nada a migrar.
  drawSchedule: schedule(onDays([1, 3, 5])),
  priceTiers: pickNPriceTiers(50, 50, 300n),
  // Única modalidade que premia ZERO acertos.
  prizeTiers: hitTiers([
    [20, '20 acertos'],
    [19, '19 acertos'],
    [18, '18 acertos'],
    [17, '17 acertos'],
    [16, '16 acertos'],
    [15, '15 acertos'],
    [0, 'Nenhum acerto'],
  ]),
}

const duplasena: LotteryConfig = {
  slug: 'duplasena',
  name: 'Dupla Sena',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 50,
  picksMin: 6,
  picksMax: 15,
  drawsPerContest: 2, // dois sorteios por concurso
  extraField: null,
  // doc 01 §1.2: "3x/semana" — a grade da Caixa é ter/qui/sáb (mesma do seed em
  // packages/db/src/seed-data/lotteries.ts); o sábado migrou para domingo 11h.
  // (A v1 deste arquivo trazia seg/qua/sex, divergindo do seed — corrigido aqui.)
  // TODO confirmar migração dom.
  drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
  priceTiers: pickNPriceTiers(6, 15, 300n),
  prizeTiers: [
    ...hitTiers(
      [
        [6, 'Sena (1º sorteio)'],
        [5, 'Quina (1º sorteio)'],
        [4, 'Quadra (1º sorteio)'],
        [3, 'Terno (1º sorteio)'],
      ],
      1,
    ),
    ...hitTiers(
      [
        [6, 'Sena (2º sorteio)'],
        [5, 'Quina (2º sorteio)'],
        [4, 'Quadra (2º sorteio)'],
        [3, 'Terno (2º sorteio)'],
      ],
      2,
    ),
  ],
}

const timemania: LotteryConfig = {
  slug: 'timemania',
  name: 'Timemania',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 80,
  picksMin: 10,
  picksMax: 10, // 10 dezenas fixas — não há aposta múltipla
  drawsPerContest: 1,
  extraField: TEAM_FIELD,
  // doc 01 §1.2: "3x/semana" — ter/qui/sáb; o sábado migrou para domingo 11h.
  // TODO confirmar migração dom.
  drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
  priceTiers: pickNPriceTiers(10, 10, 350n),
  prizeTiers: [
    ...hitTiers([
      [7, '7 acertos'],
      [6, '6 acertos'],
      [5, '5 acertos'],
      [4, '4 acertos'],
      [3, '3 acertos'],
    ]),
    extraOnlyTier(6, 'Time do Coração'),
  ],
}

const diadesorte: LotteryConfig = {
  slug: 'diadesorte',
  name: 'Dia de Sorte',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 31,
  picksMin: 7,
  picksMax: 15,
  drawsPerContest: 1,
  extraField: MONTH_FIELD,
  // doc 01 §1.2: "3x/semana" — ter/qui/sáb; o sábado migrou para domingo 11h.
  // TODO confirmar migração dom.
  drawSchedule: schedule([...onDays([2, 4]), sundayDraw()]),
  priceTiers: pickNPriceTiers(7, 15, 250n),
  prizeTiers: [
    ...hitTiers([
      [7, '7 acertos'],
      [6, '6 acertos'],
      [5, '5 acertos'],
      [4, '4 acertos'],
    ]),
    extraOnlyTier(5, 'Mês da Sorte'),
  ],
}

const supersete: LotteryConfig = {
  slug: 'supersete',
  name: 'Super Sete',
  format: 'COLUMNS',
  universeMin: 0,
  universeMax: 9,
  picksMin: 7, // 7 colunas × 1 dígito
  picksMax: 21, // 7 colunas × 3 dígitos
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "Seg, Qua, Sex" — sorteio vespertino (15h). Sem sábado: nada a migrar.
  drawSchedule: schedule(onDays([1, 3, 5], '15:00')),
  priceTiers: simpleOnlyPriceTiers(7, 300n),
  prizeTiers: hitTiers([
    [7, '7 colunas'],
    [6, '6 colunas'],
    [5, '5 colunas'],
    [4, '4 colunas'],
    [3, '3 colunas'],
  ]),
}

const maismilionaria: LotteryConfig = {
  slug: 'maismilionaria',
  name: '+Milionária',
  format: 'PICK_N',
  universeMin: 1,
  universeMax: 50,
  picksMin: 6,
  picksMax: 12,
  drawsPerContest: 1,
  extraField: CLOVER_FIELD,
  // doc 01 §1.2: "Sábado" — único sorteio da semana, migrado para domingo 11h.
  // TODO confirmar migração dom.
  drawSchedule: schedule([sundayDraw()]),
  priceTiers: cloverPriceTiers(6, 12, 2, 6, 600n),
  // Faixas cruzadas dezenas × trevos. "1 ou 0 trevo" = duas linhas com o mesmo tier.
  prizeTiers: [
    { tier: 1, label: '6 acertos + 2 trevos', hits: 6, extraHits: 2, drawIndex: null },
    { tier: 2, label: '6 acertos + 1 ou 0 trevo', hits: 6, extraHits: 1, drawIndex: null },
    { tier: 2, label: '6 acertos + 1 ou 0 trevo', hits: 6, extraHits: 0, drawIndex: null },
    { tier: 3, label: '5 acertos + 2 trevos', hits: 5, extraHits: 2, drawIndex: null },
    { tier: 4, label: '5 acertos + 1 ou 0 trevo', hits: 5, extraHits: 1, drawIndex: null },
    { tier: 4, label: '5 acertos + 1 ou 0 trevo', hits: 5, extraHits: 0, drawIndex: null },
    { tier: 5, label: '4 acertos + 2 trevos', hits: 4, extraHits: 2, drawIndex: null },
    { tier: 6, label: '4 acertos + 1 ou 0 trevo', hits: 4, extraHits: 1, drawIndex: null },
    { tier: 6, label: '4 acertos + 1 ou 0 trevo', hits: 4, extraHits: 0, drawIndex: null },
    { tier: 7, label: '3 acertos + 2 trevos', hits: 3, extraHits: 2, drawIndex: null },
    { tier: 8, label: '2 acertos + 2 trevos', hits: 2, extraHits: 2, drawIndex: null },
  ],
}

const loteca: LotteryConfig = {
  slug: 'loteca',
  name: 'Loteca',
  format: 'MATCH_LIST',
  // 1 = mandante, 2 = empate, 3 = visitante.
  universeMin: 1,
  universeMax: 3,
  picksMin: 14, // 14 jogos × 1 palpite
  picksMax: 42, // 14 jogos × 3 palpites
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "Semanal" — cartela encerrava no sábado, apurada ao longo do fim de semana.
  // Modelada como domingo 11h (corte 22h de sábado) junto com as demais.
  // TODO confirmar migração dom.
  drawSchedule: schedule([sundayDraw()]),
  priceTiers: simpleOnlyPriceTiers(14, 400n),
  prizeTiers: hitTiers([
    [14, '14 acertos'],
    [13, '13 acertos'],
  ]),
}

/**
 * Loteria Federal — bilhete numerado, **não é volante** (doc 01 §1.2, implicação 3:
 * deixar para a fase 2). Modelamos apenas o que é conhecido: universo do bilhete e
 * calendário. Sem tabela de preços (o bilhete é vendido em frações, preço variável —
 * doc 01 §1.2 "Variável") e sem faixas (os 5 prêmios são por posição do bilhete, não por
 * contagem de acertos). Consequência intencional: `validateBet` devolve `NO_PRICE_TIER`
 * e `priceBet` lança — a modalidade existe no catálogo mas não é apostável pelo motor.
 */
const federal: LotteryConfig = {
  slug: 'federal',
  name: 'Loteria Federal',
  format: 'PICK_N',
  universeMin: 0,
  universeMax: 99999,
  picksMin: 1,
  picksMax: 1,
  drawsPerContest: 1,
  extraField: null,
  // doc 01 §1.2: "2x/semana" — quarta e sábado às 19h. A Federal NÃO está entre as
  // modalidades migradas para domingo (o bilhete é vendido em fração, não é volante).
  drawSchedule: schedule(onDays([3, 6], '19:00')),
  priceTiers: [],
  prizeTiers: [],
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const LOTTERY_CONFIGS: Record<LotterySlug, LotteryConfig> = {
  megasena,
  lotofacil,
  quina,
  lotomania,
  duplasena,
  timemania,
  diadesorte,
  supersete,
  maismilionaria,
  loteca,
  federal,
}

export const ALL_LOTTERIES: readonly LotteryConfig[] = Object.freeze(
  Object.values(LOTTERY_CONFIGS),
)

/** Config de uma modalidade conhecida. Total sobre `LotterySlug` — nunca devolve undefined. */
export function getLotteryConfig(slug: LotterySlug): LotteryConfig {
  return LOTTERY_CONFIGS[slug]
}

/** Versão tolerante, para entrada externa (payload da Caixa, querystring, seed). */
export function findLotteryConfig(slug: string): LotteryConfig | undefined {
  return Object.prototype.hasOwnProperty.call(LOTTERY_CONFIGS, slug)
    ? LOTTERY_CONFIGS[slug as LotterySlug]
    : undefined
}

/**
 * Layout de colunas derivado da config (COLUMNS / MATCH_LIST).
 * Regra: nº de colunas = `picksMin`; máximo de palpites por coluna = `picksMax / picksMin`.
 */
export function columnLayout(config: LotteryConfig): { columnCount: number; maxPerColumn: number } {
  return {
    columnCount: config.picksMin,
    maxPerColumn: Math.max(1, Math.floor(config.picksMax / config.picksMin)),
  }
}

/**
 * Validação de aposta contra a config da modalidade.
 *
 * Nenhum `if (slug === ...)`: as diferenças entre modalidades saem de `config.format`
 * e de `config.extraField.kind` (CLAUDE.md §6).
 *
 * A validação é **acumulativa** — devolve todos os problemas de uma vez, para a UI
 * conseguir marcar tudo em um passe. `NO_PRICE_TIER` é a única exceção: só é avaliada
 * quando o resto da aposta está íntegro, senão viraria ruído em toda aposta incompleta.
 */

import type {
  BetInput,
  LotteryConfig,
  ValidationError,
  ValidationResult,
} from '../types'
import { columnLayout } from './configs'
import { resolvePrice } from './price'

type Code = ValidationError['code']

function err(code: Code, message: string): ValidationError {
  return { code, message }
}

function isNumberInUniverse(config: LotteryConfig, value: number): boolean {
  return Number.isInteger(value) && value >= config.universeMin && value <= config.universeMax
}

function findDuplicates(values: readonly number[]): number[] {
  const seen = new Set<number>()
  const duplicated = new Set<number>()
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value)
    seen.add(value)
  }
  return [...duplicated].sort((a, b) => a - b)
}

// ─── PICK_N ──────────────────────────────────────────────────────────────────

function validatePickN(config: LotteryConfig, bet: BetInput, errors: ValidationError[]): void {
  if (bet.columns !== undefined && bet.columns.length > 0) {
    errors.push(
      err('FORMAT_MISMATCH', `${config.name} é apostada por dezenas; o campo "columns" não se aplica.`),
    )
  }

  const outOfUniverse = bet.numbers.filter((value) => !isNumberInUniverse(config, value))
  if (outOfUniverse.length > 0) {
    errors.push(
      err(
        'OUT_OF_UNIVERSE',
        `Dezenas fora do universo ${config.universeMin}–${config.universeMax}: ${outOfUniverse.join(', ')}.`,
      ),
    )
  }

  const duplicates = findDuplicates(bet.numbers)
  if (duplicates.length > 0) {
    errors.push(err('DUPLICATE_NUMBER', `Dezenas repetidas: ${duplicates.join(', ')}.`))
  }

  if (bet.numbers.length < config.picksMin) {
    errors.push(
      err(
        'TOO_FEW_PICKS',
        `${config.name} exige no mínimo ${config.picksMin} dezenas; foram ${bet.numbers.length}.`,
      ),
    )
  } else if (bet.numbers.length > config.picksMax) {
    errors.push(
      err(
        'TOO_MANY_PICKS',
        `${config.name} aceita no máximo ${config.picksMax} dezenas; foram ${bet.numbers.length}.`,
      ),
    )
  }
}

// ─── COLUMNS / MATCH_LIST ────────────────────────────────────────────────────

function validateColumns(config: LotteryConfig, bet: BetInput, errors: ValidationError[]): void {
  const { columnCount, maxPerColumn } = columnLayout(config)

  if (bet.numbers.length > 0) {
    errors.push(
      err(
        'FORMAT_MISMATCH',
        `${config.name} é apostada por colunas; use "columns" e deixe "numbers" vazio.`,
      ),
    )
  }

  const columns = bet.columns
  if (columns === undefined) {
    errors.push(err('FORMAT_MISMATCH', `${config.name} exige o campo "columns".`))
    return
  }

  if (columns.length !== columnCount) {
    errors.push(
      err(
        'COLUMNS_INVALID',
        `${config.name} exige exatamente ${columnCount} colunas; foram ${columns.length}.`,
      ),
    )
  }

  const outOfUniverse: number[] = []
  const duplicated: number[] = []
  let tooFew = 0
  let tooMany = 0

  columns.forEach((column, index) => {
    if (column.length < 1) tooFew += 1
    else if (column.length > maxPerColumn) tooMany += 1

    for (const value of column) {
      if (!isNumberInUniverse(config, value)) outOfUniverse.push(value)
    }
    if (findDuplicates(column).length > 0) duplicated.push(index + 1)
  })

  if (tooFew > 0 || tooMany > 0) {
    errors.push(
      err(
        'COLUMNS_INVALID',
        `Cada coluna de ${config.name} aceita de 1 a ${maxPerColumn} números (${tooFew} coluna(s) vazia(s), ${tooMany} coluna(s) acima do limite).`,
      ),
    )
  }
  if (outOfUniverse.length > 0) {
    errors.push(
      err(
        'OUT_OF_UNIVERSE',
        `Números fora do intervalo ${config.universeMin}–${config.universeMax}: ${outOfUniverse.join(', ')}.`,
      ),
    )
  }
  if (duplicated.length > 0) {
    errors.push(
      err('DUPLICATE_NUMBER', `Números repetidos na(s) coluna(s): ${duplicated.join(', ')}.`),
    )
  }
}

// ─── Campo extra ─────────────────────────────────────────────────────────────

function validateExtra(config: LotteryConfig, bet: BetInput, errors: ValidationError[]): void {
  const field = config.extraField
  const extra = bet.extra

  if (field === null) {
    if (extra !== undefined) {
      errors.push(err('EXTRA_INVALID', `${config.name} não possui campo extra.`))
    }
    return
  }

  if (extra === undefined) {
    errors.push(err('EXTRA_REQUIRED', `${config.name} exige o campo extra (${field.kind}).`))
    return
  }

  if (extra.kind !== field.kind) {
    errors.push(
      err('EXTRA_INVALID', `Campo extra de ${config.name} deve ser ${field.kind}, veio ${extra.kind}.`),
    )
    return
  }

  switch (field.kind) {
    case 'CLOVER': {
      // `extra.kind === field.kind` foi verificado acima; o narrowing aqui é seguro.
      const clovers = extra.kind === 'CLOVER' ? extra.clovers : []
      if (clovers.length < field.picksMin || clovers.length > field.picksMax) {
        errors.push(
          err(
            'EXTRA_INVALID',
            `${config.name} exige de ${field.picksMin} a ${field.picksMax} trevos; foram ${clovers.length}.`,
          ),
        )
      }
      const invalid = clovers.filter(
        (value) => !Number.isInteger(value) || value < field.min || value > field.max,
      )
      if (invalid.length > 0) {
        errors.push(
          err(
            'EXTRA_INVALID',
            `Trevos fora do intervalo ${field.min}–${field.max}: ${invalid.join(', ')}.`,
          ),
        )
      }
      if (findDuplicates(clovers).length > 0) {
        errors.push(
          err('EXTRA_INVALID', `Trevos repetidos: ${findDuplicates(clovers).join(', ')}.`),
        )
      }
      return
    }
    case 'MONTH': {
      const month = extra.kind === 'MONTH' ? extra.month : Number.NaN
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        errors.push(err('EXTRA_INVALID', `Mês da Sorte deve estar entre 1 e 12; veio ${month}.`))
      }
      return
    }
    case 'TEAM': {
      const teamId = extra.kind === 'TEAM' ? extra.teamId : ''
      if (typeof teamId !== 'string' || teamId.trim().length === 0) {
        errors.push(err('EXTRA_INVALID', 'Time do Coração é obrigatório.'))
      }
      return
    }
  }
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

export function validateBet(config: LotteryConfig, bet: BetInput): ValidationResult {
  const errors: ValidationError[] = []

  if (bet.lottery !== config.slug) {
    errors.push(
      err(
        'FORMAT_MISMATCH',
        `Aposta é de "${bet.lottery}" mas foi validada contra a config de "${config.slug}".`,
      ),
    )
  }

  if (config.format === 'PICK_N') validatePickN(config, bet, errors)
  else validateColumns(config, bet, errors)

  validateExtra(config, bet, errors)

  if (errors.length === 0 && resolvePrice(config, bet) === null) {
    errors.push(
      err('NO_PRICE_TIER', `Não há faixa de preço vigente para esta aposta de ${config.name}.`),
    )
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

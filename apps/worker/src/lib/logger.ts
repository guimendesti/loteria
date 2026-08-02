/**
 * Log estruturado mínimo — um JSON por linha em stdout/stderr, sem dependência externa.
 * Facilita agregação em Railway/Sentry sem acoplar o worker a um SDK de logging ainda.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

/** `JSON.stringify` não serializa `bigint`/`Error` de forma útil — normalizamos antes. */
function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function serializeFields(fields: LogFields | undefined): LogFields {
  if (!fields) return {}
  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = normalize(value)
  }
  return out
}

export function createLogger(component: string): Logger {
  const write = (level: LogLevel, msg: string, fields?: LogFields): void => {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      component,
      msg,
      ...serializeFields(fields),
    })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  }
}

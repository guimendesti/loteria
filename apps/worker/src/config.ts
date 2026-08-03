/**
 * Configuração do worker — validação de ambiente com Zod.
 *
 * Regra do projeto (docs/06 e CLAUDE.md): nada de segredo/URL de infraestrutura sem
 * validação. `loadConfig` falha ALTO (lança `ConfigError` com todas as mensagens juntas)
 * em vez de deixar `undefined` vazar para dentro do ioredis/Prisma e falhar de forma
 * obscura minutos depois. Chamado uma única vez, no bootstrap (`src/index.ts`).
 */
import { z } from 'zod'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

/** Aceita boolean nativo (testes) ou string de env var; aplica `defaultValue` quando ausente. */
function booleanEnv(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (TRUE_VALUES.has(normalized)) return true
    if (FALSE_VALUES.has(normalized)) return false
    // Deixa passar o valor original — o `z.boolean()` abaixo rejeita com mensagem clara.
    return value
  }, z.boolean())
}

function portEnv(defaultValue: number) {
  return z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(1).max(65535),
  )
}

const envSchema = z.object({
  REDIS_URL: z
    .string({ required_error: 'REDIS_URL é obrigatório (ex.: redis://localhost:6379)' })
    .min(1, 'REDIS_URL não pode ser vazio')
    .url('REDIS_URL deve ser uma URL válida (ex.: redis://user:pass@host:6379)'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL é obrigatório (ex.: postgresql://user:pass@host:5432/db)' })
    .min(1, 'DATABASE_URL não pode ser vazio')
    .url('DATABASE_URL deve ser uma URL válida (ex.: postgresql://user:pass@host:5432/db)'),
  SYNC_ENABLED: booleanEnv(true),
  HEALTH_PORT: portEnv(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // SY-04 — canal de e-mail (packages/integrations/src/notify/resend.ts). API HTTP pura via
  // fetch, sem SDK — só precisa da chave, nenhuma dependência nova a instalar.
  RESEND_API_KEY: z
    .string({ required_error: 'RESEND_API_KEY é obrigatório (Resend — canal de e-mail, SY-04)' })
    .min(1, 'RESEND_API_KEY não pode ser vazio'),
  EMAIL_FROM: z
    .string({
      required_error:
        'EMAIL_FROM é obrigatório (remetente das notificações por e-mail, ex.: "LotoPro <notificacoes@lotopro.com.br>")',
    })
    .min(1, 'EMAIL_FROM não pode ser vazio'),
  // SY-09 — dunning consulta o Asaas. OPCIONAL: sem a chave, o job de dunning não é
  // registrado (bootstrap loga aviso) — permite rodar o worker em dev sem conta Asaas.
  ASAAS_API_KEY: z.string().min(1).optional(),
  // SY-04 — Web Push (VAPID). OPCIONAIS como grupo: com os três presentes usa
  // WebPushSender real; faltando qualquer um, cai no NoopPushSender (aviso no boot).
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
})

export type WorkerConfig = z.infer<typeof envSchema>

export class ConfigError extends Error {
  constructor(issues: string) {
    super(`Configuração inválida do worker LotoPro:\n${issues}\n\nConfira o .env (ver docs/06-arquitetura-tecnica.md).`)
    this.name = 'ConfigError'
  }
}

/**
 * Valida `process.env` (ou um objeto injetado, útil em teste) contra o schema acima.
 * @throws {ConfigError} com uma linha por variável inválida/ausente.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n')
    throw new ConfigError(issues)
  }
  return result.data
}

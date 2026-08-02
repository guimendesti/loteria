import { describe, expect, it } from 'vitest'
import { NotificationChannel, NotificationStatus, Prisma } from '@lotopro/db'
import type { EmailMessage, EmailSendResult, EmailSender, PushMessage, PushSendResult, PushSender } from '@lotopro/integrations'
import { EmailSendError } from '@lotopro/integrations'
import {
  createNotifyJob,
  isInQuietHours,
  type NotifyPrisma,
  type NotifyPrismaNotificationCreateData,
  type NotifyPrismaPreferenceRow,
  type NotifyPrismaPushSubscriptionRow,
  type NotifyPrismaUserRow,
} from '../src/jobs/notify'
import type { NotifyJobData } from '../src/queues'

// ─── Duplo em memória de Prisma ────────────────────────────────────────────────

interface StoredNotification extends NotifyPrismaNotificationCreateData {
  id: string
}

function createFakeDb() {
  const users = new Map<string, NotifyPrismaUserRow>()
  const preferences = new Map<string, NotifyPrismaPreferenceRow>()
  const pushSubscriptions = new Map<string, NotifyPrismaPushSubscriptionRow[]>()
  const notifications: StoredNotification[] = []
  let nextId = 1

  /** Espelha o filtro `payload.dedupeKey` do adapter real (ver `lib/prisma-adapters.ts`). */
  function readDedupeKey(payload: Prisma.InputJsonValue | typeof Prisma.JsonNull): string | undefined {
    if (payload && typeof payload === 'object' && 'dedupeKey' in payload) {
      const value = (payload as Record<string, unknown>)['dedupeKey']
      return typeof value === 'string' ? value : undefined
    }
    return undefined
  }

  const prisma: NotifyPrisma = {
    user: {
      findUnique: async ({ where }) => users.get(where.id) ?? null,
    },
    notificationPreference: {
      findUnique: async ({ where }) => preferences.get(where.userId) ?? null,
    },
    pushSubscription: {
      findMany: async ({ where }) => pushSubscriptions.get(where.userId) ?? [],
    },
    notification: {
      findFirst: async ({ where }) => {
        const match = notifications.find(
          (n) => n.userId === where.userId && n.type === where.type && readDedupeKey(n.payload) === where.dedupeKey,
        )
        return match ? { id: match.id } : null
      },
      create: async ({ data }) => {
        const id = `notif-${nextId++}`
        notifications.push({ ...data, id })
        return { id }
      },
    },
  }

  return { prisma, users, preferences, pushSubscriptions, notifications }
}

function fakeEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    name: 'fake',
    sent,
    send: async (message: EmailMessage): Promise<EmailSendResult> => {
      sent.push(message)
      return { providerId: `email-${sent.length}` }
    },
  }
}

function failingEmailSender(message = 'falha simulada'): EmailSender {
  return {
    name: 'fake-failing',
    send: async () => {
      throw new EmailSendError(message)
    },
  }
}

function fakePushSender(result: PushSendResult): PushSender & { sent: PushMessage[] } {
  const sent: PushMessage[] = []
  return {
    name: 'fake-push',
    sent,
    send: async (message: PushMessage) => {
      sent.push(message)
      return result
    },
  }
}

const USER_ID = 'user-1'

function baseJob(overrides: Partial<NotifyJobData> = {}): NotifyJobData {
  return {
    userId: USER_ID,
    type: 'bet.checked',
    title: 'Concurso 3040 da Mega-Sena conferido',
    body: '1 aposta(s) conferida(s) — sem premiação desta vez.',
    payload: { lotterySlug: 'megasena', contestNumber: 3040, totalPrizeCents: '0', betCount: 1, prizedBetCount: 0, hits: 0 },
    ...overrides,
  }
}

// ─── isInQuietHours — função pura (item b) ─────────────────────────────────────

describe('isInQuietHours', () => {
  it('janela que NÃO cruza meia-noite: dentro e fora', () => {
    // 10:00–18:00 America/Sao_Paulo (-03:00)
    expect(isInQuietHours(new Date('2026-08-04T13:30:00-03:00'), '10:00', '18:00')).toBe(true)
    expect(isInQuietHours(new Date('2026-08-04T09:59:00-03:00'), '10:00', '18:00')).toBe(false)
    expect(isInQuietHours(new Date('2026-08-04T18:00:00-03:00'), '10:00', '18:00')).toBe(false) // fim exclusivo
    expect(isInQuietHours(new Date('2026-08-04T10:00:00-03:00'), '10:00', '18:00')).toBe(true) // início inclusivo
  })

  it('janela que CRUZA meia-noite: 22:00–06:00', () => {
    expect(isInQuietHours(new Date('2026-08-04T23:30:00-03:00'), '22:00', '06:00')).toBe(true)
    expect(isInQuietHours(new Date('2026-08-05T02:00:00-03:00'), '22:00', '06:00')).toBe(true)
    expect(isInQuietHours(new Date('2026-08-04T22:00:00-03:00'), '22:00', '06:00')).toBe(true) // início inclusivo
    expect(isInQuietHours(new Date('2026-08-05T06:00:00-03:00'), '22:00', '06:00')).toBe(false) // fim exclusivo
    expect(isInQuietHours(new Date('2026-08-04T12:00:00-03:00'), '22:00', '06:00')).toBe(false) // meio do dia — fora
  })

  it('start === end: trata como "sem silêncio" (config ambígua não deve silenciar 24h)', () => {
    expect(isInQuietHours(new Date('2026-08-04T12:00:00-03:00'), '10:00', '10:00')).toBe(false)
  })

  it('horário inválido devolve false em vez de lançar', () => {
    expect(isInQuietHours(new Date(), 'nope', '10:00')).toBe(false)
  })
})

// ─── notify job ────────────────────────────────────────────────────────────────

describe('createNotifyJob', () => {
  it('grava IN_APP sempre, com status SENT', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: fakePushSender({ ok: false }) })

    const result = await job(baseJob())

    const inApp = result.channels.find((c) => c.channel === NotificationChannel.IN_APP)
    expect(inApp).toMatchObject({ status: NotificationStatus.SENT, deduped: false })
  })

  it('onlyWhenPrized + prêmio 0: só IN_APP é gravado, e-mail/push não são tentados', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.preferences.set(USER_ID, {
      emailEnabled: true,
      pushEnabled: true,
      onlyWhenPrized: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    const result = await job(baseJob({ type: 'bet.checked', payload: { ...baseJob().payload, totalPrizeCents: '0' } }))

    expect(result.channels).toHaveLength(1)
    expect(result.channels[0]?.channel).toBe(NotificationChannel.IN_APP)
    expect(email.sent).toHaveLength(0)
  })

  it('onlyWhenPrized + prêmio > 0 (bet.prized): segue normalmente para e-mail', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.preferences.set(USER_ID, {
      emailEnabled: true,
      pushEnabled: false,
      onlyWhenPrized: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    const result = await job(
      baseJob({
        type: 'bet.prized',
        payload: { lotterySlug: 'megasena', contestNumber: 3040, totalPrizeCents: '5000', hits: 6 },
      }),
    )

    expect(result.channels.some((c) => c.channel === NotificationChannel.EMAIL)).toBe(true)
    expect(email.sent).toHaveLength(1)
  })

  it('horário de silêncio: suprime e-mail/push, mantém IN_APP', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.preferences.set(USER_ID, {
      emailEnabled: true,
      pushEnabled: true,
      onlyWhenPrized: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
    })
    const email = fakeEmailSender()
    // 23:00 America/Sao_Paulo cai dentro de 22:00–06:00
    const job = createNotifyJob({
      prisma: db.prisma,
      emailSender: email,
      pushSender: fakePushSender({ ok: false }),
      now: () => new Date('2026-08-04T23:00:00-03:00'),
    })

    const result = await job(baseJob())

    expect(result.channels).toHaveLength(1)
    expect(result.channels[0]?.channel).toBe(NotificationChannel.IN_APP)
    expect(email.sent).toHaveLength(0)
  })

  it('fora do horário de silêncio: e-mail é enviado normalmente', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.preferences.set(USER_ID, {
      emailEnabled: true,
      pushEnabled: false,
      onlyWhenPrized: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
    })
    const email = fakeEmailSender()
    const job = createNotifyJob({
      prisma: db.prisma,
      emailSender: email,
      pushSender: fakePushSender({ ok: false }),
      now: () => new Date('2026-08-04T15:00:00-03:00'),
    })

    await job(baseJob())

    expect(email.sent).toHaveLength(1)
  })

  it('e-mail: template bet.prized com texto EXATO de docs/09 §9.6', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'bet.prized',
        payload: { lotterySlug: 'lotofacil', contestNumber: 3697, totalPrizeCents: '123456', hits: 14 },
      }),
    )

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('🎉 Você foi premiado na Lotofácil!')
    expect(email.sent[0]?.text).toBe('Acertou 14 números no concurso 3697. Confira o valor.')
  })

  it('e-mail sem template dedicado (payload insuficiente) cai no fallback title/body', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(baseJob({ type: 'pool.bet_placed', title: 'Bolão apostado', body: 'Confira o comprovante.', payload: undefined }))

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('Bolão apostado')
    expect(email.sent[0]?.text).toBe('Confira o comprovante.')
  })

  it('e-mail falha (EmailSendError): grava FAILED com a mensagem do erro', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const job = createNotifyJob({
      prisma: db.prisma,
      emailSender: failingEmailSender('Resend respondeu HTTP 429'),
      pushSender: fakePushSender({ ok: false }),
    })

    const result = await job(baseJob())

    const emailOutcome = result.channels.find((c) => c.channel === NotificationChannel.EMAIL)
    expect(emailOutcome?.status).toBe(NotificationStatus.FAILED)
    const stored = db.notifications.find((n) => n.id === emailOutcome?.notificationId)
    expect(stored?.error).toBe('Resend respondeu HTTP 429')
  })

  it('usuário sem e-mail cadastrado: EMAIL falha sem chamar o sender', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: '' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    const result = await job(baseJob())

    expect(email.sent).toHaveLength(0)
    const emailOutcome = result.channels.find((c) => c.channel === NotificationChannel.EMAIL)
    expect(emailOutcome?.status).toBe(NotificationStatus.FAILED)
  })

  it('push: sem PushSubscription cadastrada, nenhuma linha PUSH é criada', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const push = fakePushSender({ ok: false })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    const result = await job(baseJob())

    expect(result.channels.some((c) => c.channel === NotificationChannel.PUSH)).toBe(false)
    expect(push.sent).toHaveLength(0)
  })

  it('push: com subscription, NoopPushSender-like (ok:false) grava FAILED', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.pushSubscriptions.set(USER_ID, [{ endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }])
    const push = fakePushSender({ ok: false, error: 'push não configurado' })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    const result = await job(baseJob())

    const pushOutcome = result.channels.find((c) => c.channel === NotificationChannel.PUSH)
    expect(pushOutcome?.status).toBe(NotificationStatus.FAILED)
    const stored = db.notifications.find((n) => n.id === pushOutcome?.notificationId)
    expect(stored?.error).toBe('push não configurado')
  })

  it('push: sucesso grava SENT', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.pushSubscriptions.set(USER_ID, [{ endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }])
    const push = fakePushSender({ ok: true })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    const result = await job(baseJob())

    const pushOutcome = result.channels.find((c) => c.channel === NotificationChannel.PUSH)
    expect(pushOutcome?.status).toBe(NotificationStatus.SENT)
    expect(push.sent).toHaveLength(1)
  })
})

// ─── Idempotência (P4) — segunda execução não duplica nem reenvia ─────────────

describe('createNotifyJob — dedupe (P4)', () => {
  it('reprocessar o MESMO job (retry) não cria uma segunda linha nem reenvia e-mail', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    const data = baseJob({
      type: 'bet.prized',
      payload: { lotterySlug: 'megasena', contestNumber: 3040, totalPrizeCents: '5000', hits: 6 },
    })

    const first = await job(data)
    const second = await job(data) // simula retry do BullMQ com o mesmo `job.data`

    expect(email.sent).toHaveLength(1) // não reenviou
    expect(db.notifications).toHaveLength(first.channels.length) // não duplicou linhas

    const firstEmail = first.channels.find((c) => c.channel === NotificationChannel.EMAIL)
    const secondEmail = second.channels.find((c) => c.channel === NotificationChannel.EMAIL)
    expect(secondEmail?.deduped).toBe(true)
    expect(secondEmail?.notificationId).toBe(firstEmail?.notificationId)
  })

  it('eventos DIFERENTES (concurso diferente) para o mesmo usuário não são deduplicados entre si', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(baseJob({ type: 'bet.prized', payload: { lotterySlug: 'megasena', contestNumber: 3040, totalPrizeCents: '5000', hits: 6 } }))
    await job(baseJob({ type: 'bet.prized', payload: { lotterySlug: 'megasena', contestNumber: 3041, totalPrizeCents: '5000', hits: 6 } }))

    expect(email.sent).toHaveLength(2)
  })
})

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
      // P4a — espelha `deleteMany` idempotente por `endpoint` (não lança se não achar nada),
      // varrendo todos os usuários (o adapter real filtra só por `endpoint`, que é @unique).
      deleteMany: async ({ where }) => {
        for (const [userId, subs] of pushSubscriptions) {
          const filtered = subs.filter((s) => s.endpoint !== where.endpoint)
          if (filtered.length !== subs.length) pushSubscriptions.set(userId, filtered)
        }
        return { count: 0 }
      },
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

  // ─── P4a — subscription morta (404/410) ───────────────────────────────────────

  it('push: subscription morta (shouldDeleteSubscription) é apagada e NÃO grava Notification FAILED', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.pushSubscriptions.set(USER_ID, [{ endpoint: 'https://push.example/dead', p256dh: 'p', auth: 'a' }])
    const push = fakePushSender({ ok: false, error: 'gone:410', shouldDeleteSubscription: true })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    const result = await job(baseJob())

    expect(result.channels.some((c) => c.channel === NotificationChannel.PUSH)).toBe(false)
    expect(db.pushSubscriptions.get(USER_ID)).toEqual([])
    expect(db.notifications.some((n) => n.channel === NotificationChannel.PUSH)).toBe(false)
  })

  it('push: fallback por prefixo "gone:" no error (sem o campo tipado) também apaga a subscription', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.pushSubscriptions.set(USER_ID, [{ endpoint: 'https://push.example/dead2', p256dh: 'p', auth: 'a' }])
    const push = fakePushSender({ ok: false, error: 'gone:404' })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    const result = await job(baseJob())

    expect(result.channels.some((c) => c.channel === NotificationChannel.PUSH)).toBe(false)
    expect(db.pushSubscriptions.get(USER_ID)).toEqual([])
  })

  it('push: depois da subscription morta apagada, um retry (mesmo dedupeKey) não tenta enviar de novo', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    db.pushSubscriptions.set(USER_ID, [{ endpoint: 'https://push.example/dead3', p256dh: 'p', auth: 'a' }])
    const push = fakePushSender({ ok: false, error: 'gone:410', shouldDeleteSubscription: true })
    const job = createNotifyJob({ prisma: db.prisma, emailSender: fakeEmailSender(), pushSender: push })

    await job(baseJob())
    await job(baseJob()) // retry do BullMQ com o mesmo job.data

    // 1ª chamada: subscription existe, pushSender.send é chamado (devolve "gone") e apaga a
    // linha. 2ª chamada: subscription já não existe, cai no early-return de "sem subscription"
    // (subscriptions.length === 0) — pushSender.send NÃO é chamado de novo.
    expect(push.sent).toHaveLength(1)
    expect(db.notifications.some((n) => n.channel === NotificationChannel.PUSH)).toBe(false)
  })
})

// ─── P4b — templates de billing roteados (antes caíam no fallback genérico) ─────

describe('createNotifyJob — templates de billing (P4b)', () => {
  it('billing.payment_failed: e-mail usa o texto EXATO de docs/09 §9.6 ("Cobrança falhou")', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'billing.payment_failed',
        title: 'Não conseguimos confirmar o pagamento da sua assinatura',
        body: 'texto inline do job (billing-dunning.ts) — não deve aparecer no e-mail',
        payload: { invoiceId: 'inv-1', amountCents: '9990', daysOverdue: 3, downgradeInDays: 4 },
      }),
    )

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('Não conseguimos renovar sua assinatura')
    expect(email.sent[0]?.text).toBe('Atualize seu meio de pagamento para continuar no Premium.')
  })

  it('billing.downgraded: roteia pelo `reason` do payload (ex.: payment_failed)', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'billing.downgraded',
        title: 'Seu plano agora é Grátis',
        body: 'texto inline do job',
        payload: { reason: 'payment_failed', planSlug: 'free', targetPlanName: 'Grátis' },
      }),
    )

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('Seu plano agora é Grátis')
    expect(email.sent[0]?.text).toBe(
      'Como a cobrança não foi confirmada, seu acesso passou para o plano Grátis. ' +
        'Nenhum dado foi apagado: seus jogos e seu histórico continuam disponíveis.',
    )
  })

  it('billing.trial_ended: roteia para o template dedicado', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'billing.trial_ended',
        title: 'Seu plano agora é Grátis',
        body: 'texto inline do job',
        payload: { reason: 'trial_ended', planSlug: 'free', targetPlanName: 'Grátis' },
      }),
    )

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('Seu plano agora é Grátis')
    expect(email.sent[0]?.text).toBe(
      'Seu período de teste terminou e você voltou para o plano Grátis. ' +
        'Nenhum dado foi apagado: seus jogos e seu histórico continuam disponíveis.',
    )
  })

  it('billing.downgraded sem `reason`/`targetPlanName` no payload cai no fallback title/body', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'user@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'billing.downgraded',
        title: 'Título inline do job',
        body: 'Corpo inline do job',
        payload: undefined,
      }),
    )

    expect(email.sent[0]?.subject).toBe('Título inline do job')
    expect(email.sent[0]?.text).toBe('Corpo inline do job')
  })
})

describe('createNotifyJob — templates de bolão (Onda 8, pool-notify.ts)', () => {
  it('pool.member_joined: e-mail usa o texto EXATO de docs/09 §9.6 ("Bolão — pagamento")', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'owner@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.member_joined',
        title: 'texto inline do job — não deve aparecer no e-mail',
        body: 'texto inline do job',
        payload: { poolId: 'pool-1', poolName: 'Escritório', poolMemberId: 'member-1', memberName: 'João', shares: 2 },
      }),
    )

    expect(email.sent).toHaveLength(1)
    expect(email.sent[0]?.subject).toBe('João entrou no bolão "Escritório"')
    expect(email.sent[0]?.text).toBe('2 cotas · aguardando pagamento.')
  })

  it('pool.payment_declared: e-mail usa o template dedicado', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'owner@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.payment_declared',
        title: 'inline',
        body: 'inline',
        payload: { poolId: 'pool-1', poolName: 'Escritório', memberName: 'João', amountCents: '5000' },
      }),
    )

    expect(email.sent[0]?.subject).toBe('João declarou pagamento no bolão "Escritório"')
    expect(email.sent[0]?.text).toBe('Confirme o recebimento para liberar a cota.')
  })

  it('pool.payment_confirmed: e-mail usa o template dedicado', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'membro@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.payment_confirmed',
        title: 'inline',
        body: 'inline',
        payload: { poolId: 'pool-1', poolName: 'Escritório', amountCents: '5000' },
      }),
    )

    expect(email.sent[0]?.subject).toBe('Pagamento confirmado no bolão "Escritório"')
    expect(email.sent[0]?.text).toBe('Você já está garantido nessa aposta.')
  })

  it('pool.receipt_attached: e-mail usa o texto EXATO de docs/09 §9.6 ("Bolão — apostado")', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'membro@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.receipt_attached',
        title: 'inline',
        body: 'inline',
        payload: { poolId: 'pool-1', poolName: 'Escritório' },
      }),
    )

    expect(email.sent[0]?.subject).toBe('Bolão "Escritório" apostado ✅')
    expect(email.sent[0]?.text).toBe('O comprovante já está disponível para todos.')
  })

  it('pool.prized: e-mail usa o texto EXATO de docs/09 §9.6 ("Bolão — premiado")', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'membro@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.prized',
        title: 'inline',
        body: 'inline',
        payload: { poolId: 'pool-1', poolName: 'Escritório', contestNumber: 2900, amountCents: '34000' },
      }),
    )

    expect(email.sent[0]?.subject).toBe('🎉 O bolão "Escritório" foi premiado!')
    expect(email.sent[0]?.text).toBe('Sua parte: R$ 340,00. Veja o rateio.')
  })

  it('payload sem os campos exigidos cai no fallback title/body (mesma regra de billing.*)', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'membro@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.prized',
        title: 'Título inline do job',
        body: 'Corpo inline do job',
        payload: { poolId: 'pool-1' }, // sem poolName/amountCents
      }),
    )

    expect(email.sent[0]?.subject).toBe('Título inline do job')
    expect(email.sent[0]?.text).toBe('Corpo inline do job')
  })

  it('dedupeScope: dois eventos pool.* DIFERENTES do MESMO usuário não colidem (P4, Onda 8)', async () => {
    // Sem `dedupeScope`, `type:userId:channel` seria idêntico para dois bolões distintos do
    // mesmo organizador — o segundo pareceria um retry do primeiro e seria suprimido. Este é
    // exatamente o bug que `payload.dedupeScope` (buildDedupeKey) resolve.
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'owner@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    await job(
      baseJob({
        type: 'pool.member_joined',
        title: 'inline',
        body: 'inline',
        payload: {
          poolId: 'pool-A',
          poolName: 'Bolão A',
          poolMemberId: 'member-A',
          memberName: 'Ana',
          shares: 1,
          dedupeScope: 'member:member-A',
        },
      }),
    )
    await job(
      baseJob({
        type: 'pool.member_joined',
        title: 'inline',
        body: 'inline',
        payload: {
          poolId: 'pool-B',
          poolName: 'Bolão B',
          poolMemberId: 'member-B',
          memberName: 'Bruno',
          shares: 1,
          dedupeScope: 'member:member-B',
        },
      }),
    )

    expect(email.sent).toHaveLength(2) // ambos enviados — não é o mesmo evento
    expect(email.sent[0]?.subject).toBe('Ana entrou no bolão "Bolão A"')
    expect(email.sent[1]?.subject).toBe('Bruno entrou no bolão "Bolão B"')
  })

  it('dedupeScope: reenviar o MESMO evento (mesmo dedupeScope) ainda deduplica normalmente', async () => {
    const db = createFakeDb()
    db.users.set(USER_ID, { id: USER_ID, email: 'owner@example.com' })
    const email = fakeEmailSender()
    const job = createNotifyJob({ prisma: db.prisma, emailSender: email, pushSender: fakePushSender({ ok: false }) })

    const data = baseJob({
      type: 'pool.member_joined',
      title: 'inline',
      body: 'inline',
      payload: {
        poolId: 'pool-A',
        poolName: 'Bolão A',
        poolMemberId: 'member-A',
        memberName: 'Ana',
        shares: 1,
        dedupeScope: 'member:member-A',
      },
    })

    await job(data)
    await job(data) // retry do mesmo evento

    expect(email.sent).toHaveLength(1)
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

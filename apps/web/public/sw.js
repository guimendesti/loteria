/**
 * P5 — Service worker MÍNIMO para Web Push (docs/08 SY-04, docs/09 §9.6).
 *
 * Escopo deliberadamente pequeno: só os dois listeners que a Push API exige para mostrar
 * uma notificação e reagir ao clique. NÃO é um service worker de cache/offline completo
 * (docs/08 F — "PWA: instalável, ícone, splash, push, offline básico" — o offline básico
 * fica para uma onda futura de PWA; registrar isso aqui cedo bloquearia o próprio push
 * atrás de uma estratégia de cache ainda não definida). `self.skipWaiting()` +
 * `clients.claim()` garantem que uma atualização deste arquivo assume o controle sem
 * esperar todas as abas fecharem — importante porque o push só funciona com o SW ativo.
 *
 * Payload esperado (JSON, montado por `WebPushSender.send`, packages/integrations/src/notify/webpush.ts):
 *   { "title": string, "body": string, "url"?: string }
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'LotoPro', body: 'Você tem uma notificação nova.' }

  if (event.data) {
    try {
      const parsed = event.data.json()
      payload = {
        title: typeof parsed.title === 'string' && parsed.title.length > 0 ? parsed.title : payload.title,
        body: typeof parsed.body === 'string' && parsed.body.length > 0 ? parsed.body : payload.body,
        ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      }
    } catch {
      // Payload não é JSON válido — mantém o fallback acima em vez de deixar o push
      // silenciosamente sem notificação nenhuma (um push sem `notification.show()` pode
      // levar o navegador a exibir um aviso genérico "algo mudou" pro usuário).
      const text = event.data.text()
      if (text) payload.body = text
    }
  }

  const { title, ...options } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body: options.body,
      // `data.url` carrega para onde `notificationclick` (abaixo) deve navegar.
      data: { url: options.url || '/app' },
      // Sem `icon`/`badge`: não há ícone de PWA em `public/` ainda (pendência de uma onda
      // de PWA futura — ver cabeçalho do arquivo). Referenciar um caminho inexistente aqui
      // só geraria 404 silencioso a cada push; o navegador já usa um ícone padrão razoável
      // na ausência de `icon`.
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Já tem uma aba do LotoPro aberta? Foca nela e navega, em vez de abrir uma nova aba
      // (evita acumular abas duplicadas a cada notificação clicada).
      for (const client of allClients) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch {
              // `navigate()` pode falhar (ex.: cliente sem essa API) — a aba já está
              // focada, o que já resolve a maior parte do valor do clique.
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })(),
  )
})

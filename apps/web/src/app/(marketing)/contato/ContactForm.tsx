'use client'

/**
 * LP-14 — Formulário de contato. Não existe endpoint de contato no backend
 * ainda (fora do território desta tarefa — `src/server` está sendo editado
 * por outros agentes em paralelo, ver ORQUESTRACAO.md). Até esse endpoint
 * existir, o envio abre o cliente de e-mail do visitante com os campos
 * preenchidos (`mailto:`) — funcional sem depender de backend novo.
 * TODO: trocar por `trpc.contact.send` (ou rota de API dedicada) quando existir.
 */
import { useState } from 'react'

const SUPPORT_EMAIL = 'suporte@lotopro.com.br'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = `Nome: ${name}\nE-mail: ${email}\n\n${message}`
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject || 'Contato pelo site')}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-ink-900">
          Nome
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-ink-900">
          E-mail
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="contact-subject" className="block text-sm font-medium text-ink-900">
          Assunto
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-ink-900">
          Mensagem
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-700 sm:w-auto"
      >
        Enviar mensagem
      </button>
    </form>
  )
}

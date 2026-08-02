'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { authClient } from '@/lib/auth-client'

/** AU-05 — recuperação de senha (token de uso único, TTL 30 min, definido no servidor). */
export default function RecuperarPage() {
  return (
    <Suspense fallback={null}>
      <RecuperarForm />
    </Suspense>
  )
}

function RecuperarForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  return token ? <ResetPasswordForm token={token} /> : <RequestResetForm />
}

function RequestResetForm() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/recuperar',
    })

    setIsSubmitting(false)

    if (requestError) {
      setError(requestError.message ?? 'Não foi possível enviar o e-mail de recuperação.')
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Verifique seu e-mail</h1>
        <p className="mt-3 text-sm text-ink-600">
          Se {email} tiver uma conta no LotoPro, enviamos um link para redefinir a senha. O link
          expira em 30 minutos.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Recuperar senha</h1>
      <p className="mt-1 text-sm text-ink-600">
        Informe seu e-mail para receber o link de redefinição.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Enviando…' : 'Enviar link de recuperação'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-600 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error: resetError } = await authClient.resetPassword({
      newPassword,
      token,
    })

    setIsSubmitting(false)

    if (resetError) {
      setError(resetError.message ?? 'Não foi possível redefinir sua senha. Peça um novo link.')
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Senha redefinida</h1>
        <p className="mt-3 text-sm text-ink-600">
          Sua senha foi alterada.{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Entrar agora
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Escolha uma nova senha</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-ink-900">
            Nova senha
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Salvando…' : 'Redefinir senha'}
        </button>
      </form>
    </div>
  )
}

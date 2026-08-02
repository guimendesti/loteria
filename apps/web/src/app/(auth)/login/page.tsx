'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/** AU-02 (login e-mail+senha) e AU-03 (login social Google). */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })

    setIsSubmitting(false)

    if (signInError) {
      setError(signInError.message ?? 'Não foi possível entrar. Confira e-mail e senha.')
      return
    }

    router.push('/app')
  }

  async function handleGoogleSignIn() {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/app' })
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Entrar</h1>
      <p className="mt-1 text-sm text-ink-600">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-semibold text-brand-700 hover:underline">
          Cadastre-se grátis
        </Link>
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-900">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-ink-400">
        <span className="h-px flex-1 bg-ink-200" aria-hidden="true" />
        ou
        <span className="h-px flex-1 bg-ink-200" aria-hidden="true" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="w-full rounded-md border border-ink-200 px-4 py-3 font-semibold text-ink-900 hover:bg-ink-50"
      >
        Entrar com Google
      </button>

      <p className="mt-6 text-center text-sm">
        <Link href="/recuperar" className="text-ink-600 hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </div>
  )
}

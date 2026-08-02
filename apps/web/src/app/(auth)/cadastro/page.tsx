'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/**
 * AU-01 — cadastro com e-mail + senha, com checkbox obrigatório de
 * maioridade (`isAdult`, persistido no User via additionalFields — ver
 * src/lib/auth.ts) e aceite dos termos.
 *
 * O aceite dos termos ainda não tem uma coluna própria no Prisma
 * (`packages/db`, fora do escopo desta tarefa) — por ora é só um bloqueio
 * client-side do submit; registrar o aceite com timestamp fica para quando
 * esse campo existir no schema.
 */
export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = isAdult && acceptedTerms && !isSubmitting

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!isAdult) {
      setError('É preciso declarar que você tem 18 anos ou mais para se cadastrar.')
      return
    }
    if (!acceptedTerms) {
      setError('É preciso aceitar os termos de uso para se cadastrar.')
      return
    }

    setIsSubmitting(true)
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      isAdult,
    })
    setIsSubmitting(false)

    if (signUpError) {
      setError(signUpError.message ?? 'Não foi possível criar sua conta.')
      return
    }

    router.push('/app')
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Criar conta grátis</h1>
      <p className="mt-1 text-sm text-ink-600">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink-900">
            Nome
          </label>
          <input
            id="name"
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
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-ink-400">Mínimo de 8 caracteres.</p>
        </div>

        <div className="space-y-3 border-t border-ink-200 pt-4">
          <label className="flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              required
              checked={isAdult}
              onChange={(e) => setIsAdult(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-200 text-brand-500 focus:ring-brand-500"
            />
            <span>Declaro ter 18 anos ou mais.</span>
          </label>

          <label className="flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-200 text-brand-500 focus:ring-brand-500"
            />
            <span>
              Li e aceito os{' '}
              <Link href="/termos" className="font-semibold text-brand-700 hover:underline">
                termos de uso
              </Link>{' '}
              e a{' '}
              <Link href="/privacidade" className="font-semibold text-brand-700 hover:underline">
                política de privacidade
              </Link>
              .
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Criando conta…' : 'Criar conta grátis'}
        </button>
      </form>
    </div>
  )
}

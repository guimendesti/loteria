'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { authClient } from '@/lib/auth-client'

/** Alguns fusos comuns no Brasil — sugestão via `<datalist>`; o campo aceita qualquer IANA TZ válida. */
const TIMEZONE_SUGGESTIONS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Fortaleza',
  'America/Belem',
  'America/Recife',
  'America/Noronha',
  'America/Cuiaba',
  'America/Campo_Grande',
] as const

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/**
 * CL-100 (perfil) + CL-101 (senha e 2FA) — docs/08 §C.8.
 *
 * Troca de senha chama `authClient.changePassword` DIRETO (sem passar pelo tRPC): o
 * endpoint `auth.api.changePassword` do Better Auth reautentica a sessão pelos headers/
 * cookie da requisição, que o contexto tRPC deste app não expõe (só `session` já
 * resolvido) — ver o comentário no topo de `server/routers/account.ts`. Mesmo padrão já
 * usado por `requestPasswordReset`/`resetPassword` em `lib/auth-client.ts`.
 *
 * 2FA: sem plugin `twoFactor` habilitado em `lib/auth.ts` e sem coluna de segredo TOTP no
 * schema — fora do território desta tarefa. Mostra aviso "em breve" em vez de simular.
 */
export default function ContaPage() {
  return (
    <div className="space-y-8">
      <ProfileSection />
      <SecuritySection />
    </div>
  )
}

function ProfileSection() {
  const utils = trpc.useUtils()
  const profileQuery = trpc.account.profile.get.useQuery()
  const updateMutation = trpc.account.profile.update.useMutation({
    onSuccess: () => {
      setStatus('Perfil atualizado com sucesso.')
      utils.account.profile.get.invalidate()
    },
    onError: (error) => setStatus(error.message),
  })

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [timezone, setTimezone] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!profileQuery.data || touched) return
    setName(profileQuery.data.name)
    setPhone(profileQuery.data.phone ?? '')
    setAvatarUrl(profileQuery.data.avatarUrl ?? '')
    setTimezone(profileQuery.data.timezone)
  }, [profileQuery.data, touched])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    updateMutation.mutate({
      name,
      phone: phone.trim() === '' ? null : phone.trim(),
      avatarUrl: avatarUrl.trim() === '' ? null : avatarUrl.trim(),
      timezone,
    })
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Perfil</h2>
      <p className="mt-1 text-sm text-ink-600">Nome, telefone, avatar e fuso horário (CL-100).</p>

      {profileQuery.isLoading ? (
        <p className="mt-4 text-sm text-ink-600">Carregando…</p>
      ) : (
        <form
          onSubmit={handleSubmit}
          onChange={() => setTouched(true)}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink-900">
              E-mail
            </label>
            <input id="email" value={profileQuery.data?.email ?? ''} disabled className={`${INPUT_CLASS} bg-ink-50 text-ink-400`} />
            <p className="mt-1 text-xs text-ink-400">O e-mail de acesso não é editável nesta tela.</p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink-900">
              Nome
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-ink-900">
              Telefone
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              maxLength={20}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-ink-900">
              Fuso horário
            </label>
            <input
              id="timezone"
              list="timezone-suggestions"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
              className={INPUT_CLASS}
            />
            <datalist id="timezone-suggestions">
              {TIMEZONE_SUGGESTIONS.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="avatarUrl" className="block text-sm font-medium text-ink-900">
              URL do avatar
            </label>
            <input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              maxLength={500}
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-ink-400">
              Ainda sem upload de imagem nesta tela — cole o link de uma imagem já hospedada.
            </p>
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {updateMutation.isPending ? 'Salvando…' : 'Salvar perfil'}
            </button>
            {status ? <p className="text-sm text-ink-600">{status}</p> : null}
          </div>
        </form>
      )}
    </section>
  )
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha.')
      return
    }

    setIsSubmitting(true)
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      // Sai de todos os outros dispositivos ao trocar a senha — reduz o risco de uma
      // sessão antiga (ex.: dispositivo perdido) continuar válida depois da troca.
      revokeOtherSessions: true,
    })
    setIsSubmitting(false)

    if (changeError) {
      setError(changeError.message ?? 'Não foi possível trocar a senha.')
      return
    }

    setSuccess('Senha alterada com sucesso.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Segurança</h2>
      <p className="mt-1 text-sm text-ink-600">Troque sua senha (CL-101).</p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:max-w-sm">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-ink-900">
            Senha atual
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-ink-900">
            Nova senha
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-900">
            Confirmar nova senha
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {success ? <p className="text-sm text-success">{success}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-fit rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>

      <div className="mt-6 border-t border-ink-200 pt-4">
        <h3 className="text-sm font-semibold text-ink-900">Autenticação em dois fatores</h3>
        <p className="mt-1 text-sm text-ink-600">
          Em breve. O 2FA ainda não está disponível — nenhuma configuração de segurança é perdida
          enquanto o recurso não chega.
        </p>
      </div>
    </section>
  )
}

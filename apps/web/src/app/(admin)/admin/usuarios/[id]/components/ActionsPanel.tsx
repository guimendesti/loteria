'use client'

/**
 * BO-12..15 — ações de atendimento/LGPD sobre um usuário. Cada mutation chama
 * `writeAudit` no servidor (`server/routers/admin/users.ts`); aqui só cuidamos de
 * formulário, feedback e invalidação de cache. `setRole`/`anonymize` só aparecem para
 * quem está com papel `ADMIN` NO CLIENTE (`useAdminRole`) — reforço de UX, não segurança:
 * o servidor recusa de qualquer forma quem não tem permissão (defesa real).
 */
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ConfirmDialog } from '@/components/pool/ConfirmDialog'
import { useAdminRole } from '../../../../components/AdminRoleContext'

const ROLE_OPTIONS = ['CUSTOMER', 'VIEWER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const
type RoleOption = (typeof ROLE_OPTIONS)[number]

/** JSON.stringify não serializa `bigint` — troca por string só no arquivo baixado. */
function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([stringifyWithBigInt(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function ActionResult({ message, tone }: { message: string; tone: 'success' | 'error' }) {
  return <p className={`mt-2 text-sm ${tone === 'success' ? 'text-success' : 'text-danger'}`}>{message}</p>
}

export function ActionsPanel({ userId, blockedAt }: { userId: string; blockedAt: Date | null }) {
  const adminRole = useAdminRole()
  const utils = trpc.useUtils()

  const invalidateDetail = () => {
    utils.admin.users.detail.invalidate({ userId })
    utils.admin.users.list.invalidate()
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <SetPlanCard userId={userId} onDone={invalidateDetail} />
      <GrantTrialCard userId={userId} onDone={invalidateDetail} />
      <BlockCard userId={userId} blockedAt={blockedAt} onDone={invalidateDetail} />
      <ExportDataCard userId={userId} />
      {adminRole === 'ADMIN' ? <SetRoleCard userId={userId} onDone={invalidateDetail} /> : null}
      {adminRole === 'ADMIN' ? <AnonymizeCard userId={userId} onDone={invalidateDetail} /> : null}
    </div>
  )
}

function ActionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="font-display text-sm font-semibold text-ink-900">{title}</p>
      <p className="mt-1 text-xs text-ink-600">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function SetPlanCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [planSlug, setPlanSlug] = useState('')
  const [reason, setReason] = useState('')
  const mutation = trpc.admin.users.setPlan.useMutation({ onSuccess: onDone })

  return (
    <ActionCard title="Trocar plano manualmente" description="BO-12 — exige justificativa; gera auditoria.">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ userId, planSlug: planSlug.trim(), reason })
        }}
        className="flex flex-col gap-2"
      >
        <input
          type="text"
          value={planSlug}
          onChange={(event) => setPlanSlug(event.target.value)}
          placeholder="slug do plano (ex.: premium)"
          required
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Justificativa (mínimo 10 caracteres)"
          required
          rows={2}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Salvando…' : 'Trocar plano'}
        </button>
      </form>
      {mutation.isSuccess ? <ActionResult tone="success" message="Plano atualizado." /> : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

function GrantTrialCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const mutation = trpc.admin.users.grantTrial.useMutation({ onSuccess: onDone })

  return (
    <ActionCard title="Conceder trial" description="BO-12 — 14 dias do plano Pro, sem cobrança.">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ userId, reason })
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Justificativa (mínimo 10 caracteres)"
          required
          rows={2}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Salvando…' : 'Conceder trial'}
        </button>
      </form>
      {mutation.isSuccess ? <ActionResult tone="success" message="Trial concedido." /> : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

function SetRoleCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [role, setRole] = useState<RoleOption>('CUSTOMER')
  const [reason, setReason] = useState('')
  const mutation = trpc.admin.users.setRole.useMutation({ onSuccess: onDone })

  return (
    <ActionCard title="Trocar papel (só ADMIN)" description="D.1 — gestão de usuários admin.">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ userId, role, reason })
        }}
        className="flex flex-col gap-2"
      >
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as RoleOption)}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Justificativa (mínimo 10 caracteres)"
          required
          rows={2}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="self-start rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Salvando…' : 'Trocar papel'}
        </button>
      </form>
      {mutation.isSuccess ? <ActionResult tone="success" message="Papel atualizado." /> : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

/**
 * BO-13 — bloqueio/desbloqueio real: revoga sessões ativas e impede login enquanto
 * bloqueado (`server/trpc.ts` + `lib/auth.ts`, fora deste componente). O rótulo/ação do
 * botão reflete o estado ATUAL (`blockedAt`, vindo de `admin.users.detail` — o pai
 * re-renderiza com o valor novo assim que `onDone` invalida a query, então o botão já
 * nasce correto na próxima interação). Confirmação via `ConfirmDialog` (mesmo componente
 * de `components/pool/ConfirmDialog.tsx`, já usado em ações destrutivas de bolão) —
 * bloquear desconecta o usuário na hora, por isso pede confirmação explícita mesmo sem o
 * peso de uma ação irreversível como `anonymize`.
 */
function BlockCard({ userId, blockedAt, onDone }: { userId: string; blockedAt: Date | null; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const mutation = trpc.admin.users.toggleBlock.useMutation({
    onSuccess: () => {
      setReason('')
      onDone()
    },
  })
  const isBlocked = blockedAt !== null

  return (
    <ActionCard
      title={isBlocked ? 'Desbloquear conta' : 'Bloquear conta'}
      description="BO-13 — revoga sessões ativas e impede login enquanto bloqueada; gera auditoria."
    >
      <div className="flex flex-col gap-2">
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo (opcional)"
          rows={2}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={mutation.isPending}
          className={
            isBlocked
              ? 'self-start rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50'
              : 'self-start rounded-md border border-danger px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50'
          }
        >
          {mutation.isPending ? 'Executando…' : isBlocked ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          title={isBlocked ? 'Desbloquear esta conta?' : 'Bloquear esta conta?'}
          description={
            isBlocked
              ? 'O usuário volta a conseguir fazer login normalmente.'
              : 'As sessões ativas são encerradas imediatamente e o login fica recusado até um administrador desbloquear.'
          }
          confirmLabel={isBlocked ? 'Desbloquear' : 'Bloquear'}
          destructive={!isBlocked}
          isLoading={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            mutation.mutate({ userId, blocked: !isBlocked, ...(reason.trim() ? { reason: reason.trim() } : {}) })
          }}
        />
      ) : null}

      {mutation.isSuccess ? (
        <ActionResult
          tone="success"
          message={mutation.data.blocked ? 'Conta bloqueada.' : 'Conta desbloqueada.'}
        />
      ) : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

function ExportDataCard({ userId }: { userId: string }) {
  const mutation = trpc.admin.users.exportData.useMutation({
    onSuccess: (data) => downloadJson(`lotopro-usuario-${userId}.json`, data),
  })

  return (
    <ActionCard title="Exportar dados (LGPD)" description="BO-14 — baixa um JSON com os dados do usuário.">
      <button
        type="button"
        onClick={() => mutation.mutate({ userId })}
        disabled={mutation.isPending}
        className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-50"
      >
        {mutation.isPending ? 'Gerando…' : 'Exportar dados'}
      </button>
      {mutation.isSuccess ? <ActionResult tone="success" message="Arquivo baixado." /> : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

function AnonymizeCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = trpc.admin.users.anonymize.useMutation({ onSuccess: onDone })

  return (
    <ActionCard
      title="Anonimizar conta (só ADMIN)"
      description="BO-15 — LGPD, IRREVERSÍVEL. Preserva bolões/jogos de terceiros."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!confirmed) return
          mutation.mutate({ userId, reason })
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Justificativa (mínimo 10 caracteres)"
          required
          rows={2}
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que esta ação é irreversível.
        </label>
        <button
          type="submit"
          disabled={mutation.isPending || !confirmed}
          className="self-start rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Anonimizando…' : 'Anonimizar conta'}
        </button>
      </form>
      {mutation.isSuccess ? <ActionResult tone="success" message="Conta anonimizada." /> : null}
      {mutation.isError ? <ActionResult tone="error" message={mutation.error.message} /> : null}
    </ActionCard>
  )
}

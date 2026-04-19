'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import type { Role } from '@/lib/auth'
import {
  createMemberAction,
  removeMemberAction,
  resetPasswordAction,
  updateMemberRoleAction,
} from './actions'

export type MemberRow = {
  user_id: string
  role: Role
  created_at: string
  login: string
  display_name: string | null
  must_change_password: boolean
  is_self: boolean
}

export type UnboundPc = { id: string; title: string }

type ActionState = { error: string | null; success: string | null }

const initialState: ActionState = { error: null, success: null }

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  dm: 'ДМ',
  player: 'Игрок',
}

const ROLE_BADGE: Record<Role, { bg: string; fg: string }> = {
  owner: { bg: 'var(--amber-100, #fef3c7)', fg: 'var(--amber-700, #b45309)' },
  dm: { bg: 'var(--blue-50)', fg: 'var(--blue-700)' },
  player: { bg: 'var(--green-50)', fg: 'var(--green-700)' },
}

export function MembersClient({
  slug,
  members,
  canManage,
  unboundPcs,
}: {
  slug: string
  members: MemberRow[]
  canManage: boolean
  unboundPcs: UnboundPc[]
}) {
  return (
    <div className="flex flex-col gap-6">
      {canManage && <CreateMemberBlock slug={slug} unboundPcs={unboundPcs} />}
      <MembersTable slug={slug} members={members} canManage={canManage} />
    </div>
  )
}

// ────────────────────────────── Create ──────────────────────────────

function CreateMemberBlock({
  slug,
  unboundPcs,
}: {
  slug: string
  unboundPcs: UnboundPc[]
}) {
  const boundAction = createMemberAction.bind(null, slug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const [role, setRole] = useState<'dm' | 'player'>('dm')

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
      setRole('dm')
    }
  }, [state.success])

  return (
    <section
      className="rounded-[var(--radius-lg)] border p-4"
      style={{ borderColor: 'var(--gray-200)' }}
    >
      <h2 className="mb-3 text-[14px] font-semibold">Добавить участника</h2>

      <form
        ref={formRef}
        action={formAction}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
            Логин
          </span>
          <input
            name="login"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9_\-]{3,32}"
            placeholder="alex_dm"
            autoComplete="off"
            className="rounded-[var(--radius)] border px-3 py-2 font-mono text-[13px] outline-none"
            style={{ borderColor: 'var(--gray-300)' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
            Одноразовый пароль (≥8)
          </span>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            autoComplete="off"
            className="rounded-[var(--radius)] border px-3 py-2 font-mono text-[13px] outline-none"
            style={{ borderColor: 'var(--gray-300)' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
            Роль
          </span>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'dm' | 'player')}
            className="rounded-[var(--radius)] border px-3 py-2 text-[13px] outline-none"
            style={{ borderColor: 'var(--gray-300)' }}
          >
            <option value="dm">ДМ</option>
            <option value="player">Игрок</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="self-end rounded-[var(--radius)] px-3 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
          style={{ background: 'var(--blue-600)' }}
        >
          {pending ? 'Создаю…' : 'Добавить'}
        </button>

        {role === 'player' && (
          <label className="flex flex-col gap-1 sm:col-span-4">
            <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
              Привязать к PC (опционально)
            </span>
            <select
              name="bind_pc_id"
              defaultValue="__none__"
              className="rounded-[var(--radius)] border px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--gray-300)' }}
            >
              <option value="__none__">— не привязывать —</option>
              {unboundPcs.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.title}
                </option>
              ))}
            </select>
            {unboundPcs.length === 0 && (
              <span className="text-[10px]" style={{ color: 'var(--gray-500)' }}>
                Нет свободных PC-нод. Создай персонажа в каталоге или сними владельца на существующем.
              </span>
            )}
          </label>
        )}
      </form>

      {state.error && (
        <div
          className="mt-3 rounded-[var(--radius)] px-3 py-2 text-[12px]"
          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div
          className="mt-3 rounded-[var(--radius)] px-3 py-2 text-[12px]"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          ✓ {state.success}. Передай пароль пользователю — он сменит его при первом входе.
        </div>
      )}
    </section>
  )
}

// ────────────────────────────── Table ──────────────────────────────

function MembersTable({
  slug,
  members,
  canManage,
}: {
  slug: string
  members: MemberRow[]
  canManage: boolean
}) {
  return (
    <section
      className="rounded-[var(--radius-lg)] border"
      style={{ borderColor: 'var(--gray-200)' }}
    >
      <div
        className="border-b px-4 py-2 text-[12px] font-semibold uppercase tracking-wider"
        style={{ borderColor: 'var(--gray-200)', color: 'var(--gray-600)' }}
      >
        Список ({members.length})
      </div>

      <table className="w-full text-[13px]">
        <thead>
          <tr
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--gray-500)' }}
          >
            <th className="px-4 py-2 text-left font-medium">Логин</th>
            <th className="px-2 py-2 text-left font-medium">Роль</th>
            <th className="px-2 py-2 text-left font-medium">Добавлен</th>
            {canManage && (
              <th className="px-4 py-2 text-right font-medium">Действия</th>
            )}
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <MemberRowView
              key={m.user_id}
              slug={slug}
              member={m}
              isLast={i === members.length - 1}
              canManage={canManage}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function MemberRowView({
  slug,
  member,
  isLast,
  canManage,
}: {
  slug: string
  member: MemberRow
  isLast: boolean
  canManage: boolean
}) {
  const [mode, setMode] = useState<'idle' | 'reset'>('idle')

  const borderStyle = isLast
    ? {}
    : { borderBottom: '1px solid var(--gray-100)' }

  const colSpan = canManage ? 4 : 3

  return (
    <>
      <tr style={borderStyle}>
        <td className="px-4 py-3 align-top">
          <div className="font-mono font-semibold">{member.login}</div>
          {member.display_name && member.display_name !== member.login && (
            <div className="text-[11px]" style={{ color: 'var(--gray-500)' }}>
              {member.display_name}
            </div>
          )}
          {member.must_change_password && (
            <div
              className="mt-1 inline-block rounded-[var(--radius)] px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--amber-100, #fef3c7)', color: 'var(--amber-700, #b45309)' }}
            >
              сменит пароль
            </div>
          )}
          {member.is_self && (
            <div
              className="mt-1 ml-1 inline-block rounded-[var(--radius)] px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}
            >
              это вы
            </div>
          )}
        </td>

        <td className="px-2 py-3 align-top">
          <span
            className="inline-block rounded-[var(--radius)] px-2 py-0.5 text-[11px] font-medium"
            style={{ background: ROLE_BADGE[member.role].bg, color: ROLE_BADGE[member.role].fg }}
          >
            {ROLE_LABEL[member.role]}
          </span>
        </td>

        <td
          className="px-2 py-3 align-top text-[11px]"
          style={{ color: 'var(--gray-500)' }}
        >
          {formatDate(member.created_at)}
        </td>

        {canManage && (
          <td className="px-4 py-3 align-top">
            <div className="flex flex-wrap justify-end gap-2">
              {member.role !== 'owner' && !member.is_self && (
                <>
                  <ChangeRoleButton slug={slug} member={member} />
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'reset' ? 'idle' : 'reset')}
                    className="rounded-[var(--radius)] border px-2 py-1 text-[11px] transition-colors hover:bg-[var(--gray-50)]"
                    style={{ borderColor: 'var(--gray-300)', color: 'var(--fg-1)' }}
                  >
                    {mode === 'reset' ? 'Отмена' : 'Сбросить пароль'}
                  </button>
                  <RemoveButton slug={slug} member={member} />
                </>
              )}
            </div>
          </td>
        )}
      </tr>

      {canManage && mode === 'reset' && (
        <tr style={borderStyle}>
          <td colSpan={colSpan} className="px-4 pb-3" style={{ background: 'var(--gray-50)' }}>
            <ResetPasswordForm
              slug={slug}
              userId={member.user_id}
              login={member.login}
              onDone={() => setMode('idle')}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ────────────────────────────── Change role ──────────────────────────────

function ChangeRoleButton({ slug, member }: { slug: string; member: MemberRow }) {
  const boundAction = updateMemberRoleAction.bind(null, slug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  const nextRole: Role = member.role === 'dm' ? 'player' : 'dm'
  const nextLabel = nextRole === 'dm' ? 'Сделать ДМом' : 'Сделать игроком'

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="role" value={nextRole} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius)] border px-2 py-1 text-[11px] transition-colors hover:bg-[var(--gray-50)] disabled:opacity-60"
        style={{ borderColor: 'var(--gray-300)', color: 'var(--fg-1)' }}
        title={`Сменит роль ${ROLE_LABEL[member.role]} → ${ROLE_LABEL[nextRole]}`}
      >
        {pending ? '…' : nextLabel}
      </button>
      {state.error && (
        <span className="text-[10px]" style={{ color: 'var(--red-700)' }}>
          {state.error}
        </span>
      )}
    </form>
  )
}

// ────────────────────────────── Reset password ──────────────────────────────

function ResetPasswordForm({
  slug,
  userId,
  login,
  onDone,
}: {
  slug: string
  userId: string
  login: string
  onDone: () => void
}) {
  const boundAction = resetPasswordAction.bind(null, slug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  useEffect(() => {
    if (state.success) {
      const t = setTimeout(onDone, 1500)
      return () => clearTimeout(t)
    }
  }, [state.success, onDone])

  return (
    <form action={formAction} className="flex flex-col gap-2 py-2">
      <div className="text-[11px]" style={{ color: 'var(--gray-600)' }}>
        Новый одноразовый пароль для <span className="font-mono font-semibold">{login}</span>:
      </div>
      <div className="flex gap-2">
        <input type="hidden" name="user_id" value={userId} />
        <input
          name="new_password"
          type="text"
          required
          minLength={8}
          autoComplete="off"
          placeholder="минимум 8 символов"
          className="flex-1 rounded-[var(--radius)] border px-3 py-1.5 font-mono text-[12px] outline-none"
          style={{ borderColor: 'var(--gray-300)' }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-[var(--radius)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--blue-600)' }}
        >
          {pending ? '…' : 'Сбросить'}
        </button>
      </div>
      {state.error && (
        <div className="text-[11px]" style={{ color: 'var(--red-700)' }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="text-[11px]" style={{ color: 'var(--green-700)' }}>
          ✓ {state.success}
        </div>
      )}
    </form>
  )
}

// ────────────────────────────── Remove ──────────────────────────────

function RemoveButton({ slug, member }: { slug: string; member: MemberRow }) {
  const boundAction = removeMemberAction.bind(null, slug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-[var(--radius)] border px-2 py-1 text-[11px] transition-colors hover:bg-[var(--red-50)]"
          style={{ borderColor: 'var(--gray-300)', color: 'var(--red-700)' }}
        >
          Удалить
        </button>
        {state.error && (
          <span className="text-[10px]" style={{ color: 'var(--red-700)' }}>
            {state.error}
          </span>
        )}
      </>
    )
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={member.user_id} />
      <span className="text-[11px]" style={{ color: 'var(--gray-600)' }}>
        Удалить {member.login}?
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
        style={{ background: 'var(--red-500, #ef4444)' }}
      >
        {pending ? '…' : 'Да'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-[var(--radius)] border px-2 py-1 text-[11px]"
        style={{ borderColor: 'var(--gray-300)', color: 'var(--gray-600)' }}
      >
        Нет
      </button>
    </form>
  )
}

// ────────────────────────────── Utils ──────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

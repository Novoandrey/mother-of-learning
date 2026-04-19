'use client'

import { useActionState, useState } from 'react'
import type { Role } from '@/lib/auth'
import { bindPcOwnerAction } from '@/app/c/[slug]/members/actions'

type ActionState = { error: string | null; success: string | null }
const initialState: ActionState = { error: null, success: null }

type Player = {
  user_id: string
  login: string
  display_name: string | null
}

export type OwnerContext = {
  /** The role of the viewer in this campaign. */
  viewerRole: Role
  /** The viewer's user_id (to detect self-ownership). */
  viewerUserId: string
  /** Current owner of this PC, or null if unowned. */
  ownerUserId: string | null
  /** Current owner's login for display (null if unowned or unknown). */
  ownerLogin: string | null
  /**
   * Candidate players for assignment. Used only in 'manage' mode.
   * Empty for non-managers.
   */
  players: Player[]
}

/**
 * "Owner" section on a PC-card (nodes of type 'character').
 *
 * Three visibility modes, resolved inside the component:
 *   - 'manage'     (owner / dm): shows current owner + change/clear dropdown form.
 *   - 'self-read'  (player on their own PC): shows "<login> (это вы)", no edit.
 *   - 'hidden'     (player on someone else's PC): renders nothing.
 */
export function NodeOwnerSection({
  nodeId,
  campaignSlug,
  ctx,
}: {
  nodeId: string
  campaignSlug: string
  ctx: OwnerContext
}) {
  const isManager = ctx.viewerRole === 'owner' || ctx.viewerRole === 'dm'
  const isPlayerOnOwnPc =
    ctx.viewerRole === 'player' && ctx.ownerUserId === ctx.viewerUserId

  if (!isManager && !isPlayerOnOwnPc) {
    // 'hidden' — player viewing a PC that doesn't belong to them.
    return null
  }

  if (!isManager && isPlayerOnOwnPc) {
    // 'self-read' — read-only display.
    return (
      <section
        className="rounded-lg border border-gray-200 bg-white p-4"
        style={{ color: 'var(--fg-1)' }}
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Владелец
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono font-semibold">
            {ctx.ownerLogin ?? 'вы'}
          </span>
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
          >
            это вы
          </span>
        </div>
      </section>
    )
  }

  // 'manage' — owner or dm.
  return (
    <ManageOwnerSection
      nodeId={nodeId}
      campaignSlug={campaignSlug}
      ctx={ctx}
    />
  )
}

function ManageOwnerSection({
  nodeId,
  campaignSlug,
  ctx,
}: {
  nodeId: string
  campaignSlug: string
  ctx: OwnerContext
}) {
  const boundAction = bindPcOwnerAction.bind(null, campaignSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const [editing, setEditing] = useState(false)

  const currentOwnerLabel = ctx.ownerLogin ?? '— не назначен —'

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4"
      style={{ color: 'var(--fg-1)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Владелец
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            {ctx.ownerUserId ? 'Сменить' : 'Назначить'}
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Отмена
          </button>
        )}
      </div>

      {!editing && (
        <div className="text-sm">
          <span className={ctx.ownerUserId ? 'font-mono font-semibold' : 'text-gray-400'}>
            {currentOwnerLabel}
          </span>
          {ctx.ownerUserId === ctx.viewerUserId && (
            <span
              className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              это вы
            </span>
          )}
        </div>
      )}

      {editing && (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="node_id" value={nodeId} />
          <select
            name="user_id"
            defaultValue={ctx.ownerUserId ?? '__none__'}
            className="rounded border border-gray-300 px-3 py-2 text-sm outline-none"
          >
            <option value="__none__">— не назначен —</option>
            {ctx.players.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.login}
                {p.display_name && p.display_name !== p.login ? ` (${p.display_name})` : ''}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
          {state.error && (
            <div className="text-xs" style={{ color: 'var(--red-700)' }}>
              {state.error}
            </div>
          )}
          {state.success && (
            <div className="text-xs" style={{ color: 'var(--green-700)' }}>
              ✓ {state.success}
            </div>
          )}
          {ctx.players.length === 0 && (
            <div className="text-xs text-gray-500">
              В кампании нет игроков. Добавь игрока на странице «Участники».
            </div>
          )}
        </form>
      )}
    </section>
  )
}

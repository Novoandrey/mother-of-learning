'use client'

import { useActionState, useState } from 'react'
import type { Role } from '@/lib/auth'
import {
  addPcOwnerAction,
  removePcOwnerAction,
} from '@/app/c/[slug]/members/actions'

type ActionState = { error: string | null; success: string | null }
const initialState: ActionState = { error: null, success: null }

type Player = {
  user_id: string
  login: string
  display_name: string | null
}

export type Owner = {
  user_id: string
  login: string
  display_name: string | null
}

export type OwnerContext = {
  /** The role of the viewer in this campaign. */
  viewerRole: Role
  /** The viewer's user_id — to detect self-ownership. */
  viewerUserId: string
  /** All current owners of this PC. May be empty. */
  owners: Owner[]
  /**
   * Candidate players for assignment. Used only in 'manage' mode.
   * Empty for non-managers.
   */
  players: Player[]
}

/**
 * "Owners" section on a PC-card (nodes of type 'character'). Many-to-many:
 * a PC may have any number of owners ("shared" PCs, borrowed PCs).
 *
 * Three visibility modes, resolved inside the component:
 *   - 'manage'     (owner / dm): current owners + add/remove UI.
 *   - 'self-read'  (player who is among the owners): read-only list with
 *                  "это вы" badge on their own row.
 *   - 'hidden'     (player not among the owners): renders nothing.
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
  const isCoOwner =
    ctx.viewerRole === 'player' &&
    ctx.owners.some((o) => o.user_id === ctx.viewerUserId)

  if (!isManager && !isCoOwner) {
    return null
  }

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4"
      style={{ color: 'var(--fg-1)' }}
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {ctx.owners.length > 1 ? 'Владельцы' : 'Владелец'}
      </h2>

      <OwnersList
        nodeId={nodeId}
        campaignSlug={campaignSlug}
        ctx={ctx}
        canManage={isManager}
      />

      {isManager && (
        <AddOwnerForm
          nodeId={nodeId}
          campaignSlug={campaignSlug}
          ctx={ctx}
        />
      )}
    </section>
  )
}

// ─────────────────────────── Owners list ───────────────────────────

function OwnersList({
  nodeId,
  campaignSlug,
  ctx,
  canManage,
}: {
  nodeId: string
  campaignSlug: string
  ctx: OwnerContext
  canManage: boolean
}) {
  if (ctx.owners.length === 0) {
    return (
      <p className="text-sm italic text-gray-400">
        — не назначен —
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {ctx.owners.map((owner) => (
        <OwnerRow
          key={owner.user_id}
          nodeId={nodeId}
          campaignSlug={campaignSlug}
          owner={owner}
          isSelf={owner.user_id === ctx.viewerUserId}
          canManage={canManage}
        />
      ))}
    </ul>
  )
}

function OwnerRow({
  nodeId,
  campaignSlug,
  owner,
  isSelf,
  canManage,
}: {
  nodeId: string
  campaignSlug: string
  owner: Owner
  isSelf: boolean
  canManage: boolean
}) {
  const boundAction = removePcOwnerAction.bind(null, campaignSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="font-mono font-semibold">{owner.login}</span>
      {owner.display_name && owner.display_name !== owner.login && (
        <span className="text-xs text-gray-500">({owner.display_name})</span>
      )}
      {isSelf && (
        <span
          className="inline-block rounded px-1.5 py-0.5 text-[10px]"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          это вы
        </span>
      )}
      {canManage && (
        <form action={formAction} className="ml-auto">
          <input type="hidden" name="node_id" value={nodeId} />
          <input type="hidden" name="user_id" value={owner.user_id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50"
            title="Снять владельца"
          >
            {pending ? '…' : '×'}
          </button>
        </form>
      )}
      {state.error && canManage && (
        <span className="ml-2 text-[10px]" style={{ color: 'var(--red-700)' }}>
          {state.error}
        </span>
      )}
    </li>
  )
}

// ─────────────────────────── Add owner form ───────────────────────────

function AddOwnerForm({
  nodeId,
  campaignSlug,
  ctx,
}: {
  nodeId: string
  campaignSlug: string
  ctx: OwnerContext
}) {
  const boundAction = addPcOwnerAction.bind(null, campaignSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const [open, setOpen] = useState(false)

  // Players who aren't already owners of this PC.
  const ownerIds = new Set(ctx.owners.map((o) => o.user_id))
  const candidates = ctx.players.filter((p) => !ownerIds.has(p.user_id))

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          + Добавить владельца
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="node_id" value={nodeId} />

      {candidates.length === 0 ? (
        <div className="text-xs text-gray-500">
          Нет игроков, которых можно добавить. Пригласи игроков на странице «Участники».
        </div>
      ) : (
        <select
          name="user_id"
          required
          defaultValue=""
          className="rounded border border-gray-300 px-3 py-2 text-sm outline-none"
        >
          <option value="" disabled>
            Выбери игрока…
          </option>
          {candidates.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.login}
              {p.display_name && p.display_name !== p.login ? ` (${p.display_name})` : ''}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        {candidates.length > 0 && (
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? 'Сохраняю…' : 'Добавить'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Отмена
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
    </form>
  )
}

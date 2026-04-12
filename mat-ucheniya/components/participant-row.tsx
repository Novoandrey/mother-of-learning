'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InitiativeInput } from './initiative-input'
import { HpControl } from './hp-control'

type Participant = {
  id: string
  display_name: string
  initiative: number | null
  max_hp: number
  current_hp: number
  is_active: boolean
  node_id: string | null
  node?: { id: string; title: string; type?: { slug: string } } | null
}

type Props = {
  participant: Participant
  isCurrentTurn: boolean
  isCompleted: boolean
  campaignSlug: string
  onInitiativeChange: (id: string, value: number | null) => void
  onHpChange: (id: string, newHp: number) => void
  onToggleActive: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
  onRename: (id: string, newName: string) => void
}

export function ParticipantRow({
  participant: p,
  isCurrentTurn,
  isCompleted,
  campaignSlug,
  onInitiativeChange,
  onHpChange,
  onToggleActive,
  onDelete,
  onRename,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(p.display_name)

  const isDown = p.current_hp === 0 && p.max_hp > 0
  const dimmed = isDown || !p.is_active

  function commitName() {
    setEditingName(false)
    if (nameDraft.trim() && nameDraft.trim() !== p.display_name) {
      onRename(p.id, nameDraft.trim())
    } else {
      setNameDraft(p.display_name)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
        isCurrentTurn
          ? 'border border-blue-300 bg-blue-50 shadow-sm'
          : 'hover:bg-gray-50'
      } ${dimmed ? 'opacity-50' : ''} ${isDown ? 'line-through decoration-red-400' : ''}`}
    >
      {/* Turn dot */}
      <div className="w-2 shrink-0">
        {isCurrentTurn && <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
      </div>

      {/* Initiative */}
      <InitiativeInput
        value={p.initiative}
        onChange={(v) => onInitiativeChange(p.id, v)}
        disabled={isCompleted}
      />

      {/* Name */}
      <div className="min-w-0 flex-1">
        {editingName ? (
          <input
            autoFocus
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setNameDraft(p.display_name); setEditingName(false) }
            }}
            className="w-full rounded border border-blue-400 px-1 py-0.5 text-sm focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            {p.node ? (
              <Link
                href={`/c/${campaignSlug}/catalog/${p.node.id}`}
                className="truncate text-sm font-medium text-blue-600 hover:underline"
              >
                {p.display_name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-gray-900">{p.display_name}</span>
            )}
            {p.node?.type && (
              <span className="shrink-0 text-xs text-gray-400">{p.node.type.slug}</span>
            )}
          </div>
        )}
      </div>

      {/* HP */}
      {p.max_hp > 0 && (
        <HpControl
          currentHp={p.current_hp}
          maxHp={p.max_hp}
          onChange={(hp) => onHpChange(p.id, hp)}
          disabled={isCompleted}
        />
      )}

      {/* Actions */}
      {!isCompleted && (
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex h-7 w-7 items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ⋮
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => { setEditingName(true); setShowMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  Переименовать
                </button>
                <button
                  onClick={() => { onToggleActive(p.id, !p.is_active); setShowMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  {p.is_active ? 'Убрать из боя' : 'Вернуть в бой'}
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => {
                    if (confirm(`Удалить ${p.display_name}?`)) onDelete(p.id)
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

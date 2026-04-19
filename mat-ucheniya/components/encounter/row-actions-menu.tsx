'use client'

import { useState, useRef, useEffect } from 'react'

type Props = {
  isActive: boolean
  onClone: () => void
  onToggle: () => void
  onDelete: () => void
}

/**
 * Three-dot dropdown menu for participant row actions.
 * Replaces the cramped icon row (⧉ ◎ ✕) with labelled items.
 *
 * - "Клонировать" — inserts a numbered copy right after this row.
 * - "Убрать из боя" / "Вернуть в бой" — flip `is_active`. A benched
 *   participant stays in the list (dim/greyed) but is skipped by turn
 *   order. Useful when a creature flees, is frozen, etc.
 * - "Удалить совсем" — remove from encounter entirely. With a confirm
 *   in the action handler itself.
 */
export function RowActionsMenu({ isActive, onClone, onToggle, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function click(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function run(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      fn()
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title="Действия"
        aria-label="Действия над участником"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-base text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        ⋯
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-gray-200 bg-white text-left text-[12px] shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={run(onClone)}
            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50"
          >
            <span className="w-4 text-gray-400">⧉</span>
            <span>Клонировать</span>
          </button>
          <button
            type="button"
            onClick={run(onToggle)}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 hover:bg-gray-50"
          >
            <span className="w-4 text-gray-400">{isActive ? '◎' : '○'}</span>
            <span>{isActive ? 'Убрать из боя' : 'Вернуть в бой'}</span>
          </button>
          <button
            type="button"
            onClick={run(onDelete)}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-red-600 hover:bg-red-50"
          >
            <span className="w-4">✕</span>
            <span>Удалить совсем</span>
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * PillEditor — ClickUp-style context popover for a tag pill.
 *
 * Opens on click over a pill. Shows:
 *   - pill name + meta ("since round N" / "before combat")
 *   - list of actions (currently only "Remove", future: rename, color)
 *
 * Rendered via portal into document.body with position: fixed so it is
 * not clipped by any overflow container (see chat 17 rule).
 *
 * Closing rules:
 *   - Click anywhere outside the popover AND outside the anchor pill → close.
 *     Click inside the anchor pill passes through so that the pill's own
 *     onClick toggle logic can close it.
 *   - Escape → close.
 */

export type PillAction = {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}

type Props = {
  anchorEl: HTMLElement
  tagName: string
  round: number
  actions: PillAction[]
  onClose: () => void
}

const POPOVER_WIDTH = 200
const POPOVER_GAP = 6

export function PillEditor({ anchorEl, tagName, round, actions, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Position: below the pill, left edge aligned. Flip above if no room below.
  // Re-compute on scroll (capture phase — catches nested scroll containers too) and resize.
  useLayoutEffect(() => {
    function computePos() {
      const rect = anchorEl.getBoundingClientRect()
      const viewportH = window.innerHeight
      const viewportW = window.innerWidth
      const estimatedH = 100
      const below = rect.bottom + POPOVER_GAP
      const above = rect.top - POPOVER_GAP - estimatedH
      const top = below + estimatedH < viewportH ? below : above
      let left = rect.left
      if (left + POPOVER_WIDTH > viewportW - 8) {
        left = viewportW - POPOVER_WIDTH - 8
      }
      if (left < 8) left = 8
      setPos({ left, top })
    }
    computePos()
    window.addEventListener('scroll', computePos, true)
    window.addEventListener('resize', computePos)
    return () => {
      window.removeEventListener('scroll', computePos, true)
      window.removeEventListener('resize', computePos)
    }
  }, [anchorEl])

  // Outside click + Escape close.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      // Click inside popover itself → ignore.
      if (t.closest?.('[data-pill-editor]')) return
      // Click on the *same* anchor pill → ignore; its own onClick will toggle us closed.
      if (anchorEl.contains(t)) return
      // Anything else (including other pills) → close.
      onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Delay so the opening click itself doesn't immediately close us.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [anchorEl, onClose])

  if (!pos || typeof document === 'undefined') return null

  const metaText = round > 0 ? `с раунда ${round}` : 'до боя'

  return createPortal(
    <div
      ref={popoverRef}
      data-pill-editor
      className="rounded-[var(--radius-md)] border bg-white"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
        zIndex: 9999,
        borderColor: 'var(--gray-200)',
        boxShadow: 'var(--shadow-lg)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header: tag name + meta */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--gray-100)' }}>
        <div
          className="truncate text-[12px] font-semibold"
          style={{ color: 'var(--fg-1)' }}
          title={tagName}
        >
          {tagName}
        </div>
        <div className="mt-[2px] text-[10px]" style={{ color: 'var(--gray-400)' }}>
          {metaText}
        </div>
      </div>

      {/* Actions */}
      <div className="py-1">
        {actions.map((a, i) => {
          const isDanger = a.tone === 'danger'
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick()
                onClose()
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors"
              style={{
                color: isDanger ? 'var(--red-600)' : 'var(--gray-700)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDanger ? 'var(--red-50)' : 'var(--gray-50)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {a.label}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

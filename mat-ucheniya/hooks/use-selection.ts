'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Multi-select with Click / Ctrl+Click / Shift+Click.
 * Escape clears selection.
 */
export function useSelection(sortedIds: string[], disabled: boolean) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (disabled) return
    // Ignore clicks on interactive elements
    const target = e.target as HTMLElement
    if (target.closest('input, button, a, [role="button"]')) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && lastClickedRef.current) {
        const a = sortedIds.indexOf(lastClickedRef.current)
        const b = sortedIds.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a]
          for (let i = start; i <= end; i++) next.add(sortedIds[i])
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        if (next.size === 1 && next.has(id)) {
          next.clear()
        } else {
          next.clear()
          next.add(id)
        }
      }
      lastClickedRef.current = id
      return next
    })
  }, [disabled, sortedIds])

  const isSelected = useCallback(
    (id: string) => selectedIds.size > 0 && selectedIds.has(id),
    [selectedIds],
  )

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Escape to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) clearSelection()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedIds.size, clearSelection])

  return { selectedIds, selCount: selectedIds.size, toggleSelect, isSelected, clearSelection }
}

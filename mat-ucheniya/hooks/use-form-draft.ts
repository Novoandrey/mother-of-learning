'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local-storage-backed autosave for forms with potentially long
 * uncommitted state (recap text being the canonical pain point).
 *
 * Why not "create the node immediately": that would leak placeholder
 * rows on every Cancel/abandonment, and require status fields, GC,
 * RLS edits — all heavy for the actual problem, which is just
 * "I lost my work to a reboot".
 *
 * Contract:
 * - The hook never mutates parent state on its own. On mount it reads
 *   storage and surfaces `pendingDraft` if the saved value is non-empty
 *   (per the caller's `isEmpty` predicate). The caller renders a banner
 *   and decides whether to call `restoreDraft` (applies the saved value
 *   via `onRestore`) or `discardDraft` (drops it).
 * - Writes are debounced and only happen when `enabled` is true AND
 *   there is no `pendingDraft` in flight. Blocking writes while a
 *   pending draft is shown prevents the autosaver from overwriting the
 *   user's old work with the empty form they're staring at.
 * - `clearDraft` is the success path: call it after the form has been
 *   persisted so the next visit doesn't show a stale "Restore" prompt.
 */

export type Draft<T> = {
  value: T
  savedAt: string
}

type Options<T> = {
  /**
   * Storage key. If null the hook is a no-op (returns a stable empty
   * shape) — useful while the parent is still resolving which key to
   * use (e.g. waiting for the selected type to load).
   */
  key: string | null
  /** Current form value, snapshotted on every change. */
  value: T
  /**
   * Apply a recovered draft back into form state. Called from
   * `restoreDraft`. The hook does not introspect the value.
   */
  onRestore?: (draft: T) => void
  /**
   * Predicate: is this value worth saving? Returning true causes the
   * hook to delete the storage entry instead of writing it. Without
   * this, an empty form on mount would clobber a previously-saved
   * draft. Recommended: trim string fields, check array lengths.
   */
  isEmpty?: (v: T) => boolean
  /**
   * Pause reads and writes. The intended pattern is to hold the hook
   * disabled until the form has finished initial hydration (selected
   * type known, defaults applied) so the first auto-write is genuine
   * user input rather than form scaffolding.
   */
  enabled?: boolean
  /** Debounce in ms before a state change is persisted (default 600). */
  debounceMs?: number
}

export function useFormDraft<T>({
  key,
  value,
  onRestore,
  isEmpty,
  enabled = true,
  debounceMs = 600,
}: Options<T>) {
  const [pendingDraft, setPendingDraft] = useState<Draft<T> | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const hasReadRef = useRef<string | null>(null)
  const lastSerialisedRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `pendingDraft` is also tracked in a ref so the write effect can
  // see its current value without re-running every time the banner
  // toggles (which would re-arm the debounce timer for nothing).
  const pendingRef = useRef<Draft<T> | null>(null)
  pendingRef.current = pendingDraft

  // ── Read once per (enabled, key) pair ──
  useEffect(() => {
    if (!enabled || !key) return
    if (hasReadRef.current === key) return
    hasReadRef.current = key
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setPendingDraft(null)
        return
      }
      const parsed = JSON.parse(raw) as Draft<T>
      if (
        parsed &&
        parsed.value !== undefined &&
        (!isEmpty || !isEmpty(parsed.value))
      ) {
        setPendingDraft(parsed)
      } else {
        // Saved draft is empty or corrupted-shape — silently drop.
        window.localStorage.removeItem(key)
        setPendingDraft(null)
      }
    } catch {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
      setPendingDraft(null)
    }
  }, [enabled, key, isEmpty])

  // ── Debounced write on every value change ──
  useEffect(() => {
    if (!enabled || !key) return
    // Don't overwrite a draft the user hasn't acted on yet — they're
    // currently looking at an empty form (or different state) and we
    // would silently destroy the very thing they came back to recover.
    // (Re-checked inside the timer too: state can change between the
    // effect firing and the timer firing.)
    if (pendingRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (pendingRef.current) return
      try {
        if (isEmpty && isEmpty(value)) {
          window.localStorage.removeItem(key)
          lastSerialisedRef.current = null
          setLastSavedAt(null)
          return
        }
        const savedAt = new Date().toISOString()
        const draft: Draft<T> = { value, savedAt }
        const serialised = JSON.stringify(draft)
        if (serialised === lastSerialisedRef.current) return
        window.localStorage.setItem(key, serialised)
        lastSerialisedRef.current = serialised
        setLastSavedAt(savedAt)
      } catch {
        // Storage quota / private mode / SSR — autosave is best-effort.
      }
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, key, value, debounceMs, isEmpty])

  const restoreDraft = useCallback(() => {
    const d = pendingRef.current
    if (!d) return
    onRestore?.(d.value)
    setPendingDraft(null)
    // Resume normal autosave from the just-restored state.
    lastSerialisedRef.current = null
  }, [onRestore])

  const discardDraft = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    }
    lastSerialisedRef.current = null
    setPendingDraft(null)
    setLastSavedAt(null)
  }, [key])

  const clearDraft = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    }
    lastSerialisedRef.current = null
    setPendingDraft(null)
    setLastSavedAt(null)
  }, [key])

  return { pendingDraft, lastSavedAt, restoreDraft, discardDraft, clearDraft }
}

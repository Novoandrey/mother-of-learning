'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateRound } from '@/lib/encounter-actions'
import type { Participant } from '@/components/encounter/encounter-grid'

type Options = {
  encounterId: string
  initialRound: number
  initialTurnId: string | null
  participants: Participant[]
  inCombat: Participant[]
  done: boolean
  onRoundChange?: (round: number) => void
}

/**
 * Turn navigation: advance / prev turn, round ±, keyboard shortcuts.
 */
export function useEncounterTurns({
  encounterId,
  initialRound,
  initialTurnId,
  participants,
  inCombat,
  done,
  onRoundChange,
}: Options) {
  const [round, setRoundState] = useState(initialRound)
  const [turnId, setTurnId] = useState<string | null>(initialTurnId)

  const setRound = useCallback(async (delta: number) => {
    const r = Math.max(1, round + delta)
    setRoundState(r)
    onRoundChange?.(r)
    try { await updateRound(encounterId, r) } catch { /* best-effort */ }
  }, [round, encounterId, onRoundChange])

  const advanceTurn = useCallback(async () => {
    if (!inCombat.length) return
    const idx = turnId ? inCombat.findIndex((p) => p.id === turnId) : -1
    let next = idx + 1
    if (next >= inCombat.length) { next = 0; setRound(1) }
    const id = inCombat[next].id
    setTurnId(id)
    try {
      const s = createClient()
      await s.from('encounters').update({ current_turn_id: id }).eq('id', encounterId)
    } catch { /* best-effort */ }
  }, [turnId, inCombat, encounterId, setRound])

  const prevTurn = useCallback(async () => {
    if (!inCombat.length) return

    // If combat not started yet, nothing to undo.
    if (turnId == null) return

    const idx = inCombat.findIndex((p) => p.id === turnId)

    // At first participant of round 1 → exit combat (symmetric to starting it
    // with → from null). This gives the user a way to cancel "combat started".
    if (idx === 0 && round === 1) {
      setTurnId(null)
      try {
        const s = createClient()
        await s.from('encounters').update({ current_turn_id: null }).eq('id', encounterId)
      } catch { /* best-effort */ }
      return
    }

    let prev = idx - 1
    if (prev < 0) {
      prev = inCombat.length - 1
      if (round > 1) setRound(-1)
    }
    const id = inCombat[prev].id
    setTurnId(id)
    try {
      const s = createClient()
      await s.from('encounters').update({ current_turn_id: id }).eq('id', encounterId)
    } catch { /* best-effort */ }
  }, [turnId, inCombat, encounterId, round, setRound])

  const currentTurnName = useMemo(() => {
    if (!turnId) return null
    return participants.find((p) => p.id === turnId)?.display_name || null
  }, [turnId, participants])

  // Keyboard: Space/Arrow → next, Shift+Space/← → prev
  useEffect(() => {
    if (done) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) prevTurn()
        else advanceTurn()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevTurn()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [done, advanceTurn, prevTurn])

  return { round, turnId, setRound, advanceTurn, prevTurn, currentTurnName }
}

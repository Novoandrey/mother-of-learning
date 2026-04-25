/**
 * Spec-013 — Encounter loot summary query.
 *
 * Single query returning the panel-state inputs:
 *   - rowCount: how many autogen rows currently exist for this
 *     encounter (drives `applied | drafting | empty` state in the
 *     panel)
 *   - lastAppliedAt: timestamp of the most recent autogen row
 *   - mirrorNodeId: the encounter's mirror node id (from migration
 *     039), needed for the player-facing read-only summary's
 *     "open ledger" link
 *
 * Member-read: relies on RLS for row-level access. The encounter's
 * RLS gates the join; transactions inherit campaign membership.
 *
 * Performance: uses spec-012's partial index
 * `idx_tx_autogen_source_wizard` on `(autogen_source_node_id,
 * autogen_wizard_key)`. One indexed select per panel render.
 */

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

export type EncounterLootSummary = {
  rowCount: number
  lastAppliedAt: string | null
  /** The encounter's mirror node id (matches `encounters.node_id`). */
  mirrorNodeId: string
}

export const getEncounterLootSummary = cache(
  async (encounterId: string): Promise<EncounterLootSummary | null> => {
    const supabase = await createClient()

    // Step 1 — resolve mirror node id from the encounter row. RLS gates
    // visibility; if the user can't see this encounter, we return null.
    const { data: encRow, error: encErr } = await supabase
      .from('encounters')
      .select('node_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) {
      throw new Error(`getEncounterLootSummary (encounter): ${encErr.message}`)
    }
    if (!encRow) return null

    const mirrorNodeId = (encRow as { node_id: string }).node_id

    // Step 2 — count autogen rows + grab max(created_at). One query.
    // We ask for a single row with the aggregate; PostgREST returns it
    // as the row when we don't filter further.
    const { data: txRows, error: txErr } = await supabase
      .from('transactions')
      .select('created_at')
      .eq('autogen_source_node_id', mirrorNodeId)
      .eq('autogen_wizard_key', 'encounter_loot')
      .order('created_at', { ascending: false })

    if (txErr) {
      throw new Error(
        `getEncounterLootSummary (transactions): ${txErr.message}`,
      )
    }

    const rows = (txRows ?? []) as Array<{ created_at: string }>

    return {
      rowCount: rows.length,
      lastAppliedAt: rows[0]?.created_at ?? null,
      mirrorNodeId,
    }
  },
)

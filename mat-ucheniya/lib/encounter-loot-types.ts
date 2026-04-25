/**
 * Spec-013 — Encounter loot types.
 *
 * Pure types, zero runtime imports. Shared between:
 *   - `lib/encounter-loot-resolver.ts` (expand draft → desired rows)
 *   - `lib/encounter-loot-validation.ts` (Zod + cross-line invariants)
 *   - `app/actions/encounter-loot.ts` (read/write/apply)
 *   - UI components (`encounter-loot-panel`, `encounter-loot-line-editor`,
 *     row components).
 *
 * The DB stores `lines` as JSONB (see migration 039). The TypeScript
 * shape here is the source of truth — Postgres has no CHECK on the
 * shape; the `updateEncounterLootDraft` action runs Zod parse before
 * writing.
 *
 * `loop_number` and `day_in_loop` are top-level draft fields, not
 * per-line: encounter loot materialises on a single (loop, day) since
 * the encounter happened once. See plan.md for the rationale.
 */

/**
 * Per-line identifier — a uuid v4 generated at line-add time. Used by
 * the line-editor for stable React keys and for row updates that don't
 * recreate the whole array. Not persisted to `transactions` — see
 * plan.md `## Summary § The matching key for reconcile is content`.
 */
export type LootLineId = string

/**
 * Coin reward line. Recipient mode controls how the line expands at
 * resolve time: `'pc'` → one row, `'stash'` → one row to the campaign
 * stash, `'split_evenly'` → N rows distributed across the encounter
 * participants with floor-cp + remainder rule (see `coin-split.ts`).
 */
export type CoinLine = {
  id: LootLineId
  kind: 'coin'
  cp: number
  sp: number
  gp: number
  pp: number
  recipient_mode: 'pc' | 'stash' | 'split_evenly'
  /** Required when `recipient_mode='pc'`; null otherwise. */
  recipient_pc_id: string | null
}

/**
 * Item reward line. No `'split_evenly'` for items — splitting a single
 * sword between 4 PCs makes no narrative sense; if the DM wants to
 * give each PC one of the same item, they add 4 separate lines (or
 * one line with qty=4 to a single recipient).
 */
export type ItemLine = {
  id: LootLineId
  kind: 'item'
  /**
   * Free-text item name. May match an item-node title in spec-015's
   * catalog, but the link is not enforced here — encounter-loot lines
   * are independent of any future item registry.
   */
  name: string
  /** Positive integer. Validated in `validateLootDraft`. */
  qty: number
  recipient_mode: 'pc' | 'stash'
  /** Required when `recipient_mode='pc'`; null otherwise. */
  recipient_pc_id: string | null
}

export type LootLine = CoinLine | ItemLine

/**
 * The full draft row as stored in `encounter_loot_drafts`. The action
 * layer hydrates this from the DB and persists it back; the resolver
 * + validators consume it.
 */
export type LootDraft = {
  encounter_id: string
  lines: LootLine[]
  loop_number: number | null
  day_in_loop: number | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/**
 * The output of `resolveEncounterLootDesiredRows`. One row per actor
 * after expansion + merge. This is the encounter-loot-local shape; the
 * apply action (T014) bridges this to spec-012's full `DesiredRow`
 * (with `wizardKey`, `sourceNodeId`, `categorySlug`, `comment`,
 * `canonicalKey`) before calling `computeAutogenDiff`.
 *
 * `actor_pc_id` is a node id — for `'pc'` recipients it's the PC node,
 * for `'stash'` recipients it's the campaign stash node id (which is
 * also a node, just of type `'stash'`).
 */
export type EncounterLootDesiredRow =
  | {
      kind: 'money'
      actor_pc_id: string
      cp: number
      sp: number
      gp: number
      pp: number
    }
  | {
      kind: 'item'
      actor_pc_id: string
      item_name: string
      item_qty: number
    }

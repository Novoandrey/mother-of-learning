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
 * Coin reward line — chat-50 polish: a coin line is just a *record*
 * of money that dropped (with an optional free-text `comment` like
 * «Тела пауков»). Distribution of the total summed money happens
 * once, globally, via `LootDraft.money_distribution_*` — not per
 * line. The `comment` is editor-only metadata for record-keeping
 * within the encounter; it does not propagate to the ledger and
 * does not act as a distinguishing key for reconcile.
 */
export type CoinLine = {
  id: LootLineId
  kind: 'coin'
  cp: number
  sp: number
  gp: number
  pp: number
  /**
   * Optional free-text label like «Тела пауков», «Сундук». Visible
   * only in the encounter-loot panel — not in the ledger.
   */
  comment?: string
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
   * catalog. When `item_node_id` is set, this still carries the
   * snapshot title — written into the resulting transactions exactly
   * as typed (FR-014). Renames of the linked Образец surface in
   * inventory views via the live-title hydration pass, not here.
   */
  name: string
  /**
   * Spec-015 (T038). Optional link to an Образец in the items catalog.
   * When set:
   *   - `applyEncounterLoot` propagates the value into each generated
   *     transaction's `item_node_id` (T039), so the lines auto-link.
   *   - `name` remains the snapshot — both legs of any transfer pair
   *     written by reconcile share the same name.
   * When `null` / `undefined` — free-text path, identical to pre-spec-015
   * behaviour. Existing drafts without this field stay valid (FR-018).
   */
  item_node_id?: string | null
  /** Positive integer. Validated in `validateLootDraft`. */
  qty: number
  recipient_mode: 'pc' | 'stash'
  /** Required when `recipient_mode='pc'`; null otherwise. */
  recipient_pc_id: string | null
}

export type LootLine = CoinLine | ItemLine

export type CoinSet = {
  cp: number
  sp: number
  gp: number
  pp: number
}

export type MoneyDistribution =
  | { mode: 'stash'; pc_id: null }
  | { mode: 'pc'; pc_id: string }
  | { mode: 'split_evenly'; pc_id: null }
  | {
      mode: 'manual'
      pc_id: null
      /**
       * Per-PC coin amounts. Keys are PC node ids. Sum across all
       * entries must equal the total of all coin lines on apply
       * — the validator surfaces a clear error if it doesn't match.
       * PCs with all-zero amounts are skipped silently.
       */
      amounts: Record<string, CoinSet>
    }

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
  /**
   * Spec-013 chat-50 — how the summed total of all coin lines is
   * distributed on apply. One choice for the whole draft, not per
   * line.
   */
  money_distribution: MoneyDistribution
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
      /**
       * Spec-015 (T039). Optional Образец link, propagated from the
       * draft `ItemLine.item_node_id`. Reconcile core writes this into
       * the generated transaction's `item_node_id` column.
       */
      item_node_id: string | null
    }

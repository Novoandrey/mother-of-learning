/**
 * Spec-012 — Loop start setup.
 *
 * This file holds the **type definitions** and no I/O logic. Queries
 * (getCampaignStarterConfig, getPcStarterConfigsForCampaign, etc.)
 * are added to this file in Phase 4; server actions live under
 * `app/actions/starter-setup.ts` (Phases 5–6); pure helpers
 * (resolveDesiredRowSet, diffRowSets, identifyAffectedRows) live
 * in `./starter-setup-resolver.ts`, `./starter-setup-diff.ts`,
 * `./starter-setup-affected.ts`.
 *
 * Everything here is safe to import from client code — no
 * `@/lib/supabase`, no `next/headers`.
 */

import type { CoinSet } from './transactions'

// ─────────────────────────── Starter configs ───────────────────────────

export type StarterItem = {
  name: string
  /** Integer ≥ 1. Validated by `starter-setup-validation.ts`. */
  qty: number
}

export type CampaignStarterConfig = {
  campaignId: string
  /** Default loan amount every PC with `takes_starting_loan=true` receives. */
  loanAmount: CoinSet
  /** Coins seeded into the stash on apply. */
  stashSeedCoins: CoinSet
  /** Items seeded into the stash on apply. */
  stashSeedItems: StarterItem[]
  updatedAt: string
}

export type PcStarterConfig = {
  pcId: string
  /**
   * The sole player-editable field — narrative choice ("does my
   * character borrow at loop start?"). Defaults to `true`; Lex's
   * case in mat-ucheniya flips it off.
   */
  takesStartingLoan: boolean
  startingCoins: CoinSet
  startingItems: StarterItem[]
  updatedAt: string
}

// ─────────────────────────── Autogen marker ───────────────────────────

/**
 * Open-ended in the DB (no CHECK constraint). Spec-012 writes the four
 * keys listed here. Spec-013 will extend this union with
 * `'encounter_loot'`; future specs add more. The application layer
 * validates membership via `isKnownWizardKey` (from
 * `./starter-setup-validation.ts`).
 */
export type WizardKey =
  | 'starting_money'
  | 'starting_loan'
  | 'stash_seed'
  | 'starting_items'

/** Orthogonal property on a transaction — what produced it, from where. */
export type AutogenMarker = {
  wizardKey: WizardKey
  sourceNodeId: string
  handTouched: boolean
}

// ─────────────────────────── Resolver / diff contracts ───────────────────────────

/**
 * One row the apply action WILL produce (if it doesn't exist) or
 * reconcile an existing row against. Emitted by
 * `resolveDesiredRowSet`. Contains everything needed to INSERT a
 * full `transactions` row or compare against an existing one.
 */
export type DesiredRow = {
  wizardKey: WizardKey
  sourceNodeId: string
  actorPcId: string
  kind: 'money' | 'item'
  /** Signed coin amounts. Zero for `kind='item'`. */
  coins: CoinSet
  /** Non-null for `kind='item'`; null for `kind='money'`. */
  itemName: string | null
  /** Integer ≥ 1 (`1` for money rows; > 0 for item rows). */
  itemQty: number
  categorySlug: string
  comment: string
  /**
   * Stable key for matching against existing rows. Computed by
   * `canonicalKey(wizardKey, row)`.
   */
  canonicalKey: string
}

/** Subset of `Transaction` retrieved for reconcile. */
export type ExistingAutogenRow = {
  id: string
  wizardKey: WizardKey
  sourceNodeId: string
  actorPcId: string | null
  kind: 'money' | 'item' | 'transfer'
  coins: CoinSet
  itemName: string | null
  itemQty: number
  categorySlug: string
  comment: string
  handTouched: boolean
  canonicalKey: string
}

/** Tombstoned (hand-deleted) autogen row. Logged by the DB trigger. */
export type Tombstone = {
  id: string
  campaignId: string
  wizardKey: WizardKey
  sourceNodeId: string
  actorPcId: string | null
  kind: 'money' | 'item' | 'transfer'
  itemName: string | null
  deletedAt: string
  canonicalKey: string
}

/** Result of `diffRowSets(desired, existing)`. */
export type RowDiff = {
  toInsert: DesiredRow[]
  toUpdate: UpdatePair[]
  toDelete: ExistingAutogenRow[]
  unchanged: ExistingAutogenRow[]
}

export type UpdatePair = {
  existing: ExistingAutogenRow
  desired: DesiredRow
}

// ─────────────────────────── Apply action ───────────────────────────

/**
 * Shape returned from `applyLoopStartSetup(loopNodeId, opts)`. Two-
 * phase: the first call without `confirmed=true` can return
 * `needsConfirmation` if any hand-touched / hand-deleted rows would
 * be overwritten; the second call with `confirmed=true` executes the
 * diff unconditionally.
 */
export type ApplyResult =
  | { ok: true; summary: ApplySummary }
  | { needsConfirmation: true; affected: AffectedRow[] }

export type ApplySummary = {
  insertedCount: number
  updatedCount: number
  deletedCount: number
  tombstonesCleared: number
}

/**
 * One row displayed in the confirmation dialog. The DM sees a table
 * of these before deciding whether to proceed with the overwrite.
 */
export type AffectedRow = {
  wizardKey: WizardKey
  actorPcId: string
  actorTitle: string
  reason: 'hand_edited' | 'hand_deleted'
  /** Display-ready, e.g. "+200 gp" / "longsword × 1" / null if deleted. */
  currentDisplay: string | null
  /** Display-ready — what reapply will produce. Null if reapply deletes. */
  configDisplay: string | null
  /** Only set for `starting_items`, where multiple rows per PC are possible. */
  itemName?: string | null
}

// ─────────────────────────── Loop setup status ───────────────────────────

/** Feeds the banner ("show / hide") decision. */
export type LoopSetupStatus = {
  hasAutogenRows: boolean
}

// ═══════════════════════════════════════════════════════════════════════
// Read queries
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/server'
import { canonicalKey } from './starter-setup-resolver'

const SPEC_012_WIZARD_KEYS: WizardKey[] = [
  'starting_money',
  'starting_loan',
  'stash_seed',
  'starting_items',
]

/**
 * T013 — Single-row read for a campaign's starter config.
 *
 * The migration seeds one row per campaign, so this normally never
 * returns null. If the row is missing (defensive — e.g. a DB rollback
 * that didn't re-seed), returns an all-zero default so callers don't
 * have to special-case it.
 */
export async function getCampaignStarterConfig(
  campaignId: string,
): Promise<CampaignStarterConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaign_starter_configs')
    .select(
      'campaign_id, loan_amount_cp, loan_amount_sp, loan_amount_gp, loan_amount_pp, stash_seed_cp, stash_seed_sp, stash_seed_gp, stash_seed_pp, stash_seed_items, updated_at',
    )
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error) {
    throw new Error(`getCampaignStarterConfig failed: ${error.message}`)
  }

  if (!data) {
    // Defensive default — the migration should have seeded this.
    return {
      campaignId,
      loanAmount: { cp: 0, sp: 0, gp: 0, pp: 0 },
      stashSeedCoins: { cp: 0, sp: 0, gp: 0, pp: 0 },
      stashSeedItems: [],
      updatedAt: new Date(0).toISOString(),
    }
  }

  const row = data as {
    campaign_id: string
    loan_amount_cp: number
    loan_amount_sp: number
    loan_amount_gp: number
    loan_amount_pp: number
    stash_seed_cp: number
    stash_seed_sp: number
    stash_seed_gp: number
    stash_seed_pp: number
    stash_seed_items: unknown
    updated_at: string
  }

  return {
    campaignId: row.campaign_id,
    loanAmount: {
      cp: row.loan_amount_cp,
      sp: row.loan_amount_sp,
      gp: row.loan_amount_gp,
      pp: row.loan_amount_pp,
    },
    stashSeedCoins: {
      cp: row.stash_seed_cp,
      sp: row.stash_seed_sp,
      gp: row.stash_seed_gp,
      pp: row.stash_seed_pp,
    },
    stashSeedItems: (row.stash_seed_items as StarterItem[]) ?? [],
    updatedAt: row.updated_at,
  }
}

/**
 * T014 — Load every PC in the campaign plus their starter configs.
 *
 * Joined read: `pc_starter_configs × nodes × node_types` filtered by
 * the PC's campaign_id and the character slug. Returns one entry per
 * PC (missing configs are filled with defaults — defensive).
 */
export async function getPcStarterConfigsForCampaign(
  campaignId: string,
): Promise<Array<PcStarterConfig & { pcTitle: string }>> {
  const supabase = await createClient()

  // Step 1 — every PC (character) in the campaign.
  const { data: pcRows, error: pcErr } = await supabase
    .from('nodes')
    .select('id, title, type:node_types!type_id(slug)')
    .eq('campaign_id', campaignId)

  if (pcErr) {
    throw new Error(
      `getPcStarterConfigsForCampaign (nodes) failed: ${pcErr.message}`,
    )
  }

  type PcRow = {
    id: string
    title: string
    type: { slug: string } | { slug: string }[] | null
  }
  const pcs = ((pcRows ?? []) as PcRow[]).filter((n) => {
    const t = Array.isArray(n.type) ? n.type[0] : n.type
    return t?.slug === 'character'
  })

  if (pcs.length === 0) return []

  // Step 2 — starter configs for those PCs.
  const { data: cfgRows, error: cfgErr } = await supabase
    .from('pc_starter_configs')
    .select(
      'pc_id, takes_starting_loan, starting_cp, starting_sp, starting_gp, starting_pp, starting_items, updated_at',
    )
    .in(
      'pc_id',
      pcs.map((p) => p.id),
    )

  if (cfgErr) {
    throw new Error(
      `getPcStarterConfigsForCampaign (configs) failed: ${cfgErr.message}`,
    )
  }

  type CfgRow = {
    pc_id: string
    takes_starting_loan: boolean
    starting_cp: number
    starting_sp: number
    starting_gp: number
    starting_pp: number
    starting_items: unknown
    updated_at: string
  }

  const cfgByPcId = new Map<string, CfgRow>()
  for (const row of (cfgRows ?? []) as CfgRow[]) {
    cfgByPcId.set(row.pc_id, row)
  }

  return pcs.map((pc) => {
    const cfg = cfgByPcId.get(pc.id)
    if (!cfg) {
      // Defensive default: a PC without a config row (shouldn't
      // happen post-migration + PC-create hook). Treated as default.
      return {
        pcId: pc.id,
        pcTitle: pc.title,
        takesStartingLoan: true,
        startingCoins: { cp: 0, sp: 0, gp: 0, pp: 0 },
        startingItems: [],
        updatedAt: new Date(0).toISOString(),
      }
    }
    return {
      pcId: cfg.pc_id,
      pcTitle: pc.title,
      takesStartingLoan: cfg.takes_starting_loan,
      startingCoins: {
        cp: cfg.starting_cp,
        sp: cfg.starting_sp,
        gp: cfg.starting_gp,
        pp: cfg.starting_pp,
      },
      startingItems: (cfg.starting_items as StarterItem[]) ?? [],
      updatedAt: cfg.updated_at,
    }
  })
}

/**
 * T014b — Single-PC starter config (used by the PC page's block).
 * Returns `null` if the PC has no config row — callers can show an
 * empty editor in that case.
 */
export async function getPcStarterConfig(
  pcId: string,
): Promise<PcStarterConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pc_starter_configs')
    .select(
      'pc_id, takes_starting_loan, starting_cp, starting_sp, starting_gp, starting_pp, starting_items, updated_at',
    )
    .eq('pc_id', pcId)
    .maybeSingle()

  if (error) {
    throw new Error(`getPcStarterConfig failed: ${error.message}`)
  }
  if (!data) return null

  const row = data as {
    pc_id: string
    takes_starting_loan: boolean
    starting_cp: number
    starting_sp: number
    starting_gp: number
    starting_pp: number
    starting_items: unknown
    updated_at: string
  }

  return {
    pcId: row.pc_id,
    takesStartingLoan: row.takes_starting_loan,
    startingCoins: {
      cp: row.starting_cp,
      sp: row.starting_sp,
      gp: row.starting_gp,
      pp: row.starting_pp,
    },
    startingItems: (row.starting_items as StarterItem[]) ?? [],
    updatedAt: row.updated_at,
  }
}

/**
 * T015 — "Does this loop have any spec-012 autogen rows?"
 * Feeds the banner. Uses the partial index on
 * `(autogen_source_node_id, autogen_wizard_key)` — expect < 1 ms.
 */
export async function getLoopSetupStatus(
  loopNodeId: string,
): Promise<LoopSetupStatus> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('autogen_source_node_id', loopNodeId)
    .in('autogen_wizard_key', SPEC_012_WIZARD_KEYS)
    .limit(1)

  if (error) {
    throw new Error(`getLoopSetupStatus failed: ${error.message}`)
  }

  return { hasAutogenRows: (data ?? []).length > 0 }
}

/**
 * T016 — Load every existing spec-012 autogen row for a loop.
 * Feeds the reconcile step of the apply action.
 */
export async function getExistingAutogenRows(
  loopNodeId: string,
): Promise<ExistingAutogenRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, actor_pc_id, kind, amount_cp, amount_sp, amount_gp, amount_pp, item_name, item_qty, category_slug, comment, autogen_wizard_key, autogen_source_node_id, autogen_hand_touched',
    )
    .eq('autogen_source_node_id', loopNodeId)
    .in('autogen_wizard_key', SPEC_012_WIZARD_KEYS)

  if (error) {
    throw new Error(`getExistingAutogenRows failed: ${error.message}`)
  }

  type Row = {
    id: string
    actor_pc_id: string | null
    kind: 'money' | 'item' | 'transfer'
    amount_cp: number
    amount_sp: number
    amount_gp: number
    amount_pp: number
    item_name: string | null
    item_qty: number
    category_slug: string
    comment: string
    autogen_wizard_key: WizardKey
    autogen_source_node_id: string
    autogen_hand_touched: boolean
  }

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    wizardKey: r.autogen_wizard_key,
    sourceNodeId: r.autogen_source_node_id,
    actorPcId: r.actor_pc_id,
    kind: r.kind,
    coins: {
      cp: r.amount_cp,
      sp: r.amount_sp,
      gp: r.amount_gp,
      pp: r.amount_pp,
    },
    itemName: r.item_name,
    itemQty: r.item_qty,
    categorySlug: r.category_slug,
    comment: r.comment,
    handTouched: r.autogen_hand_touched,
    canonicalKey: canonicalKey(r.autogen_wizard_key, {
      actorPcId: r.actor_pc_id ?? '',
      itemName: r.item_name,
    }),
  }))
}

/**
 * T017 — Load tombstones for a loop. Used by the apply action to
 * surface hand-deleted rows in the confirmation dialog.
 */
export async function getTombstones(loopNodeId: string): Promise<Tombstone[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('autogen_tombstones')
    .select(
      'id, campaign_id, autogen_wizard_key, autogen_source_node_id, actor_pc_id, kind, item_name, deleted_at',
    )
    .eq('autogen_source_node_id', loopNodeId)
    .in('autogen_wizard_key', SPEC_012_WIZARD_KEYS)

  if (error) {
    throw new Error(`getTombstones failed: ${error.message}`)
  }

  type Row = {
    id: string
    campaign_id: string
    autogen_wizard_key: WizardKey
    autogen_source_node_id: string
    actor_pc_id: string | null
    kind: 'money' | 'item' | 'transfer'
    item_name: string | null
    deleted_at: string
  }

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    wizardKey: r.autogen_wizard_key,
    sourceNodeId: r.autogen_source_node_id,
    actorPcId: r.actor_pc_id,
    kind: r.kind,
    itemName: r.item_name,
    deletedAt: r.deleted_at,
    canonicalKey: canonicalKey(r.autogen_wizard_key, {
      actorPcId: r.actor_pc_id ?? '',
      itemName: r.item_name,
    }),
  }))
}

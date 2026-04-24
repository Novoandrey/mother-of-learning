/**
 * Spec-012 — Pure helpers for computing the desired autogen row set.
 *
 * No I/O, no Supabase, no React. Everything here is deterministic
 * and unit-tested in `__tests__/starter-setup-resolver.test.ts`.
 *
 * Two exports:
 *   * `canonicalKey` — stable string key for matching desired ↔ existing
 *     rows during diff.
 *   * `resolveDesiredRowSet` — given a loop + a campaign's starter config
 *     + per-PC configs + the stash node id, emit the deterministic set
 *     of rows the apply action should converge on.
 */

import type { CoinSet } from './transactions'
import type {
  CampaignStarterConfig,
  DesiredRow,
  PcStarterConfig,
  StarterItem,
  WizardKey,
} from './starter-setup'

// ─────────────────────────── canonicalKey ───────────────────────────

/**
 * Stable identity of a desired/existing autogen row. Used to join the
 * two sets during diff.
 *
 * For `starting_money` / `starting_loan` / `stash_seed`, each PC (or
 * the stash) has at most one row per wizard, so the key is
 * `wizardKey:actorPcId`.
 *
 * For `starting_items`, the same (actor, wizard) can produce multiple
 * rows — one per distinct item name — so the key includes the item
 * name.
 */
export function canonicalKey(
  wizardKey: WizardKey,
  row: { actorPcId: string; itemName?: string | null },
): string {
  if (wizardKey === 'starting_items') {
    // Normalize item name: trim, lowercase. Matching is case-insensitive
    // to avoid "Longsword" vs "longsword" creating duplicate diff rows.
    const name = (row.itemName ?? '').trim().toLowerCase()
    return `starting_items:${row.actorPcId}:${name}`
  }
  return `${wizardKey}:${row.actorPcId}`
}

// ─────────────────────────── resolveDesiredRowSet ───────────────────────────

const ZERO: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 }

function coinsNonZero(c: CoinSet): boolean {
  return c.cp !== 0 || c.sp !== 0 || c.gp !== 0 || c.pp !== 0
}

type ResolveParams = {
  loopNodeId: string
  stashNodeId: string
  campaignId: string
  campaignCfg: CampaignStarterConfig
  pcCfgs: PcStarterConfig[]
}

/**
 * Given the inputs, return the deterministic set of rows the apply
 * action should produce for a loop.
 *
 * Deterministic ordering — sorted by canonicalKey — so snapshot tests
 * are stable and the diff result is predictable.
 */
export function resolveDesiredRowSet(params: ResolveParams): DesiredRow[] {
  const { loopNodeId, stashNodeId, campaignCfg, pcCfgs } = params
  const rows: DesiredRow[] = []

  // ─── starting_money (per PC) ───
  for (const pc of pcCfgs) {
    if (!coinsNonZero(pc.startingCoins)) continue
    rows.push(
      makeMoneyRow({
        wizardKey: 'starting_money',
        sourceNodeId: loopNodeId,
        actorPcId: pc.pcId,
        coins: pc.startingCoins,
        categorySlug: 'starting_money',
        comment: '',
      }),
    )
  }

  // ─── starting_loan (per PC, only if flag on AND loan amount non-zero) ───
  if (coinsNonZero(campaignCfg.loanAmount)) {
    for (const pc of pcCfgs) {
      if (!pc.takesStartingLoan) continue
      rows.push(
        makeMoneyRow({
          wizardKey: 'starting_loan',
          sourceNodeId: loopNodeId,
          actorPcId: pc.pcId,
          coins: campaignCfg.loanAmount,
          categorySlug: 'credit',
          comment: '',
        }),
      )
    }
  }

  // ─── stash_seed (coins, one row on the stash) ───
  if (coinsNonZero(campaignCfg.stashSeedCoins)) {
    rows.push(
      makeMoneyRow({
        wizardKey: 'stash_seed',
        sourceNodeId: loopNodeId,
        actorPcId: stashNodeId,
        coins: campaignCfg.stashSeedCoins,
        categorySlug: 'starting_money',
        comment: '',
      }),
    )
  }

  // ─── stash_seed (items, one row per item on the stash) ───
  for (const item of campaignCfg.stashSeedItems) {
    rows.push(
      makeItemRow({
        wizardKey: 'stash_seed',
        sourceNodeId: loopNodeId,
        actorPcId: stashNodeId,
        item,
        categorySlug: 'starting_items',
        comment: '',
      }),
    )
  }

  // ─── starting_items (per PC, one row per item) ───
  for (const pc of pcCfgs) {
    for (const item of pc.startingItems) {
      rows.push(
        makeItemRow({
          wizardKey: 'starting_items',
          sourceNodeId: loopNodeId,
          actorPcId: pc.pcId,
          item,
          categorySlug: 'starting_items',
          comment: '',
        }),
      )
    }
  }

  // Deterministic order — snapshot-stable. Sort by canonical key.
  rows.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))

  return rows
}

// ─────────────────────────── helpers ───────────────────────────

function makeMoneyRow(opts: {
  wizardKey: WizardKey
  sourceNodeId: string
  actorPcId: string
  coins: CoinSet
  categorySlug: string
  comment: string
}): DesiredRow {
  return {
    wizardKey: opts.wizardKey,
    sourceNodeId: opts.sourceNodeId,
    actorPcId: opts.actorPcId,
    kind: 'money',
    coins: { ...opts.coins },
    itemName: null,
    itemQty: 1, // schema default for non-item rows
    categorySlug: opts.categorySlug,
    comment: opts.comment,
    canonicalKey: canonicalKey(opts.wizardKey, { actorPcId: opts.actorPcId }),
  }
}

function makeItemRow(opts: {
  wizardKey: WizardKey
  sourceNodeId: string
  actorPcId: string
  item: StarterItem
  categorySlug: string
  comment: string
}): DesiredRow {
  return {
    wizardKey: opts.wizardKey,
    sourceNodeId: opts.sourceNodeId,
    actorPcId: opts.actorPcId,
    kind: 'item',
    coins: { ...ZERO },
    itemName: opts.item.name,
    itemQty: opts.item.qty,
    categorySlug: opts.categorySlug,
    comment: opts.comment,
    canonicalKey: canonicalKey(opts.wizardKey, {
      actorPcId: opts.actorPcId,
      itemName: opts.item.name,
    }),
  }
}

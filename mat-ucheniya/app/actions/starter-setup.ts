'use server'

/**
 * Spec-012 — Starter setup server actions.
 *
 * Three write actions live here:
 *   - T018 updateCampaignStarterConfig — DM/owner edits the
 *     campaign-wide loan amount + stash seed (coins + items).
 *   - T019 updatePcStarterConfig — DM/owner edits a PC's starting coins
 *     + items. Player can't call this; for the loan-flag flip see T020.
 *   - T020 setPcTakesStartingLoan — the narrow player-editable surface
 *     (one boolean). DM/owner OR the PC's own owner may call it. The
 *     permission rule reuses `canEditNode` from `lib/auth.ts` so it
 *     stays in sync with the SQL `can_edit_node()` helper.
 *
 * Apply action (Phase 6) lands in this same file when T021 is wired.
 *
 * Ownership model mirrors `app/actions/categories.ts` and `transactions.ts`:
 * writes go through the admin client after an explicit membership check.
 * RLS is a safety net, not the primary boundary, so we can return clean
 * Russian errors instead of generic 403s.
 *
 * Revalidation contract (per plan.md `## Invalidation Contract`): every
 * successful write calls `revalidatePath` on the page that renders the
 * edited data, matching the plan even though existing actions don't
 * revalidate themselves — spec-012 pages are DM-only and we don't want a
 * second DM session to see stale data until they hit refresh manually.
 */

import { revalidatePath } from 'next/cache'

import { canEditNode, getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  validateCoinSet,
  validateStarterItems,
} from '@/lib/starter-setup-validation'
import {
  getCampaignStarterConfig,
  getPcStarterConfigsForCampaign,
  SPEC_012_WIZARD_KEYS,
} from '@/lib/starter-setup'
import { resolveDesiredRowSet } from '@/lib/starter-setup-resolver'
import { applyAutogenDiff, computeAutogenDiff } from '@/lib/autogen-reconcile'
import { getStashNode } from '@/lib/stash'
import type {
  ApplyResult,
  CampaignStarterConfig,
  StarterItem,
} from '@/lib/starter-setup'
import type { CoinSet } from '@/lib/transactions'

// ============================================================================
// Public result shape
// ============================================================================

export type StarterSetupActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type UpdateCampaignStarterConfigResult = StarterSetupActionResult<{
  config: CampaignStarterConfig
}>

// ============================================================================
// Input shapes
// ============================================================================

/**
 * Patch semantics: every field is optional. An absent field is left
 * untouched in the DB; a present field is validated and written. Callers
 * pass only what they want to change — the campaign page editor doesn't
 * need to re-send the full row every time.
 */
export type UpdateCampaignStarterConfigPatch = {
  loanAmount?: CoinSet
  stashSeedCoins?: CoinSet
  stashSeedItems?: StarterItem[]
}

// ============================================================================
// Internal: auth gate (shared by T018–T020)
// ============================================================================

type DmAuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

/**
 * DM / owner gate. Narrowed copy of the pattern in `categories.ts` —
 * kept local to avoid cross-module imports for a 10-line helper and to
 * make the Russian error strings spec-012-specific if we ever want them
 * to diverge.
 */
async function requireDmOrOwner(campaignId: string): Promise<DmAuthResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  if (membership.role !== 'owner' && membership.role !== 'dm') {
    return {
      ok: false,
      error: 'Только ДМ или владелец может менять стартовый сетап',
    }
  }

  return { ok: true, userId: user.id }
}

// ============================================================================
// Internal: row → typed config mapper
// ============================================================================

type CampaignStarterConfigRow = {
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

function mapCampaignStarterConfigRow(
  row: CampaignStarterConfigRow,
): CampaignStarterConfig {
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

// ============================================================================
// T018 — updateCampaignStarterConfig
// ============================================================================

/**
 * DM/owner edits the campaign-wide starter config. Each field is
 * optional — omit what you don't want to change. Returns the fully
 * hydrated config row after the write so callers can update local
 * state without a follow-up read.
 *
 * On success, revalidates `/c/[slug]/accounting/starter-setup`. If the
 * slug lookup fails (deleted campaign, FK drift), we skip revalidation
 * rather than throw — the write itself succeeded.
 */
export async function updateCampaignStarterConfig(
  campaignId: string,
  patch: UpdateCampaignStarterConfigPatch,
): Promise<UpdateCampaignStarterConfigResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const auth = await requireDmOrOwner(campaignId)
  if (!auth.ok) return auth

  // Build the UPDATE payload piece by piece so we only validate and
  // touch the columns the caller explicitly passed.
  const update: Record<string, number | string | StarterItem[]> = {}

  if (patch.loanAmount !== undefined) {
    const v = validateCoinSet(patch.loanAmount)
    if (!v.ok) return { ok: false, error: `Стартовый кредит: ${v.error}` }
    update.loan_amount_cp = v.value.cp
    update.loan_amount_sp = v.value.sp
    update.loan_amount_gp = v.value.gp
    update.loan_amount_pp = v.value.pp
  }

  if (patch.stashSeedCoins !== undefined) {
    const v = validateCoinSet(patch.stashSeedCoins)
    if (!v.ok) return { ok: false, error: `Стартовые монеты общака: ${v.error}` }
    update.stash_seed_cp = v.value.cp
    update.stash_seed_sp = v.value.sp
    update.stash_seed_gp = v.value.gp
    update.stash_seed_pp = v.value.pp
  }

  if (patch.stashSeedItems !== undefined) {
    const v = validateStarterItems(patch.stashSeedItems)
    if (!v.ok) return { ok: false, error: `Стартовые предметы общака: ${v.error}` }
    update.stash_seed_items = v.value
  }

  if (Object.keys(update).length === 0) {
    // Nothing to write — idempotent happy path, just return the current row.
    return readCurrentConfig(campaignId)
  }

  // Stamp updated_at explicitly — the column's default only fires on INSERT.
  update.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('campaign_starter_configs')
    .update(update)
    .eq('campaign_id', campaignId)
    .select(
      'campaign_id, loan_amount_cp, loan_amount_sp, loan_amount_gp, loan_amount_pp, stash_seed_cp, stash_seed_sp, stash_seed_gp, stash_seed_pp, stash_seed_items, updated_at',
    )
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: `Не удалось сохранить стартовый сетап: ${error.message}`,
    }
  }

  if (!data) {
    // The migration seeds one row per campaign; a missing row here means
    // the campaign itself was deleted under us. Surface a clean message.
    return {
      ok: false,
      error: 'Кампания не найдена или была удалена',
    }
  }

  const config = mapCampaignStarterConfigRow(data as CampaignStarterConfigRow)

  // Revalidate the starter-setup page. Slug lookup uses the user-context
  // client — read-only, RLS permits any member. Failure here doesn't roll
  // back the write.
  await revalidateStarterSetupPath(campaignId)

  return { ok: true, config }
}

// ============================================================================
// T019 — updatePcStarterConfig
// ============================================================================

type PcLookup = {
  pcId: string
  campaignId: string
  campaignSlug: string
}

/**
 * Resolve `pcId → (campaignId, slug)` in one read. Used by T019 and T020
 * to drive both the DM-check (which needs campaignId) and the
 * revalidation (which needs slug) without two separate lookups.
 *
 * Uses the admin client so we don't get an RLS 404 if the caller is a
 * player looking at someone else's PC — the DM check happens after.
 * Returns `null` if the PC node doesn't exist.
 */
async function resolvePcLookup(pcId: string): Promise<PcLookup | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('nodes')
    .select('id, campaign_id, campaign:campaigns!campaign_id(slug)')
    .eq('id', pcId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    id: string
    campaign_id: string
    campaign: { slug: string } | { slug: string }[] | null
  }
  const campaign = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign
  if (!campaign?.slug) return null

  return {
    pcId: row.id,
    campaignId: row.campaign_id,
    campaignSlug: campaign.slug,
  }
}

/**
 * Patch semantics mirror T018: optional fields, validate present ones,
 * skip absent ones. Critically, `takesStartingLoan` is NOT accepted
 * here — it's the player-editable field and goes through T020
 * (`setPcTakesStartingLoan`) which has a different permission model.
 * Passing it here returns an error so callers can't accidentally
 * silence the distinction.
 */
export type UpdatePcStarterConfigPatch = {
  startingCoins?: CoinSet
  startingItems?: StarterItem[]
  /** @deprecated Forbidden here — use `setPcTakesStartingLoan` (T020) instead. */
  takesStartingLoan?: never
}

export async function updatePcStarterConfig(
  pcId: string,
  patch: UpdatePcStarterConfigPatch & { takesStartingLoan?: unknown },
): Promise<StarterSetupActionResult> {
  if (!pcId) return { ok: false, error: 'Не указан персонаж' }

  // Explicit rejection of the player-editable field. The T019 patch type
  // forbids it at compile time, but JS callers (or a malicious client)
  // could still smuggle it through — handle that cleanly.
  if ('takesStartingLoan' in patch && patch.takesStartingLoan !== undefined) {
    return {
      ok: false,
      error:
        'Флаг «Берёт стартовый кредит» меняется отдельным действием (setPcTakesStartingLoan)',
    }
  }

  const pc = await resolvePcLookup(pcId)
  if (!pc) return { ok: false, error: 'Персонаж не найден' }

  const auth = await requireDmOrOwner(pc.campaignId)
  if (!auth.ok) return auth

  const update: Record<string, number | string | StarterItem[]> = {}

  if (patch.startingCoins !== undefined) {
    const v = validateCoinSet(patch.startingCoins)
    if (!v.ok) return { ok: false, error: `Стартовые монеты: ${v.error}` }
    update.starting_cp = v.value.cp
    update.starting_sp = v.value.sp
    update.starting_gp = v.value.gp
    update.starting_pp = v.value.pp
  }

  if (patch.startingItems !== undefined) {
    const v = validateStarterItems(patch.startingItems)
    if (!v.ok) return { ok: false, error: `Стартовые предметы: ${v.error}` }
    update.starting_items = v.value
  }

  if (Object.keys(update).length === 0) {
    // Nothing to write — idempotent happy path.
    return { ok: true }
  }

  update.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  const { error } = await admin
    .from('pc_starter_configs')
    .update(update)
    .eq('pc_id', pcId)

  if (error) {
    return {
      ok: false,
      error: `Не удалось сохранить стартовый сетап персонажа: ${error.message}`,
    }
  }

  revalidatePath(`/c/${pc.campaignSlug}/catalog/${pcId}`)

  return { ok: true }
}

// ============================================================================
// T020 — setPcTakesStartingLoan
// ============================================================================

/**
 * The one player-editable surface in spec-012. Permission model is
 * wider than T019: in addition to DM/owner, the PC's own owner (i.e.
 * a member of `node_pc_owners`) may flip their flag.
 *
 * Implementation reuses `canEditNode` from `lib/auth.ts`, which
 * already encodes the exact rule we want — mirroring the SQL
 * `can_edit_node()` helper from migration 031 so the app-layer check
 * and the RLS safety net stay in sync.
 */
export async function setPcTakesStartingLoan(
  pcId: string,
  value: boolean,
): Promise<StarterSetupActionResult> {
  if (!pcId) return { ok: false, error: 'Не указан персонаж' }
  if (typeof value !== 'boolean') {
    return { ok: false, error: 'Значение флага должно быть true/false' }
  }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const pc = await resolvePcLookup(pcId)
  if (!pc) return { ok: false, error: 'Персонаж не найден' }

  const membership = await getMembership(pc.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  // canEditNode mirrors migration 031's can_edit_node() SQL:
  //   - owner/dm → true for any node
  //   - player   → true only if present in node_pc_owners
  const allowed = await canEditNode(
    pcId,
    pc.campaignId,
    user.id,
    membership.role,
  )
  if (!allowed) {
    return {
      ok: false,
      error: 'Только ДМ или владелец персонажа может менять этот флаг',
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pc_starter_configs')
    .update({
      takes_starting_loan: value,
      updated_at: new Date().toISOString(),
    })
    .eq('pc_id', pcId)

  if (error) {
    return {
      ok: false,
      error: `Не удалось сохранить флаг: ${error.message}`,
    }
  }

  revalidatePath(`/c/${pc.campaignSlug}/catalog/${pcId}`)

  return { ok: true }
}

// ============================================================================
// T021 — applyLoopStartSetup (the core of spec-012)
// ============================================================================

/**
 * Two-phase, diff-based, idempotent reapply of the starter setup for a
 * single loop.
 *
 * First call (without `opts.confirmed`):
 *   1. loads campaign + PC configs and the current autogen row set
 *   2. computes the desired set via the pure resolver
 *   3. diffs desired vs existing and identifies rows that would be
 *      overwritten despite being hand-touched (FR-013b) or that the
 *      DM previously hand-deleted (tombstones)
 *   4. if any are "affected", returns `{ needsConfirmation, affected }`
 *      without writing anything — the UI shows the dialog
 *
 * Second call (with `opts.confirmed = true`):
 *   * skips the confirmation short-circuit and executes the diff
 *     atomically through the `apply_loop_start_setup` RPC (T022).
 *
 * Orphan rows — rows whose `actor_pc_id` is no longer in the current
 * PC config list — are preserved (FR-014). They look like `toDelete`
 * candidates to the naive diff; we filter them out before the RPC
 * call and before affected-row identification, so hand-edits on an
 * orphan don't block a reapply with a phantom confirmation.
 */
export async function applyLoopStartSetup(
  loopNodeId: string,
  opts: { confirmed?: boolean } = {},
): Promise<ApplyResult> {
  if (!loopNodeId) return { ok: false, error: 'Не указана петля' }

  // ─── Step 1: auth + loop lookup ───
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data: loopRow, error: loopErr } = await admin
    .from('nodes')
    .select(
      'id, title, campaign_id, fields, type:node_types!type_id(slug), campaign:campaigns!campaign_id(slug)',
    )
    .eq('id', loopNodeId)
    .maybeSingle()

  if (loopErr) {
    return { ok: false, error: `Не удалось загрузить петлю: ${loopErr.message}` }
  }
  if (!loopRow) return { ok: false, error: 'Петля не найдена' }

  type LoopRow = {
    id: string
    title: string
    campaign_id: string
    fields: Record<string, unknown> | null
    type: { slug: string } | { slug: string }[] | null
    campaign: { slug: string } | { slug: string }[] | null
  }
  const row = loopRow as LoopRow
  const typeSlug = Array.isArray(row.type) ? row.type[0]?.slug : row.type?.slug
  if (typeSlug !== 'loop') {
    return { ok: false, error: 'Указанный узел не является петлёй' }
  }
  const campaignSlug = Array.isArray(row.campaign)
    ? row.campaign[0]?.slug
    : row.campaign?.slug
  if (!campaignSlug) return { ok: false, error: 'Кампания не найдена' }

  const campaignId = row.campaign_id
  const loopNumberRaw = (row.fields ?? {})['number']
  const loopNumber =
    typeof loopNumberRaw === 'number'
      ? loopNumberRaw
      : Number(String(loopNumberRaw ?? '').trim())
  if (!Number.isFinite(loopNumber) || loopNumber <= 0) {
    return { ok: false, error: 'У петли не задан номер' }
  }

  // ─── Step 1b: DM/owner gate ───
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    return {
      ok: false,
      error: 'Только ДМ или владелец может применять стартовый сетап',
    }
  }

  // ─── Step 2: load config ───
  const campaignCfg = await getCampaignStarterConfig(campaignId)
  const pcCfgs = await getPcStarterConfigsForCampaign(campaignId)
  const stash = await getStashNode(campaignId)

  const stashSeedNonEmpty =
    coinsNonZero(campaignCfg.stashSeedCoins) ||
    campaignCfg.stashSeedItems.length > 0
  if (stashSeedNonEmpty && !stash) {
    return {
      ok: false,
      error:
        'В стартовом сетапе заданы монеты/предметы для общака, но общак в кампании не создан',
    }
  }

  // Placeholder — never enters the output rows when stash seed is empty
  // (the resolver checks that before emitting stash rows).
  const stashNodeId = stash?.nodeId ?? loopNodeId

  // ─── Step 3: compute desired ───
  const desired = resolveDesiredRowSet({
    loopNodeId,
    stashNodeId,
    campaignId,
    campaignCfg,
    pcCfgs: pcCfgs.map((p) => ({
      pcId: p.pcId,
      takesStartingLoan: p.takesStartingLoan,
      startingCoins: p.startingCoins,
      startingItems: p.startingItems,
      updatedAt: p.updatedAt,
    })),
  })

  // ─── Step 4–7: load existing + tombstones, diff, orphan-filter,
  // hydrate actor titles, identify affected rows. All generic — see
  // `lib/autogen-reconcile.ts`.
  //
  // FR-014 orphan rule: a valid actor is either a current PC or the
  // stash. Rows whose actor was removed since last apply stay put
  // (audit trail preserved); the orphan filter inside computeAutogenDiff
  // takes care of this for us.
  const validActorIds: string[] = [
    ...pcCfgs.map((p) => p.pcId),
    ...(stash ? [stash.nodeId] : []),
  ]

  const { diff: filteredDiff, affected } = await computeAutogenDiff({
    sourceNodeId: loopNodeId,
    wizardKeys: SPEC_012_WIZARD_KEYS,
    desiredRows: desired,
    validActorIds,
  })

  // ─── Step 8: two-phase short-circuit ───
  if (affected.length > 0 && !opts.confirmed) {
    return { needsConfirmation: true, affected }
  }

  // ─── Step 9 + 10: execute via shared apply helper (RPC under the
  // hood). Throws on RPC error — let it bubble up as a 500-equivalent;
  // the action wrapper below converts to the typed error shape.
  let summary
  try {
    summary = await applyAutogenDiff({
      diff: filteredDiff,
      context: {
        campaignId,
        sourceNodeId: loopNodeId,
        wizardKey: 'starting_money', // unused by current RPC; per-row keys win
        loopNumber,
        // Starter rows land on day 1 of the loop by convention — the very
        // beginning of the loop's timeline. UI surfaces them with the
        // autogen badge (Phase 11), so the day pin isn't user-visible
        // clutter.
        dayInLoop: 1,
        authorUserId: user.id,
      },
    })
  } catch (e) {
    return {
      ok: false,
      error: `Не удалось применить стартовый сетап: ${
        e instanceof Error ? e.message : String(e)
      }`,
    }
  }

  // ─── Step 11: revalidate ───
  revalidatePath(`/c/${campaignSlug}/loops`)
  revalidatePath(`/c/${campaignSlug}/accounting`)

  // ─── Step 12: done ───
  return { ok: true, summary }
}

// ─── local helpers ───

function coinsNonZero(c: CoinSet): boolean {
  return c.cp !== 0 || c.sp !== 0 || c.gp !== 0 || c.pp !== 0
}

// ============================================================================
// Internals: read-only fallback + slug lookup for revalidation
// ============================================================================

/**
 * Empty-patch / refetch path. Reuses the row-mapper so the action's
 * return shape stays identical whether anything was actually written.
 */
async function readCurrentConfig(
  campaignId: string,
): Promise<UpdateCampaignStarterConfigResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('campaign_starter_configs')
    .select(
      'campaign_id, loan_amount_cp, loan_amount_sp, loan_amount_gp, loan_amount_pp, stash_seed_cp, stash_seed_sp, stash_seed_gp, stash_seed_pp, stash_seed_items, updated_at',
    )
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: `Не удалось прочитать стартовый сетап: ${error.message}`,
    }
  }
  if (!data) return { ok: false, error: 'Кампания не найдена' }

  return {
    ok: true,
    config: mapCampaignStarterConfigRow(data as CampaignStarterConfigRow),
  }
}

/**
 * Look up the campaign's slug and revalidate the starter-setup page. We
 * use the user-context client here (not admin) because RLS already
 * permits any member to select from `campaigns` and this keeps the
 * admin-client blast radius small.
 *
 * If the slug can't be resolved we swallow the error — the UPDATE
 * succeeded and a client-side `router.refresh()` will pick up the
 * change anyway.
 */
async function revalidateStarterSetupPath(campaignId: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('campaigns')
      .select('slug')
      .eq('id', campaignId)
      .maybeSingle()

    const slug = (data as { slug?: string } | null)?.slug
    if (!slug) return

    revalidatePath(`/c/${slug}/accounting/starter-setup`)
  } catch {
    // Best-effort — write already committed.
  }
}

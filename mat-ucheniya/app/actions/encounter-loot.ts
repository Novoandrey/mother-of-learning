'use server'

/**
 * Spec-013 — Encounter loot server actions.
 *
 * Four actions:
 *   - T010 getEncounterLootDraft — member-read; lazy-creates an empty
 *     draft on first call. Idempotent under concurrent first-mounts
 *     (upsert + re-select pattern).
 *   - T012 updateEncounterLootDraft — DM-only; partial patch (lines /
 *     loop_number / day_in_loop). Validates via T008 helpers.
 *   - T013 setAllToStashShortcut — DM-only; rewrites every line to
 *     `recipient_mode='stash'`, `recipient_pc_id=null`. No apply.
 *   - T014 applyEncounterLoot — DM-only; full reconcile path. Bridges
 *     encounter-loot DesiredRows to spec-012's `DesiredRow` shape, then
 *     calls `computeAutogenDiff` + `applyAutogenDiff` from
 *     `lib/autogen-reconcile.ts` (T004). Two-phase confirm via
 *     `affected.length > 0`.
 *
 * Auth pattern matches `app/actions/starter-setup.ts`: writes go
 * through admin client after explicit membership check, RLS is the
 * safety net. DM-only actions return Russian error messages safe to
 * toast.
 */

import { revalidatePath } from 'next/cache'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  applyAutogenDiff,
  computeAutogenDiff,
} from '@/lib/autogen-reconcile'
import { resolveEncounterLootDesiredRows } from '@/lib/encounter-loot-resolver'
import {
  validateLootDraftPatch,
  validateLootDraftReady,
} from '@/lib/encounter-loot-validation'
import { canonicalKey } from '@/lib/starter-setup-resolver'
import { getStashNode } from '@/lib/stash'
import type { DesiredRow } from '@/lib/starter-setup'
import type {
  EncounterLootDesiredRow,
  LootDraft,
  LootLine,
} from '@/lib/encounter-loot-types'
import type { LootDraftPatch } from '@/lib/encounter-loot-validation'

// ─────────────────────────── shared types ───────────────────────────

export type LootActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type ApplyEncounterLootResult =
  | { ok: true; rowsAffected: number }
  | { needsConfirmation: true; affected: import('@/lib/starter-setup').AffectedRow[] }
  | { ok: false; error: string }

// ─────────────────────────── shared helpers ───────────────────────────

type EncounterAccess = {
  campaignId: string
  campaignSlug: string
  status: 'active' | 'completed'
  mirrorNodeId: string
}

/**
 * Resolve encounter context + auth. Returns either the access info
 * (mode='dm' for DM/owner, 'member' for plain players) or an error
 * shape ready to forward.
 */
async function resolveEncounterAccess(
  encounterId: string,
  required: 'member' | 'dm',
): Promise<
  | { ok: true; access: EncounterAccess; userId: string }
  | { ok: false; error: string }
> {
  if (!encounterId) return { ok: false, error: 'Не указан энкаунтер' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data: encRow, error: encErr } = await admin
    .from('encounters')
    .select(
      'id, campaign_id, status, node_id, campaign:campaigns!campaign_id(slug)',
    )
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) {
    return { ok: false, error: `Ошибка чтения энкаунтера: ${encErr.message}` }
  }
  if (!encRow) return { ok: false, error: 'Энкаунтер не найден' }

  type Row = {
    id: string
    campaign_id: string
    status: 'active' | 'completed'
    node_id: string
    campaign: { slug: string } | { slug: string }[] | null
  }
  const row = encRow as Row
  const campaignSlug = Array.isArray(row.campaign)
    ? row.campaign[0]?.slug
    : row.campaign?.slug
  if (!campaignSlug) return { ok: false, error: 'Кампания не найдена' }

  const membership = await getMembership(row.campaign_id)
  if (!membership) {
    return { ok: false, error: 'Нет доступа к этой кампании' }
  }
  if (required === 'dm') {
    if (membership.role !== 'owner' && membership.role !== 'dm') {
      return {
        ok: false,
        error: 'Только ДМ или владелец может изменять лут энкаунтера',
      }
    }
  }

  return {
    ok: true,
    userId: user.id,
    access: {
      campaignId: row.campaign_id,
      campaignSlug,
      status: row.status,
      mirrorNodeId: row.node_id,
    },
  }
}

const EMPTY_DRAFT_LINES: LootLine[] = []

function rowToDraft(
  row: {
    encounter_id: string
    lines: unknown
    loop_number: number | null
    day_in_loop: number | null
    money_distribution_mode: string | null
    money_distribution_pc_id: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
  },
): LootDraft {
  // The DB stores lines as JSONB. We trust the schema here for the read
  // path; writes always validate. Defence: if shape is wrong, fall
  // back to empty array so the panel still renders.
  const lines = Array.isArray(row.lines) ? (row.lines as LootLine[]) : []

  // Reassemble money_distribution from the two columns. Defaults to
  // 'stash' if either column is missing (e.g. a draft created before
  // migration 040 — shouldn't happen in practice given the column
  // default, but defence in depth).
  const mode = row.money_distribution_mode
  let money_distribution: LootDraft['money_distribution']
  if (mode === 'pc' && row.money_distribution_pc_id) {
    money_distribution = { mode: 'pc', pc_id: row.money_distribution_pc_id }
  } else if (mode === 'split_evenly') {
    money_distribution = { mode: 'split_evenly', pc_id: null }
  } else {
    money_distribution = { mode: 'stash', pc_id: null }
  }

  return {
    encounter_id: row.encounter_id,
    lines,
    loop_number: row.loop_number,
    day_in_loop: row.day_in_loop,
    money_distribution,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ═══════════════════════════════════════════════════════════════════
// T010 — getEncounterLootDraft
// ═══════════════════════════════════════════════════════════════════

/**
 * Member-read draft fetch. Lazy-creates an empty draft on first call;
 * concurrent first-calls race-safe via upsert + re-select.
 */
export async function getEncounterLootDraft(
  encounterId: string,
): Promise<LootDraft | null> {
  const access = await resolveEncounterAccess(encounterId, 'member')
  if (!access.ok) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('encounter_loot_drafts')
    .select(
      'encounter_id, lines, loop_number, day_in_loop, money_distribution_mode, money_distribution_pc_id, updated_by, created_at, updated_at',
    )
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (error) {
    throw new Error(`getEncounterLootDraft: ${error.message}`)
  }
  if (data) {
    return rowToDraft(
      data as Parameters<typeof rowToDraft>[0],
    )
  }

  // Lazy-create. Use admin (the table has no INSERT policy — writes go
  // through this controlled path). Ignore conflicts so two browser
  // tabs racing the first mount don't error out.
  const admin = createAdminClient()
  const { error: insErr } = await admin
    .from('encounter_loot_drafts')
    .upsert(
      {
        encounter_id: encounterId,
        lines: EMPTY_DRAFT_LINES,
        loop_number: null,
        day_in_loop: null,
      },
      { onConflict: 'encounter_id', ignoreDuplicates: true },
    )

  if (insErr) {
    // Don't crash a member's read just because lazy-create failed —
    // log via thrown error in dev, return null in prod-like.
    throw new Error(`getEncounterLootDraft (upsert): ${insErr.message}`)
  }

  // Re-select to pick up either our insert or a concurrent insert.
  const { data: data2, error: err2 } = await supabase
    .from('encounter_loot_drafts')
    .select(
      'encounter_id, lines, loop_number, day_in_loop, money_distribution_mode, money_distribution_pc_id, updated_by, created_at, updated_at',
    )
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (err2) {
    throw new Error(`getEncounterLootDraft (re-select): ${err2.message}`)
  }
  if (!data2) return null
  return rowToDraft(data2 as Parameters<typeof rowToDraft>[0])
}

// ═══════════════════════════════════════════════════════════════════
// T012 — updateEncounterLootDraft
// ═══════════════════════════════════════════════════════════════════

export async function updateEncounterLootDraft(
  encounterId: string,
  patch: LootDraftPatch,
): Promise<LootActionResult> {
  const access = await resolveEncounterAccess(encounterId, 'dm')
  if (!access.ok) return { ok: false, error: access.error }

  const validation = validateLootDraftPatch(patch)
  if (!validation.ok) return { ok: false, error: validation.error }

  const v = validation.value
  if (Object.keys(v).length === 0) {
    return { ok: true } // empty patch → no-op success
  }

  // Ensure a draft row exists (the panel calls getEncounterLootDraft
  // first, but be defensive — direct calls from tests etc.).
  await ensureDraftRow(encounterId)

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {
    updated_by: access.userId,
  }
  if (v.lines !== undefined) updates.lines = v.lines
  if (v.loop_number !== undefined) updates.loop_number = v.loop_number
  if (v.day_in_loop !== undefined) updates.day_in_loop = v.day_in_loop
  if (v.money_distribution !== undefined) {
    updates.money_distribution_mode = v.money_distribution.mode
    updates.money_distribution_pc_id = v.money_distribution.pc_id
  }

  const { error } = await admin
    .from('encounter_loot_drafts')
    .update(updates)
    .eq('encounter_id', encounterId)

  if (error) {
    return { ok: false, error: `Ошибка сохранения: ${error.message}` }
  }

  revalidatePath(
    `/c/${access.access.campaignSlug}/encounters/${encounterId}`,
  )
  return { ok: true }
}

async function ensureDraftRow(encounterId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('encounter_loot_drafts')
    .upsert(
      {
        encounter_id: encounterId,
        lines: EMPTY_DRAFT_LINES,
        loop_number: null,
        day_in_loop: null,
      },
      { onConflict: 'encounter_id', ignoreDuplicates: true },
    )
}

// ═══════════════════════════════════════════════════════════════════
// T014 — applyEncounterLoot
// ═══════════════════════════════════════════════════════════════════

const ENCOUNTER_LOOT_WIZARD_KEY = 'encounter_loot' as const
const ENCOUNTER_LOOT_CATEGORY_SLUG = 'loot' // seeded in 034 + per-campaign default
const ENCOUNTER_LOOT_COMMENT = 'Лут энкаунтера'

export async function applyEncounterLoot(
  encounterId: string,
  options: { confirmed?: boolean } = {},
): Promise<ApplyEncounterLootResult> {
  // ── Step 1: auth + encounter lookup ──
  const access = await resolveEncounterAccess(encounterId, 'dm')
  if (!access.ok) return { ok: false, error: access.error }

  const { campaignId, campaignSlug, mirrorNodeId } = access.access

  // Note: spec originally gated apply on `status === 'completed'`
  // (FR-010), but there's no UI to flip status from the encounter
  // page and DMs reasonably want to distribute loot mid-fight or
  // before formally closing the encounter. Status guard removed in
  // chat 50 polish. The panel + summary stay visible regardless of
  // status; flipping status remains an internal field for the
  // tracker's «Завершён» badge.

  // ── Step 2: load draft + validate ──
  const draft = await getEncounterLootDraft(encounterId)
  if (!draft) {
    return { ok: false, error: 'Черновик лута не найден' }
  }
  const ready = validateLootDraftReady(draft)
  if (!ready.ok) return { ok: false, error: ready.error }

  // ── Step 3: resolve participants (initiative-ordered, PCs only) ──
  const admin = createAdminClient()
  const { data: partRows, error: partErr } = await admin
    .from('encounter_participants')
    .select(
      'id, node_id, initiative, sort_order, created_at, type:nodes!encounter_participants_node_id_fkey(type:node_types!type_id(slug))',
    )
    .eq('encounter_id', encounterId)
    // initiative DESC NULLS LAST → sort_order ASC → created_at ASC
    .order('initiative', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (partErr) {
    return { ok: false, error: `Не удалось загрузить участников: ${partErr.message}` }
  }

  type PartRow = {
    id: string
    node_id: string | null
    initiative: number | null
    sort_order: number
    created_at: string
    type:
      | { type: { slug: string } | { slug: string }[] | null }
      | { type: { slug: string } | { slug: string }[] | null }[]
      | null
  }
  const participantPcIds: string[] = []
  for (const r of (partRows ?? []) as PartRow[]) {
    if (!r.node_id) continue
    const nodeWrap = Array.isArray(r.type) ? r.type[0] : r.type
    const typeWrap = nodeWrap
      ? Array.isArray(nodeWrap.type)
        ? nodeWrap.type[0]
        : nodeWrap.type
      : null
    if (typeWrap?.slug === 'character') {
      participantPcIds.push(r.node_id)
    }
  }

  // ── Step 4: stash node id (may be null if campaign hasn't been seeded) ──
  const stash = await getStashNode(campaignId)
  const stashNodeId = stash?.nodeId ?? ''
  // Defence: stash is needed when (a) money_distribution=stash and there's
  // any money, or (b) any item line targets stash. Fail loudly if missing.
  const totalMoneyCp = draft.lines.reduce((sum, l) => {
    if (l.kind === 'coin') {
      return sum + l.cp + 10 * l.sp + 100 * l.gp + 1000 * l.pp
    }
    return sum
  }, 0)
  const moneyNeedsStash =
    draft.money_distribution.mode === 'stash' && totalMoneyCp > 0
  const itemNeedsStash = draft.lines.some(
    (l) => l.kind === 'item' && l.recipient_mode === 'stash',
  )
  const needsStash = moneyNeedsStash || itemNeedsStash
  if (needsStash && !stashNodeId) {
    return {
      ok: false,
      error: 'В черновике есть строки в общак, но общак в кампании не создан',
    }
  }

  // ── Step 5: encounter-loot resolver → DesiredRow[] ──
  const lootRows = resolveEncounterLootDesiredRows({
    draft,
    participantPcIds,
    stashNodeId,
  })

  // Bridge to spec-012 DesiredRow shape (with wizardKey, sourceNodeId,
  // categorySlug, comment, canonicalKey).
  const desiredRows: DesiredRow[] = lootRows.map((r) =>
    bridgeToAutogenDesiredRow(r, mirrorNodeId),
  )

  // ── Step 6: computeAutogenDiff ──
  const { diff, affected } = await computeAutogenDiff({
    sourceNodeId: mirrorNodeId,
    wizardKeys: [ENCOUNTER_LOOT_WIZARD_KEY],
    desiredRows,
    validActorIds: [
      ...participantPcIds,
      ...(stashNodeId ? [stashNodeId] : []),
    ],
  })

  // ── Step 7: two-phase short-circuit ──
  if (affected.length > 0 && !options.confirmed) {
    return { needsConfirmation: true, affected }
  }

  // ── Step 8: apply ──
  let summary
  try {
    summary = await applyAutogenDiff({
      diff,
      context: {
        campaignId,
        sourceNodeId: mirrorNodeId,
        wizardKey: ENCOUNTER_LOOT_WIZARD_KEY,
        loopNumber: draft.loop_number as number, // checked by validateLootDraftReady
        dayInLoop: draft.day_in_loop as number,
        authorUserId: access.userId,
      },
    })
  } catch (e) {
    return {
      ok: false,
      error: `Не удалось применить лут: ${
        e instanceof Error ? e.message : String(e)
      }`,
    }
  }

  // ── Step 8b: clean encounter_loot tombstones for this source ──
  // The shared `apply_loop_start_setup` RPC hardcodes spec-012 keys in
  // its tombstone-cleanup step; spec-013 needs to clean its own.
  await admin
    .from('autogen_tombstones')
    .delete()
    .eq('autogen_source_node_id', mirrorNodeId)
    .eq('autogen_wizard_key', ENCOUNTER_LOOT_WIZARD_KEY)

  // ── Step 9: revalidate ──
  revalidatePath(`/c/${campaignSlug}/encounters/${encounterId}`)
  revalidatePath(`/c/${campaignSlug}/accounting`)
  if (needsStash) {
    revalidatePath(`/c/${campaignSlug}/accounting/stash`)
  }
  // Per-PC catalog pages for any actor touched in this apply.
  const touchedPcIds = new Set<string>()
  for (const r of diff.toInsert) if (r.actorPcId) touchedPcIds.add(r.actorPcId)
  for (const p of diff.toUpdate) if (p.existing.actorPcId) touchedPcIds.add(p.existing.actorPcId)
  for (const r of diff.toDelete) if (r.actorPcId) touchedPcIds.add(r.actorPcId)
  for (const pcId of touchedPcIds) {
    if (pcId === stashNodeId) continue // stash already revalidated
    revalidatePath(`/c/${campaignSlug}/catalog/${pcId}`)
  }

  return {
    ok: true,
    rowsAffected:
      summary.insertedCount + summary.updatedCount + summary.deletedCount,
  }
}

/**
 * Convert an encounter-loot resolver row into spec-012's full
 * DesiredRow shape. Static `categorySlug='loot'` and
 * `comment='Лут энкаунтера'` keep the diff stable across encounter
 * renames (the autogen badge tooltip shows the encounter title
 * dynamically; the `comment` field is for inline display next to the
 * actor and doesn't need to repeat the title).
 */
function bridgeToAutogenDesiredRow(
  row: EncounterLootDesiredRow,
  sourceNodeId: string,
): DesiredRow {
  if (row.kind === 'money') {
    return {
      wizardKey: ENCOUNTER_LOOT_WIZARD_KEY,
      sourceNodeId,
      actorPcId: row.actor_pc_id,
      kind: 'money',
      coins: { cp: row.cp, sp: row.sp, gp: row.gp, pp: row.pp },
      itemName: null,
      itemQty: 1,
      categorySlug: ENCOUNTER_LOOT_CATEGORY_SLUG,
      comment: ENCOUNTER_LOOT_COMMENT,
      canonicalKey: canonicalKey(ENCOUNTER_LOOT_WIZARD_KEY, {
        actorPcId: row.actor_pc_id,
        itemName: null,
      }),
    }
  }
  return {
    wizardKey: ENCOUNTER_LOOT_WIZARD_KEY,
    sourceNodeId,
    actorPcId: row.actor_pc_id,
    kind: 'item',
    coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
    itemName: row.item_name,
    itemQty: row.item_qty,
    categorySlug: ENCOUNTER_LOOT_CATEGORY_SLUG,
    comment: ENCOUNTER_LOOT_COMMENT,
    canonicalKey: canonicalKey(ENCOUNTER_LOOT_WIZARD_KEY, {
      actorPcId: row.actor_pc_id,
      itemName: row.item_name,
    }),
  }
}

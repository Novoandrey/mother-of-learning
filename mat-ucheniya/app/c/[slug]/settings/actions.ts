'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCampaignBySlug,
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/campaign'
import { getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { isHpMethod } from '@/lib/statblock'
import {
  computeApplyPlan,
  type ApplyPlan,
  type ApplyPlanItem,
} from '@/lib/apply-default-prices'
import type { Rarity } from '@/lib/items-types'

/**
 * Merge hp_method into campaigns.settings jsonb without overwriting other keys.
 *
 * Defence-in-depth: requires the caller to be owner/dm of this campaign.
 * UI already hides the Save button from players (spec-006 increment 3), but
 * if a player crafts a POST manually we silently no-op rather than bubbling
 * an error. Hard RLS blocking comes in increment 4.
 *
 * No-op if the incoming value isn't a valid HpMethod.
 */
export async function updateCampaignHpMethod(slug: string, rawMethod: string) {
  if (!isHpMethod(rawMethod)) return

  // Silent auth gate — no redirects from inside the action's own code path.
  const result = await getCurrentUserAndProfile()
  if (!result || !result.profile || result.profile.must_change_password) return

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return

  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    return
  }

  const supabase = await createClient()

  const next = { ...campaign.settings, hp_method: rawMethod }

  await supabase.from('campaigns').update({ settings: next }).eq('id', campaign.id)
}

/**
 * Spec-015 follow-up (chat 70). Merge `item_default_prices` into
 * `campaigns.settings`. The incoming object is parsed via
 * `parseItemDefaultPrices` so any garbage shape is normalised, but a
 * malformed payload still updates the rest of the settings cleanly
 * (defaults fill in for unknown rarities).
 *
 * DM/owner-only. Silent no-op for players (UI is gated upstream).
 */
export async function updateItemDefaultPrices(
  slug: string,
  rawPrices: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await getCurrentUserAndProfile()
  if (!result || !result.profile || result.profile.must_change_password) {
    return { ok: false, error: 'Не авторизован' }
  }

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { ok: false, error: 'Кампания не найдена' }

  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    return { ok: false, error: 'Нужна роль ДМ' }
  }

  const parsed: ItemDefaultPrices = parseItemDefaultPrices(rawPrices)

  const supabase = await createClient()
  const next = { ...campaign.settings, item_default_prices: parsed }

  const { error } = await supabase
    .from('campaigns')
    .update({ settings: next })
    .eq('id', campaign.id)

  if (error) return { ok: false, error: error.message }

  // Item form lives inside /c/[slug]/items — refresh both the
  // settings page (so saved values reflect immediately) and the
  // catalog tree (covers /items/new and /items/[id]/edit too).
  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true }
}

/**
 * Spec-016 — Bulk apply default prices к каталогу кампании.
 *
 * Загружает все items, считает `computeApplyPlan(items, defaults)`,
 * делает single-roundtrip UPDATE через `CASE WHEN ... THEN ... END`.
 * Items с `use_default_price = false` или `rarity ∈ {null, artifact}`
 * или `defaults[bucket][rarity] = null` пропускаются.
 *
 * Идемпотентен — повторный вызов с тем же state'ом → 0 updates,
 * `unchanged` count покрывает.
 *
 * DM/owner-only.
 */
export async function applyItemDefaultPrices(
  slug: string,
): Promise<
  | { ok: true; plan: ApplyPlan }
  | { ok: false; error: string }
> {
  const result = await getCurrentUserAndProfile()
  if (!result || !result.profile || result.profile.must_change_password) {
    return { ok: false, error: 'Не авторизован' }
  }

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { ok: false, error: 'Кампания не найдена' }

  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    return { ok: false, error: 'Нужна роль ДМ' }
  }

  const admin = createAdminClient()

  // Load all items для кампании. JOIN на nodes — campaign_id живёт
  // на nodes, не на item_attributes.
  const { data, error } = await admin
    .from('item_attributes')
    .select(
      'node_id, category_slug, rarity, price_gp, use_default_price, nodes!inner(campaign_id)',
    )
    .eq('nodes.campaign_id', campaign.id)

  if (error) {
    return { ok: false, error: `Не удалось загрузить каталог: ${error.message}` }
  }

  type Row = {
    node_id: string
    category_slug: string
    rarity: string | null
    price_gp: number | string | null
    use_default_price: boolean
  }

  const items: ApplyPlanItem[] = (data ?? []).map((raw) => {
    const r = raw as Row
    const price =
      r.price_gp === null
        ? null
        : typeof r.price_gp === 'string'
          ? parseFloat(r.price_gp)
          : r.price_gp
    return {
      itemId: r.node_id,
      categorySlug: r.category_slug,
      rarity: (r.rarity as Rarity | null) ?? null,
      priceGp: price,
      useDefaultPrice: r.use_default_price,
    }
  })

  const plan = computeApplyPlan(items, campaign.settings.item_default_prices)

  if (plan.updates.length === 0) {
    // Nothing to do — return ok с пустым plan для toast'а.
    return { ok: true, plan }
  }

  // Single SQL UPDATE через CASE WHEN. Postgres-side это один
  // round-trip, не loop.
  // Build CASE expression in JS:
  //   UPDATE item_attributes
  //      SET price_gp = CASE node_id
  //        WHEN '<id1>'::uuid THEN <price1>
  //        ...
  //      END
  //    WHERE node_id IN (...)
  //
  // PostgREST не даёт raw SQL через JS client без RPC. Используем
  // sequential per-row UPDATE как fallback — для каталога ~500 items
  // и nightly-ish operation это приемлемо. Если станет hot —
  // мигрируем в RPC.
  for (const upd of plan.updates) {
    const { error: updErr } = await admin
      .from('item_attributes')
      .update({ price_gp: upd.newPrice })
      .eq('node_id', upd.itemId)
    if (updErr) {
      return {
        ok: false,
        error: `Не удалось обновить ${upd.itemId.slice(0, 8)}…: ${updErr.message}`,
      }
    }
  }

  // Refresh catalog page + item permalinks (price chip).
  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true, plan }
}

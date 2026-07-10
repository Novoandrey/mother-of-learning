'use server'

import { revalidatePath } from 'next/cache'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCampaignBySlug,
  parseItemDefaultPrices,
  parseItemPurchasePolicy,
  type ItemDefaultPrices,
  type ItemPurchasePolicy,
} from '@/lib/campaign'
import { getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { parseCraftSettings, type CraftSettings } from '@/lib/craft-settings'
import { parseScribeSettings, type ScribeSettings } from '@/lib/scribe-settings'
import { parseSpellSettings, type SpellSettings } from '@/lib/spell-settings'
import { isHpMethod } from '@/lib/statblock'
import {
  computeApplyPlan,
  type ApplyPlan,
  type ApplyPlanItem,
} from '@/lib/apply-default-prices'
import type { Rarity } from '@/lib/items-types'

/**
 * Merge a settings patch into `campaigns.settings` by RE-READING the RAW jsonb
 * first — NOT `campaign.settings` (which is `parseCampaignSettings` output and
 * silently drops keys the model doesn't know, e.g. the spec-054
 * `ledger_master_message_id` pinned-dashboard id). Spreading the parsed object
 * `{ ...campaign.settings, X: parsed }` wipes that key on every save, orphaning
 * the pinned мастер-дашборд (self-review spec-059). RMW the raw jsonb instead.
 *
 * NB: the pre-existing sibling writers (updateCampaignHpMethod /
 * updateItemDefaultPrices / updateItemPurchasePolicy / updateCraftSettings)
 * still use the parsed-spread pattern and share this bug — flagged separately.
 */
async function mergeCampaignSettings(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
  patch: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  const rawSettings = (data as { settings?: unknown } | null)?.settings
  const raw =
    rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
      ? (rawSettings as Record<string, unknown>)
      : {}
  const { error } = await admin
    .from('campaigns')
    .update({ settings: { ...raw, ...patch } })
    .eq('id', campaignId)
  return { error }
}

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

  // Admin client — campaigns RLS only has SELECT policy; UPDATE через
  // anon-client would silently match 0 rows. Role gate выше — наш
  // первичный security layer.
  const admin = createAdminClient()

  const next = { ...campaign.settings, hp_method: rawMethod }

  await admin.from('campaigns').update({ settings: next }).eq('id', campaign.id)
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

  // Admin client — campaigns RLS только SELECT-policy. UPDATE через
  // anon-client silently матчит 0 строк, форма показывает
  // «Сохранено» а в БД ничего не пишется. Role gate выше — primary
  // security layer.
  const admin = createAdminClient()
  const next = { ...campaign.settings, item_default_prices: parsed }

  const { error } = await admin
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
 * Spec-052 (C-13/C-14). Persist the DM per-rarity purchase policy (coefficient
 * + approval-required) into campaigns.settings.item_purchase_policy. Mirrors
 * updateItemDefaultPrices; both spread campaign.settings so neither clobbers
 * the other (parseCampaignSettings round-trips both keys).
 */
export async function updateItemPurchasePolicy(
  slug: string,
  rawPolicy: unknown,
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

  const parsed: ItemPurchasePolicy = parseItemPurchasePolicy(rawPolicy)

  const admin = createAdminClient()
  const next = { ...campaign.settings, item_purchase_policy: parsed }

  const { error } = await admin
    .from('campaigns')
    .update({ settings: next })
    .eq('id', campaign.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true }
}

/**
 * Spec-056 (T9). Persist the DM craft settings (gp/hour rate table,
 * per-rarity costs + level gates, custom row, shop markup, weave) into
 * campaigns.settings.craft_settings. Mirrors updateItemPurchasePolicy;
 * spreads campaign.settings so sibling keys are never clobbered.
 */
export async function updateCraftSettings(
  slug: string,
  rawSettings: unknown,
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

  const parsed: CraftSettings = parseCraftSettings(rawSettings)

  const admin = createAdminClient()
  const next = { ...campaign.settings, craft_settings: parsed }

  const { error } = await admin
    .from('campaigns')
    .update({ settings: next })
    .eq('id', campaign.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true }
}

/**
 * Spec-059. Persist the DM scribe settings (уровень заклинания → норма
 * часов + фикс-цена, hoursPerDay/Week) into campaigns.settings.scribe_settings.
 * Clone of updateCraftSettings; spreads campaign.settings so sibling keys are
 * never clobbered.
 */
export async function updateScribeSettings(
  slug: string,
  rawSettings: unknown,
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

  const parsed: ScribeSettings = parseScribeSettings(rawSettings)

  const admin = createAdminClient()
  const { error } = await mergeCampaignSettings(admin, campaign.id, {
    scribe_settings: parsed,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true }
}

/**
 * Spec-059. Persist the DM spell settings (переподготовка + копирование
 * коэффициенты) into campaigns.settings.spell_settings. Clone of
 * updateCraftSettings; spreads campaign.settings so sibling keys are never
 * clobbered.
 */
export async function updateSpellSettings(
  slug: string,
  rawSettings: unknown,
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

  const parsed: SpellSettings = parseSpellSettings(rawSettings)

  const admin = createAdminClient()
  const { error } = await mergeCampaignSettings(admin, campaign.id, {
    spell_settings: parsed,
  })

  if (error) return { ok: false, error: error.message }

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

  // Load all item_attributes для кампании embed-запросом, с pagination.
  // Старая реализация шла в два шага (nodes → IN-query на attrs по
  // массиву node_id) — после spec-018 это ломалось дважды:
  //   1) nodes без range(0, 9999) обрезались на 1000 строк → часть
  //      items не попадала в IN-список;
  //   2) IN-clause из 1100+ UUIDов давал URL ~42KB → PostgREST
  //      возвращал 400 Bad Request.
  // !inner join на item_attributes сам по себе фильтрует на nodes
  // типа item (FK существует только для них). Pagination обходит
  // server-side db-max-rows клэмп (Supabase default ~1000).
  type Row = {
    node_id: string
    category_slug: string
    rarity: string | null
    price_gp: number | string | null
    use_default_price: boolean
  }
  type EmbedRow = { attrs: Row | Row[] | null }

  const PAGE_SIZE = 1000
  const MAX_PAGES = 10
  const allEmbed: EmbedRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await admin
      .from('nodes')
      .select(
        'attrs:item_attributes!inner(node_id, category_slug, rarity, price_gp, use_default_price)',
      )
      .eq('campaign_id', campaign.id)
      .range(from, to)
    if (error) {
      return { ok: false, error: `Не удалось загрузить каталог: ${error.message}` }
    }
    const rows = (data ?? []) as EmbedRow[]
    allEmbed.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  const items: ApplyPlanItem[] = []
  for (const raw of allEmbed) {
    // !inner gives a single row but supabase-js may serialise it as
    // either an object or a 1-element array depending on the version.
    const attrs = Array.isArray(raw.attrs) ? raw.attrs[0] : raw.attrs
    if (!attrs) continue
    const r = attrs
    const price =
      r.price_gp === null
        ? null
        : typeof r.price_gp === 'string'
          ? parseFloat(r.price_gp)
          : r.price_gp
    items.push({
      itemId: r.node_id,
      categorySlug: r.category_slug,
      rarity: (r.rarity as Rarity | null) ?? null,
      priceGp: price,
      useDefaultPrice: r.use_default_price,
    })
  }

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

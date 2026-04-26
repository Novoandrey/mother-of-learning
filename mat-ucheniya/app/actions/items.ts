'use server'

/**
 * Item server actions — spec-015.
 *
 *   • createItemAction      — DM/owner only
 *   • updateItemAction      — DM/owner only
 *   • deleteItemAction      — DM/owner only (FK SET NULL preserves linked transactions)
 *   • getLinkedTxCountAction — DM/owner only (drives FR-030 chip in <ItemEditDialog>)
 *
 * Writes go through the admin client after an explicit role check
 * (matches the project pattern from `categories.ts` / `transactions.ts`).
 *
 * Validation runs through `validateItemPayload` (lib/items-validation.ts)
 * — pure helper, vitest-tested. The actions fetch the campaign's
 * available slug sets and pass them to the validator as
 * defence-in-depth before the DB write.
 */

import { revalidatePath } from 'next/cache'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import {
  getLinkedTransactionCount,
  searchItemsForTypeahead,
} from '@/lib/items'
import { validateItemPayload } from '@/lib/items-validation'
import type { ItemNode, ItemPayload } from '@/lib/items-types'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ITEMS_SRD_SEED } from '@/lib/seeds/items-srd'
import {
  type ItemDefaultPrices,
  type RarityKey,
  DEFAULT_ITEM_PRICES,
} from '@/lib/item-default-prices'

// ─────────────────────────── Auto-flag helpers (mig 055) ───────────────────────────

/**
 * Seed slug → baseline price map. PHB / SRD prices for mundane items;
 * for magic items, this is the original D&D price (defaults table
 * lookup happens separately via campaign settings).
 *
 * Built once at module init from `ITEMS_SRD_SEED`. Custom items
 * without srd_slug have no entry here → no baseline → flag stays at
 * default (true), since we have no opinion to express.
 */
const SEED_BASELINE_BY_SLUG: ReadonlyMap<string, number> = new Map(
  ITEMS_SRD_SEED.filter(
    (e): e is typeof e & { priceGp: number } => e.priceGp !== null,
  ).map((e) => [e.srdSlug, e.priceGp]),
)

const RARITY_KEYS_IN_DEFAULTS: ReadonlySet<string> = new Set<RarityKey>([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
])

/**
 * Mirror of mig 055 phase 3a/3b backfill logic, used at item
 * create/update to keep `use_default_price` auto-managed:
 *
 *   • Magic + consumable items (rarity in common..legendary):
 *     baseline = `defaults[bucket][rarity]` (bucket =
 *     'consumable' if categorySlug === 'consumable' else 'magic').
 *     If price matches baseline → flag=true; differs → false.
 *
 *   • Mundane items (rarity=null, non-consumable, with srd_slug):
 *     baseline = SRD seed price for that slug. Same compare rule.
 *
 *   • No baseline (custom items, artifacts, missing default cell):
 *     flag stays true. We have no canonical to compare against.
 *
 *   • Null price: flag stays true (no opinion).
 */
function computeUseDefaultPrice(
  payload: ItemPayload,
  defaults: ItemDefaultPrices,
): boolean {
  if (payload.priceGp === null) return true

  // Magic / consumable bucket — defaults table is canonical.
  if (payload.rarity !== null && RARITY_KEYS_IN_DEFAULTS.has(payload.rarity)) {
    const bucket: keyof ItemDefaultPrices =
      payload.categorySlug === 'consumable' ? 'consumable' : 'magic'
    const cell = defaults[bucket][payload.rarity as RarityKey]
    if (cell === null) return true
    return payload.priceGp === cell
  }

  // Mundane bucket — SRD seed price is canonical.
  if (
    payload.rarity === null &&
    payload.categorySlug !== 'consumable' &&
    payload.srdSlug
  ) {
    const baseline = SEED_BASELINE_BY_SLUG.get(payload.srdSlug)
    if (baseline === undefined) return true
    return payload.priceGp === baseline
  }

  return true
}

async function loadDefaultPrices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  campaignId: string,
): Promise<ItemDefaultPrices> {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .single()
  const settings = (data as { settings?: { item_default_prices?: unknown } } | null)
    ?.settings
  const raw = settings?.item_default_prices
  if (!raw || typeof raw !== 'object') return DEFAULT_ITEM_PRICES
  // Trust the JSONB shape; parser lives in lib/campaign.ts but
  // pulling it here would re-introduce the next/headers transitive
  // import. Server action is fine — accept light shape.
  return raw as ItemDefaultPrices
}

export type ItemActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

async function requireDm(
  campaignId: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    return { ok: false, error: 'Только ДМ или владелец может управлять каталогом предметов' }
  }
  return { ok: true, userId: user.id }
}

/**
 * Load the four slug sets needed by the validator. One round-trip via
 * `Promise.all`. Soft-deleted categories stay out of the writeable
 * sets (DM can't pick them in the form).
 */
async function loadAvailableSlugs(campaignId: string) {
  const [cats, slots, sources, avails] = await Promise.all([
    listCategories(campaignId, 'item'),
    listCategories(campaignId, 'item-slot'),
    listCategories(campaignId, 'item-source'),
    listCategories(campaignId, 'item-availability'),
  ])
  return {
    categories: new Set(cats.map((c) => c.slug)),
    slots: new Set(slots.map((c) => c.slug)),
    sources: new Set(sources.map((c) => c.slug)),
    availabilities: new Set(avails.map((c) => c.slug)),
  }
}

/**
 * Resolve the campaign's `node_types(slug='item')` row id. Created
 * by migration 043 + by `seedCampaignItemValueLists` for new
 * campaigns. Throws if missing — that means the migration didn't
 * run for this campaign and we cannot proceed.
 */
async function getItemTypeId(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'item')
    .maybeSingle()
  if (error) {
    throw new Error(`Не удалось загрузить node_types: ${error.message}`)
  }
  if (!data) {
    throw new Error(
      'В этой кампании нет node_type=item — миграция 043 не применилась?',
    )
  }
  return (data as { id: string }).id
}

// ─────────────────────────── createItemAction ───────────────────────────

export async function createItemAction(
  campaignId: string,
  payload: ItemPayload,
): Promise<ItemActionResult<{ itemId: string }>> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const slugs = await loadAvailableSlugs(campaignId)
  const errors = validateItemPayload(payload, slugs)
  if (errors.length > 0) {
    return { ok: false, error: errors[0].message }
  }

  const admin = createAdminClient()
  const typeId = await getItemTypeId(admin, campaignId)
  const defaults = await loadDefaultPrices(admin, campaignId)
  const useDefaultPrice = computeUseDefaultPrice(payload, defaults)

  // Cold fields → nodes.fields JSONB. We strip empty strings to NULL
  // so JSONB stays clean and queries (`fields->>srd_slug`) don't have
  // to coalesce empties.
  const fields: Record<string, string> = {}
  if (payload.srdSlug && payload.srdSlug.trim()) fields.srd_slug = payload.srdSlug.trim()
  if (payload.description && payload.description.trim()) fields.description = payload.description
  if (payload.sourceDetail && payload.sourceDetail.trim()) {
    fields.source_detail = payload.sourceDetail.trim()
  }

  // Step 1 — insert nodes row. We need its generated id for the
  // FK on item_attributes, so this is sequential, not parallel.
  const { data: nodeRow, error: nodeErr } = await admin
    .from('nodes')
    .insert({
      campaign_id: campaignId,
      type_id: typeId,
      title: payload.title.trim(),
      fields,
    })
    .select('id')
    .single()

  if (nodeErr || !nodeRow) {
    return {
      ok: false,
      error: `Не удалось создать предмет: ${nodeErr?.message ?? 'unknown'}`,
    }
  }

  const nodeId = (nodeRow as { id: string }).id

  // Step 2 — insert item_attributes. On failure we delete the node
  // we just created (otherwise we'd have an orphan node with no
  // attributes, which `getCatalogItems` filters out but `<NodePage>`
  // would still render).
  const { error: attrsErr } = await admin.from('item_attributes').insert({
    node_id: nodeId,
    category_slug: payload.categorySlug,
    rarity: payload.rarity,
    price_gp: payload.priceGp,
    weight_lb: payload.weightLb,
    slot_slug: payload.slotSlug,
    source_slug: payload.sourceSlug,
    availability_slug: payload.availabilitySlug,
    use_default_price: useDefaultPrice,
    requires_attunement: payload.requiresAttunement,
  })

  if (attrsErr) {
    await admin.from('nodes').delete().eq('id', nodeId)
    return { ok: false, error: `Не удалось сохранить атрибуты: ${attrsErr.message}` }
  }

  invalidateSidebar(campaignId)
  revalidatePath(`/c/${campaignId}/items`)
  return { ok: true, itemId: nodeId }
}

// ─────────────────────────── updateItemAction ───────────────────────────

export async function updateItemAction(
  campaignId: string,
  itemId: string,
  payload: ItemPayload,
): Promise<ItemActionResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!itemId) return { ok: false, error: 'Не указан предмет' }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const slugs = await loadAvailableSlugs(campaignId)
  const errors = validateItemPayload(payload, slugs)
  if (errors.length > 0) {
    return { ok: false, error: errors[0].message }
  }

  const admin = createAdminClient()
  const defaults = await loadDefaultPrices(admin, campaignId)
  const useDefaultPrice = computeUseDefaultPrice(payload, defaults)

  // Same fields shape as createItemAction.
  const fields: Record<string, string> = {}
  if (payload.srdSlug && payload.srdSlug.trim()) fields.srd_slug = payload.srdSlug.trim()
  if (payload.description && payload.description.trim()) fields.description = payload.description
  if (payload.sourceDetail && payload.sourceDetail.trim()) {
    fields.source_detail = payload.sourceDetail.trim()
  }

  const { error: nodeErr } = await admin
    .from('nodes')
    .update({ title: payload.title.trim(), fields })
    .eq('id', itemId)
    .eq('campaign_id', campaignId)

  if (nodeErr) {
    return { ok: false, error: `Не удалось обновить предмет: ${nodeErr.message}` }
  }

  const { error: attrsErr } = await admin
    .from('item_attributes')
    .update({
      category_slug: payload.categorySlug,
      rarity: payload.rarity,
      price_gp: payload.priceGp,
      weight_lb: payload.weightLb,
      slot_slug: payload.slotSlug,
      source_slug: payload.sourceSlug,
      availability_slug: payload.availabilitySlug,
      use_default_price: useDefaultPrice,
      requires_attunement: payload.requiresAttunement,
    })
    .eq('node_id', itemId)

  if (attrsErr) {
    return { ok: false, error: `Не удалось обновить атрибуты: ${attrsErr.message}` }
  }

  invalidateSidebar(campaignId)
  revalidatePath(`/c/${campaignId}/items`)
  revalidatePath(`/c/${campaignId}/items/${itemId}`)
  return { ok: true }
}

// ─────────────────────────── deleteItemAction ───────────────────────────

/**
 * Hard delete of the Образец. FKs cascade:
 *  - `item_attributes.node_id ON DELETE CASCADE` (mig 043) drops the attrs row.
 *  - `transactions.item_node_id ON DELETE SET NULL` (mig 043) preserves
 *     linked transactions but severs the link. The `item_name` snapshot
 *     keeps the row displayable per FR-014 / FR-032.
 */
export async function deleteItemAction(
  campaignId: string,
  itemId: string,
): Promise<ItemActionResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!itemId) return { ok: false, error: 'Не указан предмет' }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('nodes')
    .delete()
    .eq('id', itemId)
    .eq('campaign_id', campaignId)

  if (error) {
    return { ok: false, error: `Не удалось удалить предмет: ${error.message}` }
  }

  invalidateSidebar(campaignId)
  revalidatePath(`/c/${campaignId}/items`)
  return { ok: true }
}

// ─────────────────────────── searchItemsAction ───────────────────────────

/**
 * Typeahead search wrapper. Any campaign member can call (typeahead
 * surfaces in player-facing forms too).
 */
export async function searchItemsAction(
  campaignId: string,
  query: string,
  limit = 10,
): Promise<ItemActionResult<{ items: ItemNode[] }>> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  try {
    const items = await searchItemsForTypeahead(campaignId, query, limit)
    return { ok: true, items }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return { ok: false, error: message }
  }
}

/**
 * Pure read; safe for any campaign member. Used by `<ItemEditDialog>`
 * to render the "N транзакций ссылается" chip (FR-030).
 */
export async function getLinkedTxCountAction(
  campaignId: string,
  itemId: string,
): Promise<ItemActionResult<{ count: number }>> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!itemId) return { ok: false, error: 'Не указан предмет' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  try {
    const count = await getLinkedTransactionCount(itemId)
    return { ok: true, count }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return { ok: false, error: message }
  }
}

/**
 * Partial in-row update — для inline edit в каталоге. Меняет только
 * переданные поля. Никакой валидации slug-references на стороне
 * action'а: title — text up to 200, priceGp — non-negative number
 * or null, sourceSlug — string или null (доверяем dropdown'у в UI;
 * на стороне БД нет FK на categories, что matches existing pattern).
 *
 * NOTE: не пробрасывает payload через `updateItemAction` целиком,
 * чтобы не загружать full item shape в каталог. Ровно три поля
 * редактируются: title / priceGp / sourceSlug.
 *
 * Возвращает { ok: true } или { ok: false, error: string }.
 */
export async function quickUpdateItemAction(
  campaignId: string,
  itemId: string,
  patch: {
    title?: string
    priceGp?: number | null
    sourceSlug?: string | null
  },
): Promise<ItemActionResult> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!itemId) return { ok: false, error: 'Не указан предмет' }

  const auth = await requireDm(campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()

  // node-side update (title только).
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim()
    if (trimmed.length === 0) {
      return { ok: false, error: 'Название не может быть пустым' }
    }
    if (trimmed.length > 200) {
      return { ok: false, error: 'Название слишком длинное' }
    }
    const { error } = await admin
      .from('nodes')
      .update({ title: trimmed })
      .eq('id', itemId)
      .eq('campaign_id', campaignId)
    if (error) {
      return { ok: false, error: `Не удалось обновить название: ${error.message}` }
    }
  }

  // attrs-side update (priceGp / sourceSlug).
  const attrsPatch: Record<string, unknown> = {}
  if (patch.priceGp !== undefined) {
    if (patch.priceGp !== null) {
      if (!Number.isFinite(patch.priceGp)) {
        return { ok: false, error: 'Цена должна быть числом' }
      }
      if (patch.priceGp < 0) {
        return { ok: false, error: 'Цена не может быть отрицательной' }
      }
    }
    attrsPatch.price_gp = patch.priceGp
  }
  if (patch.sourceSlug !== undefined) {
    attrsPatch.source_slug = patch.sourceSlug ?? null
  }

  if (Object.keys(attrsPatch).length > 0) {
    const { error } = await admin
      .from('item_attributes')
      .update(attrsPatch)
      .eq('node_id', itemId)
    if (error) {
      return { ok: false, error: `Не удалось обновить: ${error.message}` }
    }
  }

  invalidateSidebar(campaignId)
  revalidatePath(`/c/${campaignId}/items`)
  revalidatePath(`/c/${campaignId}/items/${itemId}`)
  return { ok: true }
}

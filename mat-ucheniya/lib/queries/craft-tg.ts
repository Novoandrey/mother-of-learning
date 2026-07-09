import type { SupabaseClient } from '@supabase/supabase-js'

import { parseCraftSettings, type CraftSettings } from '../craft-settings'
import { parsePartyLevel } from '../party-level'
import { getStashItemHoldingsTg } from './ledger-tg'

/**
 * Read-side queries for the Telegram Mini App craft screen (spec-056 — Крафт).
 *
 * These run client-side through the Telegram-minted session, so every read is
 * RLS-scoped (`craft_runs` grants campaign members member-wide SELECT — see
 * 127_craft.sql; schemas are ordinary catalog nodes). Like expeditions-tg.ts,
 * there is NO bookkeeping math here — a run's financial effect is real
 * `transactions` rows on the общак. Column mapping (snake_case → camelCase)
 * plus defensive jsonb parsing only.
 *
 * The craft PRICE is deliberately NOT computed here: the UI derives it from
 * `craft_settings` (parseCraftSettings + craftRowFor by the TARGET's rarity,
 * or the schema's `craftCostOverrideGp` — plan-056 «Резолв цены крафта»),
 * which is why each schema carries the resolved target's rarity and the
 * override verbatim.
 */

export type CraftSchemaTg = {
  id: string
  name: string
  /** Цена ПОКУПКИ схемы (каталожная price_gp); null = не задана. */
  priceGp: number | null
  /** Редкость самой схемы (обычно цель + 1 ступень); null у кастомных. */
  rarity: string | null
  /** Линк на целевой предмет (item_attributes.schema_for_node_id). */
  schemaForNodeId: string | null
  /** Override крафт-цены (nodes.fields.craft_cost_gp) для кастомных схем. */
  craftCostOverrideGp: number | null
  /** Резолв целевого предмета; null, если линка нет или цель удалена. */
  target: {
    id: string
    name: string
    rarity: string | null
    requiresAttunement: boolean
  } | null
}

export type CraftRunTg = {
  id: string
  schemaItemNodeId: string | null
  loopNumber: number
  dayInLoop: number
  startMinute: number | null
  participants: { nodeId: string; hours: number }[]
  investedGp: number
  outputItemNodeId: string | null
  outputItemName: string
  recipientNodeId: string | null
  createdBy: string | null
  createdAt: string
}

/** Defensive jsonb parse of craft_runs.participants ([{nodeId, hours}]). */
function parseParticipants(raw: unknown): { nodeId: string; hours: number }[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      nodeId: typeof x.nodeId === 'string' ? x.nodeId : '',
      hours:
        typeof x.hours === 'number' && Number.isFinite(x.hours) && x.hours > 0
          ? x.hours
          : 0,
    }))
    .filter((x) => x.nodeId)
}

/** nodes.fields.craft_cost_gp → number | null (наличие ≠ валидность). */
function parseCraftCostOverride(fields: Record<string, unknown> | null): number | null {
  const v = fields?.craft_cost_gp
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * «Известные схемы» кампании — catalog items of category 'schema', with the
 * target item resolved (name/rarity/attunement) in a second batched query.
 * Sorted by name (ru-locale), like the expedition menu. `!inner` on both
 * embeds so the category + type filters constrain the OUTER rows (the
 * PostgREST embed-only-filter trap — same guard as getStashResourceHoldingsTg).
 */
export async function listSchemas(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CraftSchemaTg[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select(
      'id, title, fields, item_attributes!inner(price_gp, rarity, schema_for_node_id, category_slug), node_types!inner(slug)',
    )
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .eq('item_attributes.category_slug', 'schema')
  // Падаем громко: молчаливый [] на ошибке запроса маскирует сбой под «нет
  // схем» (ровно этот класс бага искали в spec-058). Вызывающий (CraftScreen)
  // ловит throw и показывает «Не удалось загрузить крафт.» вместо пустого меню.
  if (error) throw error

  type AttrsSlice = {
    price_gp: number | null
    rarity: string | null
    schema_for_node_id: string | null
    category_slug: string
  }
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
    item_attributes: AttrsSlice | AttrsSlice[] | null
  }>

  const schemas = rows.flatMap((r) => {
    const attrs = Array.isArray(r.item_attributes)
      ? r.item_attributes[0]
      : r.item_attributes
    if (!attrs) return []
    return [
      {
        id: r.id,
        name: r.title,
        priceGp: attrs.price_gp,
        rarity: attrs.rarity,
        schemaForNodeId: attrs.schema_for_node_id,
        craftCostOverrideGp: parseCraftCostOverride(r.fields),
        target: null as CraftSchemaTg['target'],
      },
    ]
  })

  // Resolve targets in one batch: title + rarity + attunement.
  const targetIds = [
    ...new Set(schemas.map((s) => s.schemaForNodeId).filter((v): v is string => !!v)),
  ]
  if (targetIds.length > 0) {
    const { data: targetRows } = await supabase
      .from('nodes')
      .select('id, title, item_attributes(rarity, requires_attunement)')
      .eq('campaign_id', campaignId)
      .in('id', targetIds)
    type TargetAttrs = { rarity: string | null; requires_attunement: boolean | null }
    const byId = new Map<string, CraftSchemaTg['target']>()
    for (const t of (targetRows ?? []) as Array<{
      id: string
      title: string
      item_attributes: TargetAttrs | TargetAttrs[] | null
    }>) {
      const attrs = Array.isArray(t.item_attributes)
        ? t.item_attributes[0]
        : t.item_attributes
      byId.set(t.id, {
        id: t.id,
        name: t.title,
        rarity: attrs?.rarity ?? null,
        requiresAttunement: attrs?.requires_attunement === true,
      })
    }
    for (const s of schemas) {
      if (s.schemaForNodeId) s.target = byId.get(s.schemaForNodeId) ?? null
    }
  }

  return schemas.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/**
 * The campaign's craft runs (history), newest first by `created_at`. The
 * default page of 25 mirrors the expedition history; «дата» = (loop, day).
 */
export async function listCraftRuns(
  supabase: SupabaseClient,
  campaignId: string,
  limit = 25,
): Promise<CraftRunTg[]> {
  const { data } = await supabase
    .from('craft_runs')
    .select(
      'id, schema_item_node_id, loop_number, day_in_loop, start_minute, participants, invested_gp, output_item_node_id, output_item_name, recipient_node_id, created_by, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as Array<{
    id: string
    schema_item_node_id: string | null
    loop_number: number
    day_in_loop: number
    start_minute: number | null
    participants: unknown
    invested_gp: number
    output_item_node_id: string | null
    output_item_name: string | null
    recipient_node_id: string | null
    created_by: string | null
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    schemaItemNodeId: r.schema_item_node_id,
    loopNumber: r.loop_number,
    dayInLoop: r.day_in_loop,
    startMinute: r.start_minute,
    participants: parseParticipants(r.participants),
    investedGp: Number(r.invested_gp ?? 0),
    outputItemNodeId: r.output_item_node_id,
    outputItemName: r.output_item_name ?? '',
    recipientNodeId: r.recipient_node_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

/**
 * The campaign's craft settings, parsed with defaults — the same channel the
 * buy screens use for prices (`getCampaignBuyConfigTg` → campaigns.settings):
 * a member-scoped client read, no server prop involved. The UI mirrors the
 * server's own `loadCraftSettings` (app/actions/craft.ts) so what it previews
 * is what `runCraft` will charge.
 */
export async function getCraftSettingsTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CraftSettings> {
  const { data } = await supabase
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .single()
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return parseCraftSettings(settings.craft_settings)
}

/**
 * `party_level` of the CURRENT loop (`fields.status = 'current'`, образец
 * getCurrentLoopNumber) — null when no loop is current or the level is not
 * set. Null gates the whole craft screen: `runCraft` re-checks the same
 * value server-side (`loadCurrentPartyLevel`), so the UI refusing early is
 * a courtesy, not the safety net.
 */
export async function getCurrentPartyLevelTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('nodes')
    .select('fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'loop')
  const loops = (data ?? []) as Array<{ fields: Record<string, unknown> | null }>
  const current = loops.find((l) => (l.fields ?? {})['status'] === 'current')
  return current ? parsePartyLevel((current.fields ?? {})['party_level']) : null
}

/**
 * Items in the общак available for разбор (spec-056 §3): net qty > 0 this
 * loop AND resolvable to a catalog item node — `disassembleItem` needs the
 * node id, while stash holdings are keyed by NAME (getStashItemHoldingsTg),
 * so free-text-only items can't be disassembled and are dropped here.
 * Schemas themselves are excluded (разбор схемы бессмысленен — рекурсию
 * «схема схемы» закрывает createSchemaItem с редкостью +1). Same join shape
 * as getStashResourceHoldingsTg, first title match wins.
 */
export type StashCraftableItemTg = {
  itemNodeId: string
  name: string
  qty: number
  rarity: string | null
}

export async function listDisassemblableStashItemsTg(
  supabase: SupabaseClient,
  campaignId: string,
  loopNumber: number,
): Promise<StashCraftableItemTg[]> {
  const holdings = await getStashItemHoldingsTg(supabase, campaignId, loopNumber)
  if (holdings.length === 0) return []
  const names = holdings.map((h) => h.name)

  // !inner on both embeds so the category + type filters constrain the OUTER
  // rows (the PostgREST embed-only-filter trap — same guard as listSchemas).
  const { data } = await supabase
    .from('nodes')
    .select('id, title, item_attributes!inner(rarity, category_slug), node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .neq('item_attributes.category_slug', 'schema')
    .in('title', names)
  const byName = new Map<string, { itemNodeId: string; rarity: string | null }>()
  for (const r of (data ?? []) as Array<{
    id: string
    title: string
    item_attributes:
      | { rarity: string | null; category_slug: string }
      | { rarity: string | null; category_slug: string }[]
      | null
  }>) {
    const attrs = Array.isArray(r.item_attributes) ? r.item_attributes[0] : r.item_attributes
    if (!attrs) continue
    if (!byName.has(r.title)) byName.set(r.title, { itemNodeId: r.id, rarity: attrs.rarity })
  }

  // Preserve the holdings' ru-locale name sort; drop unresolvable names.
  return holdings.flatMap((h) => {
    const meta = byName.get(h.name)
    return meta
      ? [{ itemNodeId: meta.itemNodeId, name: h.name, qty: h.qty, rarity: meta.rarity }]
      : []
  })
}

/**
 * Read-side queries для /tg-глаголов заклинаний (spec-059): написание свитков,
 * переподготовка, копирование. Клиентские RLS-запросы (Telegram-minted session),
 * зеркало lib/queries/craft-tg.ts. Все — `{ data, error }` + `if (error) throw`
 * (молчаливый [] маскирует сбой под «нет данных» — грабля spec-058).
 *
 * Числа превью читаются из campaigns.settings через те же parse-хелперы, что
 * заряжают серверные экшены runScribe/runReprep/runCopySpell — превью = списание.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { parseScribeSettings, type ScribeSettings } from '../scribe-settings'
import { parseSpellSettings, type SpellSettings } from '../spell-settings'
import { parseSpellLevel } from '../spell'
import { getPcItemHoldingsTg } from './ledger-tg'

// ── Settings previews ────────────────────────────────────────────────────────

export async function getScribeSettingsTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<ScribeSettings> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  if (error) throw error
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return parseScribeSettings(settings.scribe_settings)
}

export async function getSpellSettingsTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<SpellSettings> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  if (error) throw error
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return parseSpellSettings(settings.spell_settings)
}

// ── Spell picker (level-filtered search) ─────────────────────────────────────

export type SpellPickTg = { id: string; title: string; level: number }

/**
 * Поиск заклинаний по названию (ilike), с фильтром уровня ≤ maxLevel (уровень —
 * в fields.level, фильтруем на клиенте: jsonb-число может быть int или строкой).
 * Только официальные ноды заклинаний (node_type='spell').
 */
export async function searchSpellsTg(
  supabase: SupabaseClient,
  campaignId: string,
  query: string,
  maxLevel = 9,
): Promise<SpellPickTg[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'spell')
    .ilike('title', `%${q}%`)
    .order('title')
    .limit(50)
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
  }>
  const out: SpellPickTg[] = []
  for (const r of rows) {
    const level = parseSpellLevel((r.fields ?? {}).level)
    if (level == null || level > maxLevel) continue
    out.push({ id: r.id, title: r.title, level })
  }
  return out
}

// ── PC scroll holdings (для копирования свиток→книга) ────────────────────────

export type PcScrollHoldingTg = {
  itemNodeId: string
  name: string
  qty: number
  level: number
}

/**
 * Свитки, которые сейчас держит PC (net qty > 0). Резолвим, какие из холдингов —
 * предметы категории 'scroll' + их node id + уровень. Зеркало
 * getStashResourceHoldingsTg. `!inner` на обоих эмбедах, чтобы фильтры
 * категории/типа сужали ВНЕШНЮЮ строку.
 */
export async function getPcScrollHoldingsTg(
  supabase: SupabaseClient,
  campaignId: string,
  pcId: string,
  loopNumber: number | null,
): Promise<PcScrollHoldingTg[]> {
  const holdings = await getPcItemHoldingsTg(supabase, pcId, loopNumber)
  if (holdings.length === 0) return []
  const names = holdings.map((h) => h.name)

  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, fields, item_attributes!inner(category_slug), node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .eq('item_attributes.category_slug', 'scroll')
    .in('title', names)
  if (error) throw error
  const byName = new Map<string, { itemNodeId: string; level: number }>()
  for (const r of (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
  }>) {
    const level = parseSpellLevel((r.fields ?? {}).level) ?? 0
    byName.set(r.title, { itemNodeId: r.id, level })
  }
  const out: PcScrollHoldingTg[] = []
  for (const h of holdings) {
    const meta = byName.get(h.name)
    if (meta && h.qty > 0) {
      out.push({ itemNodeId: meta.itemNodeId, name: h.name, qty: h.qty, level: meta.level })
    }
  }
  return out
}

// ── Scribe history ───────────────────────────────────────────────────────────

export type ScribeRunTg = {
  id: string
  spellNodeId: string | null
  level: number | null
  loopNumber: number
  dayInLoop: number
  startMinute: number | null
  participants: { nodeId: string; hours: number }[]
  investedGp: number
  outputScrollNodeId: string | null
  outputScrollName: string
  recipientNodeId: string | null
  createdBy: string | null
  createdAt: string
}

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

export async function listScribeRuns(
  supabase: SupabaseClient,
  campaignId: string,
  limit = 25,
): Promise<ScribeRunTg[]> {
  const { data, error } = await supabase
    .from('scribe_runs')
    .select(
      'id, spell_node_id, level, loop_number, day_in_loop, start_minute, participants, invested_gp, output_scroll_node_id, output_scroll_name, recipient_node_id, created_by, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    spell_node_id: string | null
    level: number | null
    loop_number: number
    day_in_loop: number
    start_minute: number | null
    participants: unknown
    invested_gp: number
    output_scroll_node_id: string | null
    output_scroll_name: string | null
    recipient_node_id: string | null
    created_by: string | null
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    spellNodeId: r.spell_node_id,
    level: r.level,
    loopNumber: r.loop_number,
    dayInLoop: r.day_in_loop,
    startMinute: r.start_minute,
    participants: parseParticipants(r.participants),
    investedGp: Number(r.invested_gp ?? 0),
    outputScrollNodeId: r.output_scroll_node_id,
    outputScrollName: r.output_scroll_name ?? '',
    recipientNodeId: r.recipient_node_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Read-side queries for the Telegram Mini App expeditions (spec-055 — Вылазки).
 *
 * These run client-side through the Telegram-minted session, so every read is
 * RLS-scoped (the migration grants campaign members member-wide SELECT on both
 * `expeditions` and `expedition_runs` — see 124_expeditions.sql). They carry the
 * menu + narrative/history only; a run's financial effect is real `transactions`
 * rows on the общак, so there is no bookkeeping math here — just column mapping
 * (snake_case → camelCase) and defensive jsonb parsing.
 */

export type ExpeditionTg = {
  id: string
  title: string
  description: string
  defaultConsumables: { itemNodeId: string | null; name: string; qty: number }[]
  defaultDurationTicks: number | null
  /** Template defaults the run form pre-fills (spec-055 R2 — all editable per run). */
  rewardMoneyGp: number
  rewardItems: { name: string; qty: number; itemNodeId?: string | null }[]
  defaultParticipantNodeIds: string[]
  defaultStartMinute: number | null
  defaultDurationMinute: number | null
  createdBy: string | null
  createdAt: string
}

export type ExpeditionRunTg = {
  id: string
  expeditionId: string | null
  loopNumber: number
  dayInLoop: number
  participantNodeIds: string[]
  rewardMoneyGp: number
  rewardItems: { name: string; qty: number; itemNodeId?: string | null }[]
  consumablesCostGp: number
  consumablesItems: { name: string; qty: number }[]
  createdBy: string | null
  createdAt: string
}

/**
 * Parse a jsonb array of item-like objects defensively (mirrors how
 * getCampaignSetsTg parses `fields.items` in ledger-tg.ts): filter out
 * non-objects, coerce fields to their types with sane defaults. `withItemNode`
 * carries the optional `itemNodeId` link (nullable) for consumables/rewards.
 */
function parseItems(
  raw: unknown,
  withItemNode: boolean,
): { itemNodeId: string | null; name: string; qty: number }[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      itemNodeId: withItemNode && typeof x.itemNodeId === 'string' ? x.itemNodeId : null,
      name: typeof x.name === 'string' ? x.name : '',
      qty: typeof x.qty === 'number' ? x.qty : 1,
    }))
    .filter((x) => x.name)
}

/**
 * All available expeditions of the campaign — the menu templates (E4). Sorted
 * by title (ru-locale) so the picker reads alphabetically, like the sets screen.
 */
export async function listExpeditions(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<ExpeditionTg[]> {
  const { data } = await supabase
    .from('expeditions')
    .select(
      'id, title, description, default_consumables, default_duration_ticks, reward_money_gp, reward_items, default_participant_node_ids, default_start_minute, default_duration_minute, created_by, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('title', { ascending: true })
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    description: string | null
    default_consumables: unknown
    default_duration_ticks: number | null
    reward_money_gp: number
    reward_items: unknown
    default_participant_node_ids: string[] | null
    default_start_minute: number | null
    default_duration_minute: number | null
    created_by: string | null
    created_at: string
  }>
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      defaultConsumables: parseItems(r.default_consumables, true),
      defaultDurationTicks: r.default_duration_ticks,
      rewardMoneyGp: Number(r.reward_money_gp ?? 0),
      rewardItems: parseItems(r.reward_items, true).map((x) => ({
        name: x.name,
        qty: x.qty,
        itemNodeId: x.itemNodeId,
      })),
      defaultParticipantNodeIds: Array.isArray(r.default_participant_node_ids)
        ? r.default_participant_node_ids
        : [],
      defaultStartMinute: r.default_start_minute,
      defaultDurationMinute: r.default_duration_minute,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

/**
 * The campaign's expedition runs (history), newest first by `created_at`. The
 * default page of 25 mirrors the ledger feed; the «дата» is (loop, day).
 */
export async function listExpeditionRuns(
  supabase: SupabaseClient,
  campaignId: string,
  limit = 25,
): Promise<ExpeditionRunTg[]> {
  const { data } = await supabase
    .from('expedition_runs')
    .select(
      'id, expedition_id, loop_number, day_in_loop, participant_node_ids, reward_money_gp, reward_items, consumables_cost_gp, consumables_items, created_by, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as Array<{
    id: string
    expedition_id: string | null
    loop_number: number
    day_in_loop: number
    participant_node_ids: string[] | null
    reward_money_gp: number
    reward_items: unknown
    consumables_cost_gp: number
    consumables_items: unknown
    created_by: string | null
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    expeditionId: r.expedition_id,
    loopNumber: r.loop_number,
    dayInLoop: r.day_in_loop,
    participantNodeIds: Array.isArray(r.participant_node_ids)
      ? r.participant_node_ids
      : [],
    rewardMoneyGp: Number(r.reward_money_gp ?? 0),
    rewardItems: parseItems(r.reward_items, true).map((x) => ({
      name: x.name,
      qty: x.qty,
      itemNodeId: x.itemNodeId,
    })),
    consumablesCostGp: Number(r.consumables_cost_gp ?? 0),
    consumablesItems: parseItems(r.consumables_items, false).map((x) => ({
      name: x.name,
      qty: x.qty,
    })),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

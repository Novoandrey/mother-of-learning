/**
 * Ledger master message (spec-054) — impure compose + storage + orchestration.
 * The pinned money dashboard for the "Денежки, лут" topic.
 *
 * Runs off the write's critical path (called from `notifyLedgerEvent`'s
 * `after()` in ledger-feed.ts) with the admin client. Every function here is
 * defensive; `refreshMasterMessage` NEVER throws so a refresh failure can't
 * break the per-event send or the ledger write that triggered it.
 *
 * Split of concerns:
 *  - wording + layout + 4096 clamp → `ledger-master-format.ts` (PURE, tested);
 *  - the numbers → spec-044's `getAllBalancesTg` (no new bookkeeping math);
 *  - the message id → `campaigns.settings.ledger_master_message_id` (JSONB, no
 *    migration), read-modify-written so sibling settings keys survive.
 *
 * Loop rotation (D3): the `loop-started` event mints a NEW message for the new
 * loop and stores its id, leaving the previous one frozen as history — the
 * admin pins the new one by hand (the bot never pins).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateGp } from '@/lib/transaction-resolver'
import type { CoinSet } from '@/lib/transactions'
import { getAllBalancesTg, getStashItemHoldingsTg } from '@/lib/queries/ledger-tg'
import { sendLedgerMessage, editLedgerMessage } from '@/lib/telegram/bot'
import {
  renderMasterMessageHtml,
  type MasterRecentRow,
  type MasterState,
} from '@/lib/telegram/ledger-master-format'

const RECENT_LIMIT = 40
const SETTINGS_KEY = 'ledger_master_message_id'

// ── compose (reads) ─────────────────────────────────────────────────────────

/** Current loop number + title (the loop node with `fields.status='current'`). */
async function getCurrentLoopInfo(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{ number: number; title: string | null }> {
  const { data } = await admin
    .from('nodes')
    .select('title, fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'loop')
  const loops = (data ?? []) as Array<{
    title: string | null
    fields: Record<string, unknown> | null
  }>
  const current = loops.find((l) => (l.fields ?? {})['status'] === 'current')
  const n = current ? Number((current.fields ?? {})['number'] ?? 0) : 0
  return { number: n > 0 ? n : 1, title: current?.title ?? null }
}

/** Every campaign PC (character node), id + title, title-sorted. */
async function getCampaignPcs(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{ id: string; title: string }[]> {
  const { data } = await admin
    .from('nodes')
    .select('id, title, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'character')
    .order('title')
  return ((data ?? []) as Array<{ id: string; title: string | null }>).map((r) => ({
    id: r.id,
    title: r.title ?? '—',
  }))
}

/** Recent approved campaign transactions for the loop, newest first. */
async function getCampaignRecentTx(
  admin: SupabaseClient,
  campaignId: string,
  loopNumber: number,
  limit: number,
): Promise<MasterRecentRow[]> {
  const { data } = await admin
    .from('transactions')
    .select(
      'kind, item_name, item_qty, amount_cp, amount_sp, amount_gp, amount_pp, actor_pc:nodes!actor_pc_id(title)',
    )
    .eq('campaign_id', campaignId)
    .eq('status', 'approved')
    .eq('loop_number', loopNumber)
    .order('created_at', { ascending: false })
    .limit(limit)
  type Row = {
    kind: string
    item_name: string | null
    item_qty: number
    amount_cp: number
    amount_sp: number
    amount_gp: number
    amount_pp: number
    actor_pc: { title: string | null } | { title: string | null }[] | null
  }
  return ((data ?? []) as Row[]).map((r) => {
    const actor = Array.isArray(r.actor_pc) ? r.actor_pc[0] : r.actor_pc
    const coins: CoinSet = {
      cp: r.amount_cp,
      sp: r.amount_sp,
      gp: r.amount_gp,
      pp: r.amount_pp,
    }
    return {
      actorTitle: actor?.title ?? null,
      itemName: r.kind === 'item' ? r.item_name : null,
      itemQty: r.item_qty,
      signedGp: aggregateGp(coins),
    }
  })
}

/** Read everything the pinned dashboard shows for the current loop. */
export async function composeMasterState(
  admin: SupabaseClient,
  campaignId: string,
): Promise<MasterState> {
  const loop = await getCurrentLoopInfo(admin, campaignId)
  const pcs = await getCampaignPcs(admin, campaignId)
  const { rows, stashGp } = await getAllBalancesTg(
    admin,
    campaignId,
    loop.number,
    pcs.map((p) => ({ id: p.id, title: p.title, isOwn: false })),
  )
  const recent = await getCampaignRecentTx(admin, campaignId, loop.number, RECENT_LIMIT)
  const stashItems = await getStashItemHoldingsTg(admin, campaignId, loop.number)
  return {
    loopNumber: loop.number,
    loopTitle: loop.title,
    stashGp,
    stashItems,
    pcs: rows
      .map((r) => ({ title: r.title, gp: r.aggregateGp }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    recent,
  }
}

// ── storage (campaigns.settings JSONB) ──────────────────────────────────────

/** The stored master-message id for this campaign, or null. */
export async function getMasterMessageId(
  admin: SupabaseClient,
  campaignId: string,
): Promise<number | null> {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .single()
  const settings = (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const v = settings[SETTINGS_KEY]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** RMW-merge the id into settings so sibling keys are never clobbered (FR-004). */
async function setMasterMessageId(
  admin: SupabaseClient,
  campaignId: string,
  messageId: number,
): Promise<void> {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .single()
  const settings = (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const next = { ...settings, [SETTINGS_KEY]: messageId }
  await admin.from('campaigns').update({ settings: next }).eq('id', campaignId)
}

// ── orchestration ───────────────────────────────────────────────────────────

/**
 * Re-render the master message and reflect it in Telegram. NEVER throws.
 *
 * - `mint` (loop-started): post a NEW message for the new loop and store its id,
 *   leaving the previous message frozen as history (D3). The admin pins it.
 * - else: edit the stored message in place; if none is stored, bootstrap a first
 *   one (D5/FR-005); if the stored message is gone, repost and re-store
 *   (D6/FR-006). A transient send/edit error just leaves the id for the next
 *   event to retry.
 */
export async function refreshMasterMessage(
  admin: SupabaseClient,
  campaignId: string,
  opts: { mint: boolean },
): Promise<void> {
  try {
    const html = renderMasterMessageHtml(await composeMasterState(admin, campaignId))

    if (opts.mint) {
      const id = await sendLedgerMessage(html)
      if (id != null) await setMasterMessageId(admin, campaignId, id)
      return
    }

    const existing = await getMasterMessageId(admin, campaignId)
    if (existing == null) {
      const id = await sendLedgerMessage(html)
      if (id != null) await setMasterMessageId(admin, campaignId, id)
      return
    }

    const outcome = await editLedgerMessage(existing, html)
    if (outcome === 'gone') {
      // The admin deleted the pinned message — post a fresh one and re-store.
      const id = await sendLedgerMessage(html)
      if (id != null) await setMasterMessageId(admin, campaignId, id)
    }
    // 'ok' | 'unchanged' | 'error' → keep the stored id as-is.
  } catch (e) {
    console.error('[ledger-master] refresh error', e)
  }
}

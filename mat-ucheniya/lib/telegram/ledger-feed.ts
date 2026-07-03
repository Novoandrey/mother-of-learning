/**
 * Ledger feed (spec-053) — resolves player/PC names and posts money/loot events
 * to the "Денежки, лут" topic. Replaces DM approval as the awareness channel:
 * instead of gating writes, the bot narrates them.
 *
 * The wording lives in `ledger-format.ts` (pure, unit-tested). This file only
 * does the impure parts: name resolution + send. `notifyLedgerEvent` NEVER
 * throws (a failed post must not break the ledger write) and short-circuits
 * instantly when the feed isn't configured (staging/dev — see bot.ts).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ledgerFeedConfigured, sendLedgerMessage } from '@/lib/telegram/bot'
import {
  formatLedgerEvent,
  type LedgerEvent,
  type ResolvedNames,
} from '@/lib/telegram/ledger-format'

export type { LedgerEvent, FeedLineItem } from '@/lib/telegram/ledger-format'

type ProfileRow = { user_id: string; display_name: string | null; login: string }

async function resolveNames(
  admin: ReturnType<typeof createAdminClient>,
  event: LedgerEvent,
): Promise<ResolvedNames> {
  const actorPcId =
    event.type === 'transfer'
      ? event.senderPcId
      : event.type === 'set-created'
        ? null
        : event.actorPcId
  const recipientPcId = event.type === 'transfer' ? event.recipientPcId : null

  const pcIds = [actorPcId, recipientPcId].filter((x): x is string => !!x)
  const [pcRes, profileRes] = await Promise.all([
    pcIds.length
      ? admin.from('nodes').select('id, title').in('id', pcIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    event.authorUserId
      ? admin
          .from('user_profiles')
          .select('user_id, display_name, login')
          .eq('user_id', event.authorUserId)
          .maybeSingle()
      : Promise.resolve({ data: null as ProfileRow | null }),
  ])

  const titleById = new Map<string, string | null>()
  for (const r of (pcRes.data ?? []) as { id: string; title: string | null }[]) {
    titleById.set(r.id, r.title)
  }
  const profile = (profileRes.data ?? null) as ProfileRow | null
  const playerName = profile
    ? (profile.display_name?.trim() || profile.login || null)
    : null

  return {
    playerName,
    pcTitle: actorPcId ? (titleById.get(actorPcId) ?? null) : null,
    recipientPcTitle: recipientPcId ? (titleById.get(recipientPcId) ?? null) : null,
  }
}

/**
 * Resolve names, format, and post an event to the ledger topic. Await it from
 * the transaction actions after a successful write. Never throws and does zero
 * work when the feed isn't configured, so it's safe on every path.
 */
export async function notifyLedgerEvent(event: LedgerEvent): Promise<void> {
  try {
    if (!ledgerFeedConfigured()) return
    const admin = createAdminClient()
    const names = await resolveNames(admin, event)
    await sendLedgerMessage(formatLedgerEvent(event, names))
  } catch (e) {
    console.error('[ledger-feed] notify error', e)
  }
}

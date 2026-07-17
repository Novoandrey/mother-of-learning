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

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ledgerFeedConfigured, sendLedgerMessage } from '@/lib/telegram/bot'
import { refreshMasterMessage } from '@/lib/telegram/ledger-master'
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
      : event.type === 'set-created' ||
          event.type === 'loop-started' ||
          event.type === 'expedition' ||
          event.type === 'craft' ||
          event.type === 'loot-distributed'
        ? null
        : event.actorPcId
  // 'craft' can distribute a batch to several PCs. Keep the legacy single
  // slot for all other event types and old craft events.
  const recipientPcIds = event.type === 'craft'
    ? (event.recipientPcIds ?? (event.recipientPcId ? [event.recipientPcId] : []))
    : []
  const recipientPcId =
    event.type === 'transfer'
      ? event.recipientPcId
      : event.type === 'craft'
        ? (recipientPcIds[0] ?? null)
        : null
  const participantPcIds =
    event.type === 'expedition'
      ? event.participantPcIds
      : event.type === 'craft'
        ? event.participants.map((p) => p.pcId)
        : []

  const pcIds = [actorPcId, recipientPcId, ...recipientPcIds, ...participantPcIds].filter(
    (x): x is string => !!x,
  )
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
    recipientPcTitles: recipientPcIds.map((id) => titleById.get(id) ?? '—'),
    participantTitles: participantPcIds.map((id) => titleById.get(id) ?? '—'),
  }
}

/**
 * Post an event to the ledger topic — OFF the write's critical path.
 *
 * Callers `await` this, but it returns almost immediately: the actual name
 * resolution + Telegram send are handed to `after()`, which runs them once the
 * response is sent. So a slow or unreachable Telegram (the bot fetch is also
 * timeout-bounded) can never delay, block, or hang the transaction that
 * triggered it. Never throws; does zero work when the feed isn't configured.
 */
export async function notifyLedgerEvent(event: LedgerEvent): Promise<void> {
  if (!ledgerFeedConfigured()) return
  try {
    after(async () => {
      try {
        const admin = createAdminClient()
        const names = await resolveNames(admin, event)
        await sendLedgerMessage(formatLedgerEvent(event, names))
        // Master message (spec-054): keep the pinned dashboard current. On
        // loop-started we mint a fresh message for the new loop (D3), otherwise
        // edit it in place. refreshMasterMessage never throws — a refresh
        // failure must not affect the per-event send above or the write.
        await refreshMasterMessage(admin, event.campaignId, {
          mint: event.type === 'loop-started',
        })
      } catch (e) {
        console.error('[ledger-feed] notify error', e)
      }
    })
  } catch (e) {
    // after() outside a request scope (shouldn't happen from actions) — degrade
    // to a silent no-op rather than let it bubble into the write path.
    console.error('[ledger-feed] after() unavailable', e)
  }
}

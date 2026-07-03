/**
 * Low-level Telegram Bot API calls for the ledger feed (spec-053).
 *
 * The bot posts money/loot events into a supergroup forum topic ("Денежки,
 * лут"). Two hard rules baked in here:
 *
 *  1. **Prod-only, by construction.** The target chat/topic live in server-only
 *     env (`TG_LEDGER_CHAT_ID` / `TG_LEDGER_TOPIC_ID`), set on the prod box and
 *     nowhere else. Staging's DB is a snapshot of prod (same campaign rows), so
 *     a DB flag couldn't tell the two apart — the env can. No env → every call
 *     is a silent no-op. That is the entire staging-safety mechanism.
 *  2. **Never throws.** A failed or misconfigured post must never break the
 *     ledger write that triggered it. Every path returns a value; errors are
 *     logged and swallowed.
 *
 * Uses raw `fetch` against the Bot API — no SDK dependency (YAGNI). Messages
 * are HTML (`parse_mode: HTML`) so we can use <b>, escaping, and expandable
 * <blockquote> for long bodies; callers must escape dynamic text themselves.
 */

const API = 'https://api.telegram.org'

type FeedConfig = { token: string; chatId: string; threadId: number | undefined }

function feedConfig(): FeedConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TG_LEDGER_CHAT_ID
  const topicRaw = process.env.TG_LEDGER_TOPIC_ID
  if (!token || !chatId) return null
  const threadId = topicRaw ? Number(topicRaw) : undefined
  return {
    token,
    chatId,
    threadId: Number.isFinite(threadId) ? threadId : undefined,
  }
}

/**
 * Whether the ledger feed is wired up in this environment. Callers use it to
 * short-circuit before doing any name-resolution DB work on staging/dev.
 */
export function ledgerFeedConfigured(): boolean {
  return feedConfig() !== null
}

// Hard cap on any Bot API call. The feed runs off the write path (see
// notifyLedgerEvent → after()), but a bare fetch has no connect timeout — if
// the box can't reach api.telegram.org (egress/IPv6 stall) the socket hangs for
// minutes. This bounds every call so a hung Telegram can never pile up work.
const BOT_TIMEOUT_MS = 4000

async function botCall(method: string, payload: unknown): Promise<Response | null> {
  const c = feedConfig()
  if (!c) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS)
  try {
    return await fetch(`${API}/bot${c.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (e) {
    // AbortError (timeout) or network failure — both are non-fatal for the feed.
    console.error(`[ledger-feed] ${method} error`, e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Post a new message to the ledger topic. Returns the message id, or null. */
export async function sendLedgerMessage(html: string): Promise<number | null> {
  const c = feedConfig()
  if (!c) return null
  const res = await botCall('sendMessage', {
    chat_id: c.chatId,
    ...(c.threadId !== undefined ? { message_thread_id: c.threadId } : {}),
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
  if (!res) return null
  if (!res.ok) {
    console.error(
      '[ledger-feed] sendMessage failed',
      res.status,
      await res.text().catch(() => ''),
    )
    return null
  }
  const data = (await res.json().catch(() => null)) as {
    ok: boolean
    result?: { message_id: number }
  } | null
  return data?.ok ? (data.result?.message_id ?? null) : null
}

/**
 * Edit an existing ledger message in place. Not used by the per-event feed yet;
 * it exists now so the future editable-pinned-summary increment (loop + stash
 * state) drops in without reworking this layer. Returns whether it succeeded.
 */
export async function editLedgerMessage(
  messageId: number,
  html: string,
): Promise<boolean> {
  const res = await botCall('editMessageText', {
    chat_id: feedConfig()?.chatId,
    message_id: messageId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
  if (!res) return false
  if (!res.ok) {
    console.error(
      '[ledger-feed] editMessage failed',
      res.status,
      await res.text().catch(() => ''),
    )
  }
  return res.ok
}

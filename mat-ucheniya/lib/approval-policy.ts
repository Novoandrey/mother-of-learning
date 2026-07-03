/**
 * Whether a transaction write is auto-approved vs queued as pending.
 *
 * Spec-014: DM/owner writes are always approved; player writes go to the
 * approval queue (pending). Spec-044 / C-05: the **free общак** exception — the
 * stash wrappers pass `autoApprove` so a player's put/take into the общак is
 * approved directly, not queued. No other player write sets `autoApprove`.
 *
 * Campaign kill-switch: `approvalsEnabled=false` short-circuits everything to
 * approved (the DM turned the whole queue off — awareness moves to the Telegram
 * ledger feed instead). The code path stays intact so it can be flipped back on
 * per campaign; see `approvalsEnabledFromSettings`.
 *
 * Pure so the rule is unit-tested in one place; the transaction actions call it
 * instead of duplicating the `role === 'player'` checks.
 */
export type ActorRole = 'owner' | 'dm' | 'player'

export function isAutoApproved(
  role: ActorRole,
  autoApprove?: boolean,
  approvalsEnabled = true,
): boolean {
  if (!approvalsEnabled) return true
  return role !== 'player' || autoApprove === true
}

/**
 * Read the campaign approval kill-switch from `campaigns.settings`
 * (JSONB `approvals_enabled`). **Defaults to `false`** — approvals are off
 * unless a campaign explicitly opts back in with `approvals_enabled: true`.
 * The purchase rarity gate (`item_purchase_policy.approvalRequired`) is also
 * gated by this, so an off switch means nothing ever queues.
 */
export function approvalsEnabledFromSettings(settings: unknown): boolean {
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const v = (settings as Record<string, unknown>).approvals_enabled
    if (typeof v === 'boolean') return v
  }
  return false
}

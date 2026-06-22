/**
 * Whether a transaction write is auto-approved vs queued as pending.
 *
 * Spec-014: DM/owner writes are always approved; player writes go to the
 * approval queue (pending). Spec-044 / C-05: the **free общак** exception — the
 * stash wrappers pass `autoApprove` so a player's put/take into the общак is
 * approved directly, not queued. No other player write sets `autoApprove`.
 *
 * Pure so the rule is unit-tested in one place; the transaction actions call it
 * instead of duplicating the `role === 'player'` checks.
 */
export type ActorRole = 'owner' | 'dm' | 'player'

export function isAutoApproved(role: ActorRole, autoApprove?: boolean): boolean {
  return role !== 'player' || autoApprove === true
}

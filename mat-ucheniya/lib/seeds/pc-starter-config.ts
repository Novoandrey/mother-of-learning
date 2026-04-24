/**
 * Spec-012 — PC-create hook for `pc_starter_configs`.
 *
 * Migration 037 seeded one `pc_starter_configs` row per EXISTING
 * character node. For NEW characters created after the migration,
 * this helper inserts the default row — idempotent, so it's safe to
 * call unconditionally from the PC-create flow without worrying about
 * re-entry.
 *
 * Called from `hooks/use-node-form.ts` right after `nodes.insert(...)`
 * lands, when the selected type is `character`. The user-context
 * Supabase client is passed in: RLS policy `pcsc_modify` allows
 * DM/owner writes, and only DM/owner can create a character node in
 * the first place (player permissions gated via `canEditNode`), so
 * the insert always succeeds for a legitimate caller.
 *
 * Not atomic with the node insert — if the node lands and this fails
 * (transient DB error), the apply action's defensive default in
 * `getPcStarterConfigsForCampaign` will still return a reasonable
 * zero-config fallback. A subsequent successful call here catches it
 * up, and the `on conflict` guard makes manual retries safe.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function ensurePcStarterConfig(
  supabase: SupabaseClient,
  pcId: string,
): Promise<void> {
  // `pc_starter_configs.pc_id` is PRIMARY KEY, so `on conflict (pc_id)
  // do nothing` is the idempotency guarantee. All other columns fall
  // back to their DEFAULTs (takes_starting_loan=true, zeros, empty
  // jsonb array).
  const { error } = await supabase
    .from('pc_starter_configs')
    .upsert({ pc_id: pcId }, { onConflict: 'pc_id', ignoreDuplicates: true })

  if (error) {
    // Non-fatal: log for diagnostics but don't block the PC-create
    // flow. The defensive default in getPcStarterConfigsForCampaign
    // handles the missing row gracefully.
    // eslint-disable-next-line no-console
    console.warn('[ensurePcStarterConfig] insert failed:', error.message)
  }
}

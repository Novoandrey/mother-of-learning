'use server'

import { getMembership } from '@/lib/auth'
import { invalidateSidebar } from '@/lib/sidebar-cache'

/**
 * Client-side mutations (see hooks/use-node-form.ts) can't call
 * revalidateTag directly. This server action is the thin bridge:
 * call after creating/renaming/deleting a node so the sidebar picks
 * up the change on the next navigation instead of waiting for the
 * 60s revalidate.
 *
 * We gate on membership so a random POST from an unauthenticated
 * client can't trigger cache churn across all campaigns.
 */
export async function invalidateSidebarAction(campaignId: string): Promise<void> {
  const membership = await getMembership(campaignId)
  if (!membership) return
  invalidateSidebar(campaignId)
}

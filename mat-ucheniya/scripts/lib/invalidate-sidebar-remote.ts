/**
 * scripts/lib/invalidate-sidebar-remote.ts
 *
 * CLI helper that POSTs to /api/admin/invalidate-sidebar so bulk-data
 * scripts can refresh the sidebar without waiting for the 60s TTL.
 *
 * Reads:
 *   - APP_URL (default: http://localhost:3000)
 *   - SUPABASE_SERVICE_ROLE_KEY (required for auth)
 *
 * Non-fatal: if the call fails (server down, wrong URL, etc.) we just
 * log a warning. The seed itself already succeeded — at worst the
 * sidebar shows stale data for 60s, same as before this script existed.
 */
export async function invalidateSidebarRemote(campaign: string): Promise<void> {
  const baseUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY missing; skipping sidebar invalidation.')
    return
  }

  const url = `${baseUrl}/api/admin/invalidate-sidebar?campaign=${encodeURIComponent(campaign)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        `⚠ Sidebar invalidation failed (${res.status}): ${body || res.statusText}. ` +
          'Sidebar will refresh within 60s.',
      )
      return
    }
    console.log(`✓ Sidebar cache invalidated at ${baseUrl}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `⚠ Sidebar invalidation request failed: ${msg}. ` +
        `Set APP_URL if the app runs on a non-default host. ` +
        `Sidebar will refresh within 60s.`,
    )
  }
}

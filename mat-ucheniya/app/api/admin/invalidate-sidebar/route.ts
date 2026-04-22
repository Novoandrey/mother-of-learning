import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateSidebar } from '@/lib/sidebar-cache'

/**
 * POST /api/admin/invalidate-sidebar?campaign=<slug-or-uuid>
 *
 * Admin-only endpoint for CLI scripts (`seed-srd`, `dedupe-srd`,
 * `import-electives`) to invalidate the sidebar cache after a bulk
 * mutation. CLI scripts run outside the Next runtime so they can't
 * call `revalidateTag` directly.
 *
 * Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>. The same
 * key the script already needs to do its work. We compare with
 * `timingSafeEqual`-equivalent semantics by length-checking first.
 *
 * Why service-role and not a custom admin token: keeps the surface
 * small. There's already exactly one secret that grants script-level
 * power; reusing it avoids inventing a parallel auth scheme.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    )
  }

  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !constantTimeEqual(token, serviceKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignParam = request.nextUrl.searchParams.get('campaign')?.trim()
  if (!campaignParam) {
    return NextResponse.json(
      { error: "Missing 'campaign' query param (slug or UUID)" },
      { status: 400 },
    )
  }

  // Resolve slug → id if needed.
  let campaignId = campaignParam
  if (!UUID_RE.test(campaignParam)) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('campaigns')
      .select('id')
      .eq('slug', campaignParam)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json(
        { error: `Campaign not found: ${campaignParam}` },
        { status: 404 },
      )
    }
    campaignId = data.id
  }

  invalidateSidebar(campaignId)

  return NextResponse.json({ ok: true, campaign_id: campaignId })
}

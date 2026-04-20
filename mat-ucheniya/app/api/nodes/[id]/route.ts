import { createClient } from '@/lib/supabase/server'
import { canEditNode, getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import { NextRequest, NextResponse } from 'next/server'

async function resolveNodeCampaign(
  nodeId: string,
): Promise<{ campaign_id: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nodes')
    .select('campaign_id')
    .eq('id', nodeId)
    .maybeSingle()
  return data ?? null
}

// PATCH /api/nodes/[id] — update node fields (tags, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  // Auth: signed-in + onboarded.
  const auth = await getCurrentUserAndProfile()
  if (!auth || !auth.profile || auth.profile.must_change_password) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve the campaign for this node — we need it for membership + canEdit.
  const nodeMeta = await resolveNodeCampaign(id)
  if (!nodeMeta) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  const membership = await getMembership(nodeMeta.campaign_id)
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Write gate (spec-006 increment 4): owner/dm always; player only on
  // their own PC. Mirrors SQL can_edit_node() for clean 403 responses.
  const allowed = await canEditNode(
    id,
    nodeMeta.campaign_id,
    auth.user.id,
    membership.role,
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  // Support partial field updates via { fields: { tags: [...] } }
  if (body.fields) {
    // Merge with existing fields.
    const { data: existing } = await supabase
      .from('nodes')
      .select('fields')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    const merged = { ...(existing.fields as Record<string, unknown>), ...body.fields }
    const { error } = await supabase
      .from('nodes')
      .update({ fields: merged })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/nodes/[id] — delete node and its edges
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const auth = await getCurrentUserAndProfile()
  if (!auth || !auth.profile || auth.profile.must_change_password) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nodeMeta = await resolveNodeCampaign(id)
  if (!nodeMeta) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  // Delete is owner/dm only — players never delete, even their own PCs.
  // This matches the SQL RLS policy nodes_delete in migration 028.
  const membership = await getMembership(nodeMeta.campaign_id)
  if (
    !membership ||
    (membership.role !== 'owner' && membership.role !== 'dm')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  // Edges cascade on delete (FK CASCADE), so just delete the node.
  const { error } = await supabase.from('nodes').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Node gone → sidebar list is stale for this campaign.
  invalidateSidebar(nodeMeta.campaign_id)

  return NextResponse.json({ ok: true })
}

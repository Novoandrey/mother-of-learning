import { createClient } from '@/lib/supabase/server'
import { canEditNode, getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// PUT /api/nodes/[id]/content — update the node's markdown body.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { content } = await request.json()

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }

  const auth = await getCurrentUserAndProfile()
  if (!auth || !auth.profile || auth.profile.must_change_password) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: nodeMeta } = await supabase
    .from('nodes')
    .select('campaign_id')
    .eq('id', id)
    .maybeSingle()
  if (!nodeMeta) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  const membership = await getMembership(nodeMeta.campaign_id)
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = await canEditNode(
    id,
    nodeMeta.campaign_id,
    auth.user.id,
    membership.role,
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('nodes').update({ content }).eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { createClient } from '@/lib/supabase/server'
import { canEditNode, getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { node_id, campaign_id, title, content, loop_number, game_date } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
  }

  // Auth: signed-in + onboarded member of the campaign.
  const auth = await getCurrentUserAndProfile()
  if (!auth || !auth.profile || auth.profile.must_change_password) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const membership = await getMembership(campaign_id)
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Spec-006 increment 4: chronicle writes require either owner/dm OR
  // (player editing their own PC's chronicle).
  const isManager = membership.role === 'owner' || membership.role === 'dm'
  if (!isManager) {
    // Players can only add chronicles attached to a PC they own.
    if (!node_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const allowed = await canEditNode(
      node_id,
      campaign_id,
      auth.user.id,
      membership.role,
    )
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chronicles')
    .insert({
      node_id: node_id || null,
      campaign_id,
      title: title.trim(),
      content: content || '',
      loop_number: loop_number ?? null,
      game_date: game_date || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

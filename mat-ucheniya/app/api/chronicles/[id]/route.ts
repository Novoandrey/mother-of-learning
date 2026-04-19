import { createClient } from '@/lib/supabase/server'
import { canEditNode, getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Resolve {campaign_id, node_id} for a chronicle + verify the caller can
 * write to it. Returns { allowed: true } or an error response object.
 */
async function gateChronicle(chronicleId: string) {
  const auth = await getCurrentUserAndProfile()
  if (!auth || !auth.profile || auth.profile.must_change_password) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = await createClient()
  const { data: chronicle } = await supabase
    .from('chronicles')
    .select('campaign_id, node_id')
    .eq('id', chronicleId)
    .maybeSingle()

  if (!chronicle) {
    return { response: NextResponse.json({ error: 'Chronicle not found' }, { status: 404 }) }
  }

  const membership = await getMembership(chronicle.campaign_id)
  if (!membership) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const isManager = membership.role === 'owner' || membership.role === 'dm'
  if (!isManager) {
    // Players may only touch chronicles bound to a PC they own.
    if (!chronicle.node_id) {
      return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    const allowed = await canEditNode(
      chronicle.node_id,
      chronicle.campaign_id,
      auth.user.id,
      membership.role,
    )
    if (!allowed) {
      return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
  }

  return { allowed: true as const }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()
  const { title, content, loop_number, game_date } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const gate = await gateChronicle(id)
  if ('response' in gate) return gate.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chronicles')
    .update({
      title: title.trim(),
      content: content || '',
      loop_number: loop_number ?? null,
      game_date: game_date || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const gate = await gateChronicle(id)
  if ('response' in gate) return gate.response

  const supabase = await createClient()
  const { error } = await supabase.from('chronicles').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

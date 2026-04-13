import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/nodes/[id] — update node fields (tags, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const supabase = await createClient()

  // Support partial field updates via { fields: { tags: [...] } }
  if (body.fields) {
    // Merge with existing fields
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Edges cascade on delete (FK CASCADE), so just delete the node
  const { error } = await supabase
    .from('nodes')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

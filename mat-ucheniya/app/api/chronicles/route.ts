import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { node_id, campaign_id, title, content, loop_number, game_date } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
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

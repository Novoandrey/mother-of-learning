import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getMediaAssetUsages } from '@/lib/server/media-usage'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const campaignId = new URL(request.url).searchParams.get('campaignId') ?? ''
  if (!await getMembership(campaignId)) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })

  const supabase = await createClient()
  const { data: asset } = await supabase
    .from('media_assets')
    .select('id')
    .eq('id', id)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Ассет не найден.' }, { status: 404 })

  try {
    return NextResponse.json({ usages: await getMediaAssetUsages(supabase, id) })
  } catch {
    return NextResponse.json({ error: 'Не удалось проверить использования ассета.' }, { status: 500 })
  }
}

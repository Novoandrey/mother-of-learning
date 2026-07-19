import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth'
import { getCampaignMediaPage } from '@/lib/queries/media'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const campaignId = searchParams.get('campaignId') ?? ''
  const cursor = searchParams.get('cursor')
  const membership = await getMembership(campaignId)
  if (!membership) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  try {
    return NextResponse.json(await getCampaignMediaPage(await createClient(), campaignId, cursor))
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_MEDIA_CURSOR') return NextResponse.json({ error: 'Некорректная страница медиатеки.' }, { status: 400 })
    return NextResponse.json({ error: 'Не удалось загрузить медиатеку.' }, { status: 500 })
  }
}

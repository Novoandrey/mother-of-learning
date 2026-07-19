import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth'
import { isMediaManager } from '@/lib/media'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data: asset } = await admin
    .from('media_assets')
    .select('id, campaign_id, variant_version, variant_state')
    .eq('id', id)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Ассет не найден.' }, { status: 404 })
  if (asset.variant_state === 'ready') {
    return NextResponse.json({ error: 'Варианты уже готовы.' }, { status: 409 })
  }
  const membership = await getMembership(asset.campaign_id)
  if (!membership || !isMediaManager(membership.role)) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  const { error } = await admin.from('media_variant_jobs').update({ state: 'queued', next_attempt_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null, last_error_code: null }).eq('asset_id', id).eq('version', asset.variant_version)
  if (error) return NextResponse.json({ error: 'Не удалось поставить обработку в очередь.' }, { status: 500 })
  await admin.from('media_assets').update({ variant_state: 'queued', variant_error_code: null }).eq('id', id)
  return NextResponse.json({ ok: true }, { status: 202 })
}

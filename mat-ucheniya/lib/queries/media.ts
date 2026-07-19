import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MEDIA_ASSET_COLUMNS,
  toMediaAssetView,
  type MediaAssetRow,
  type MediaAssetView,
} from '@/lib/media'

export async function getCampaignMediaAssets(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<MediaAssetView[]> {
  const { data, error } = await supabase
    .from('media_assets')
    .select(MEDIA_ASSET_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error
  return ((data ?? []) as MediaAssetRow[]).map(toMediaAssetView)
}

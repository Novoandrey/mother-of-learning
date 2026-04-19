import { createClient } from '@/lib/supabase/server'
import { isHpMethod, type HpMethod } from '@/lib/statblock'

export type CampaignSettings = {
  hp_method: HpMethod
  // Future keys go here.
}

export type Campaign = {
  id: string
  name: string
  slug: string
  settings: CampaignSettings
}

const DEFAULT_SETTINGS: CampaignSettings = {
  hp_method: 'average',
}

export function parseCampaignSettings(raw: unknown): CampaignSettings {
  const out: CampaignSettings = { ...DEFAULT_SETTINGS }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    if (isHpMethod(r.hp_method)) out.hp_method = r.hp_method
  }
  return out
}

export async function getCampaignBySlug(slug: string): Promise<Campaign | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('id, name, slug, settings')
    .eq('slug', slug)
    .single()
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    settings: parseCampaignSettings((data as { settings?: unknown }).settings),
  }
}

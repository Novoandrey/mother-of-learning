import { createClient } from '@/lib/supabase/server'

export type Campaign = {
  id: string
  name: string
  slug: string
}

export async function getCampaignBySlug(slug: string): Promise<Campaign | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()
  return data
}

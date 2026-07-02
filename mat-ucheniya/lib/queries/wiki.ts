import type { SupabaseClient } from '@supabase/supabase-js'
import type { WikiTitleEntry } from '@/lib/wikilinks'

/**
 * Desktop-side wiki helper (spec-021). The /tg app has its own read queries in
 * `wiki-tg.ts`; this is the thin server-side counterpart the desktop pages need
 * for `[[wikilink]]` resolution: the campaign's character/npc/creature nodes as
 * a flat `{ id, title }[]`, which `MarkdownContent` turns into a title→id index.
 *
 * Same three "who/what" types as the catalog (getWikiNodes). RLS-scoped through
 * whichever client is passed (server client on the detail/session pages).
 */

const WIKI_TYPES: readonly string[] = ['character', 'npc', 'creature']

export async function getWikiTitleIndex(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<WikiTitleEntry[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .in('node_types.slug', WIKI_TYPES)

  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as { id: string; title: string }
    return { id: r.id, title: r.title }
  })
}

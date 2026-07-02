import type { SupabaseClient } from '@supabase/supabase-js'
import { orderPortraits, PORTRAIT_COLUMNS, type Portrait } from '@/lib/portraits'

/**
 * Read-side queries for the Telegram Mini App wiki/catalog (spec-030, Phase 2).
 *
 * Runs client-side through the Telegram-minted session, so every read is
 * RLS-scoped: `nodes` SELECT is member-wide (mirrors `is_member`) and
 * `character_portraits` SELECT lets any campaign member read any portrait
 * (mig 116). Read-only — no writes here; editing is spec-021.
 *
 * The catalog covers the three "who/what" node types — persons and creatures:
 *   character → PC, npc → НПС, creature → существо.
 */

/** The node types that make up the catalog, in a fixed lookup shape. */
export type WikiType = 'character' | 'npc' | 'creature'
const WIKI_TYPES: readonly WikiType[] = ['character', 'npc', 'creature']

export type WikiListItem = {
  id: string
  title: string
  type: WikiType
  /** Primary portrait key (or first, or null) — mini-avatar in the list. */
  primaryPortraitKey: string | null
}

/**
 * Every character/npc/creature node in the campaign, alphabetised by title
 * (Russian collation). Each row carries its primary portrait key for the
 * list's mini-avatar. Portraits are embedded *without* `!inner`, so nodes with
 * no portrait are still returned (key is null → letter placeholder).
 *
 * Type is resolved via the `node_types!inner(slug)` join and filtered to the
 * three catalog slugs with `.in(...)`; the slug is read back so we can tag each
 * row without a second roundtrip.
 */
export async function getWikiNodes(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<WikiListItem[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, node_types!inner(slug), character_portraits(r2_key, is_primary)')
    .eq('campaign_id', campaignId)
    .in('node_types.slug', WIKI_TYPES as unknown as string[])
    .order('title')

  if (error) throw error

  const mapped: WikiListItem[] = (data ?? []).map((row) => {
    const r = row as {
      id: string
      title: string
      node_types: { slug: string } | { slug: string }[] | null
      character_portraits?: Array<{ r2_key: string; is_primary: boolean }>
    }
    const nt = Array.isArray(r.node_types) ? r.node_types[0] : r.node_types
    const portraits = r.character_portraits ?? []
    const primary = portraits.find((p) => p.is_primary) ?? portraits[0] ?? null
    return {
      id: r.id,
      title: r.title,
      type: (nt?.slug ?? 'npc') as WikiType,
      primaryPortraitKey: primary ? primary.r2_key : null,
    }
  })

  // PostgREST's `.order('title')` is byte/ASCII-ish; re-sort with the Russian
  // locale so Ё and mixed-case land where a reader expects.
  return mapped.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

export type WikiNode = {
  id: string
  title: string
  content: string
  type: WikiType
  portraits: Portrait[]
}

/**
 * A single catalog node: its markdown body + all portraits in carousel order.
 * Portraits are decorative, so a null/failed fetch degrades to [] — the node
 * still opens, just without a carousel. Uses the shared PORTRAIT_COLUMNS +
 * orderPortraits so the order matches the desktop carousel exactly.
 */
export async function getWikiNode(
  supabase: SupabaseClient,
  nodeId: string,
): Promise<WikiNode> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, content, node_types!inner(slug)')
    .eq('id', nodeId)
    .single()
  if (error) throw error

  const r = data as {
    id: string
    title: string
    content: string | null
    node_types: { slug: string } | { slug: string }[] | null
  }
  const nt = Array.isArray(r.node_types) ? r.node_types[0] : r.node_types

  const { data: portraitRows } = await supabase
    .from('character_portraits')
    .select(PORTRAIT_COLUMNS)
    .eq('character_node_id', nodeId)
  const portraits = orderPortraits((portraitRows ?? []) as Portrait[])

  return {
    id: r.id,
    title: r.title,
    content: r.content ?? '',
    type: (nt?.slug ?? 'npc') as WikiType,
    portraits,
  }
}

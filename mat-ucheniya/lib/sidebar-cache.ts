import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cached sidebar dataset for a campaign: node_types + all nodes.
 *
 * The sidebar is rendered on every page inside /c/[slug]/*, so without a
 * cache each navigation re-fetches 150+ nodes. These two queries are
 * read-heavy and change only on explicit mutations (create/edit/delete
 * node, create node_type), so we cache them per campaign and invalidate
 * via revalidateTag('sidebar:<campaignId>') from the server actions that
 * mutate them.
 *
 * We use the admin client here because the data is campaign-wide reference
 * data (sidebar is the same for every member of the campaign). RLS is
 * still enforced on writes and on the detail page fetches — this cache
 * only holds shape-level info (id, title, type_slug) a member already
 * has permission to see.
 *
 * Stale-while-revalidate: cached entries are reused for 60s even if no
 * explicit invalidation happens, so the worst case after a missed
 * revalidate tag is a 1-minute delay.
 */
export function sidebarCacheTag(campaignId: string): string {
  return `sidebar:${campaignId}`
}

export type SidebarDataset = {
  nodeTypes: Array<{ id: string; slug: string; label: string; icon: string | null }>
  nodes: Array<{ id: string; title: string; type_slug: string }>
}

export const getSidebarData = (campaignId: string) =>
  unstable_cache(
    async (): Promise<SidebarDataset> => {
      const admin = createAdminClient()

      // Paginated nodes load: Supabase's project-level db-max-rows
      // (default 1000) clamps server-side regardless of the client's
      // .range() request. mat-ucheniya passes that cap post-spec-018,
      // so we loop until a page comes back smaller than the request.
      // Hard ceiling at ~10k rows (PAGE_SIZE * MAX_PAGES) is the same
      // as before — at that point we'd want a count-only sidebar.
      const PAGE_SIZE = 1000
      const MAX_PAGES = 10
      type RawNodeRow = {
        id: string
        title: string
        type: { slug: string } | { slug: string }[] | null
      }
      const allNodeRows: RawNodeRow[] = []
      const typesPromise = admin
        .from('node_types')
        .select('id, slug, label, icon')
        .eq('campaign_id', campaignId)
        .order('sort_order')

      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        const { data, error } = await admin
          .from('nodes')
          .select('id, title, type:node_types(slug)')
          .eq('campaign_id', campaignId)
          .order('title')
          .range(from, to)
        if (error) throw error
        const rows = (data ?? []) as RawNodeRow[]
        allNodeRows.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }

      const typesRes = await typesPromise

      type NodeRow = RawNodeRow
      // Filter encounter mirror nodes (spec-013): they exist as nodes
      // for the autogen badge / ledger source-id linkage but should
      // never appear in the sidebar — the encounter is navigated to
      // via the Encounters list, not the catalog.
      const nodes = (allNodeRows as NodeRow[])
        .filter((n) => {
          const t = Array.isArray(n.type) ? n.type[0] : n.type
          return t?.slug !== 'encounter'
        })
        .map((n) => {
          const t = Array.isArray(n.type) ? n.type[0] : n.type
          return {
            id: n.id,
            title: n.title,
            type_slug: t?.slug ?? '',
          }
        })

      // Filter encounter node_type from the type list too — there's
      // no group to render for it.
      const nodeTypes = (
        (typesRes.data ?? []) as SidebarDataset['nodeTypes']
      ).filter((t) => t.slug !== 'encounter')

      return {
        nodeTypes,
        nodes,
      }
    },
    ['sidebar-data', campaignId],
    { tags: [sidebarCacheTag(campaignId)], revalidate: 60 },
  )()

/**
 * Invalidate the sidebar cache for a campaign. Call from any server action
 * that creates/updates/deletes a node or a node_type.
 *
 * Next 16's revalidateTag() requires a cache profile as the 2nd argument.
 * 'max' matches the unstable_cache above (which keeps entries until
 * explicitly invalidated or the 60s revalidate kicks in).
 */
export function invalidateSidebar(campaignId: string): void {
  revalidateTag(sidebarCacheTag(campaignId), 'max')
}

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sidebar cache invalidation

The campaign sidebar (`lib/sidebar-cache.ts`) is `unstable_cache`d for
60s and tagged `sidebar:<campaignId>`. **Any** server-side mutation that
touches `node_types` or `nodes` (insert/update of title/type/icon/label,
delete) MUST invalidate it, otherwise the sidebar shows stale content
for up to 60s.

How to invalidate, by call site:

- **Server action / Route Handler** — `import { invalidateSidebar } from '@/lib/sidebar-cache'` and call `invalidateSidebar(campaignId)`.
- **Client hook / component** — `import { invalidateSidebarAction } from '@/app/actions/cache'` and `await invalidateSidebarAction(campaignId)`. The server action gates on membership.
- **CLI script (outside Next runtime)** — can't invalidate. Print a notice that the sidebar will refresh in ~60s or after a page reload.

Other tables (`chronicles`, `encounters`, `encounter_participants`,
`edges`, `node_pc_owners`) are NOT in the sidebar cache. Pages that read
them are mostly `export const dynamic = 'force-dynamic'`, so they don't
need explicit invalidation. If you add caching to a new table, document
its invalidation contract here.

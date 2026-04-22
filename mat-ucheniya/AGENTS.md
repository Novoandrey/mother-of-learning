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
- **CLI script (outside Next runtime)** — call `invalidateSidebarRemote(campaignSlug)` from `scripts/lib/invalidate-sidebar-remote.ts`. It POSTs to `/api/admin/invalidate-sidebar` (auth: `Bearer SUPABASE_SERVICE_ROLE_KEY`). Reads `APP_URL` (default `http://localhost:3000`); set it to the deployed URL when running against prod. Failures are non-fatal — the script still succeeds and the sidebar self-heals after 60s.

Other tables (`chronicles`, `encounters`, `encounter_participants`,
`edges`, `node_pc_owners`) are NOT in the sidebar cache. Pages that read
them are mostly `export const dynamic = 'force-dynamic'`, so they don't
need explicit invalidation. If you add caching to a new table, document
its invalidation contract here.

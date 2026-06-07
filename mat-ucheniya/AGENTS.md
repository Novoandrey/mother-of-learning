<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git workflow (changed chat 88)

Claude works in a **feature branch** and opens a **PR into `main`** — never pushes
to `main` directly. Andrey reviews and merges; **merge = deploy trigger**
(`.github/workflows/deploy.yml`: gate `lint`+`typecheck`+`vitest` → Dokploy API).
- Branch names: `feat/<spec>-<short>`, `fix/<short>`, `chore/<short>`.
- **Human-owned**: files under `.github/` and the merge itself — the bot PAT lacks
  `workflow` scope, so GitHub rejects bot pushes to `.github/workflows/*`. Andrey
  commits/edits those (web UI or own token).
- Commits authored as `Claude <claude@anthropic.com>`.
- Specs/docs (`.specify/**`, `NEXT.md`, `chatlog/**`, `*.md`) also go via branch+PR.
  `deploy.yml` has `paths-ignore` for them so doc merges don't rebuild prod.
- Once a staging env exists: PRs target `staging` first, then `staging`→`main`.

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

## Server actions: auth gating is mandatory

All server actions in `app/actions/*.ts` use `createAdminClient()`
(service role) for writes — this **bypasses RLS**. RLS still protects
direct client reads from `lib/queries/*`, but write paths run as
admin. Therefore:

**Every new exported server action MUST start with an auth check.**
Use one of:

- `resolveAuth(campaignId)` — local helper in `app/actions/transactions.ts`
  and `app/actions/approval.ts`. Returns `{ ok, userId, role }` or
  `{ ok: false, error }`. Preferred when the action needs the role
  to branch (player vs DM).
- `getMembership(campaignId)` from `@/lib/auth` — for actions that
  only need to confirm "is this user a member of this campaign".
- `canEditNode(nodeId, campaignId, userId, role)` from `@/lib/auth`
  — for per-node gating that mirrors the RLS policy `can_edit_node`.

Player-acting-on-PC actions also need `isPcOwner(pcId, userId)` — see
`createTransaction` for the canonical pattern (campaign membership +
role check + ownership check before write).

If the action is a thin wrapper that delegates to another already-gated
action (`stash.ts` → `transactions.ts`), document this in the file
header — the lack of own gates needs to be visible at code review.

## Current-phase priorities: data → desktop UX → mobile

The app is used by one DM (owner) on a desktop browser and a handful
of players who mostly read. While that stays true, always tackle
work in this order:

1. **Data correctness.** Schema, server actions, queries. A wrong
   row in the DB poisons every client; a wrong pixel doesn't.
2. **Desktop UX.** The primary surface. Make the keyboard + wide
   layout feel native before touching responsive overrides.
3. **Mobile UX.** Deferred until there's an explicit mobile spec.
   The only mobile-on-desktop-tour exception is "this control is
   literally unclickable on a phone" — fix it in place, keep the
   change minimal.

When in doubt about a mobile-specific fix, add it to `backlog.md`
and tag it with the future mobile spec instead of ad-hoc styling it.
A full responsive pass will come as its own spec once desktop
stabilises.

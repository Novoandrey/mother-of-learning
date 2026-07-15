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

## Game-mechanic numbers are DM settings, never hardcode

**Правило Andrey (2026-07-09):** любое числовое или процентное значение
игровой механики — цены, коэффициенты, наценки, таблицы ставок, лимиты,
пороги — НЕ зашивается константой в бизнес-логику. Оно живёт в настройках
кампании (`campaigns.settings`) и читается через parse-хелпер с дефолтами.

Канонический паттерн уже в коде: `parseItemDefaultPrices` /
`parseItemPurchasePolicy` (`lib/item-default-prices.ts`,
`lib/item-purchase-policy.ts`) — jsonb из `campaigns.settings`, парсер
подставляет дефолты при отсутствии. Новые механики (крафт и далее) делают
так же: значения из спек/таблиц Andrey = **дефолты парсера**, не константы.
UI правки настроек — по мере надобности; минимум — значение читается из
settings и имеет дефолт.

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

For actions that accept node IDs (character, session, item, stash), verify
that every referenced node belongs to the selected campaign before writing.
All campaign members may act for every character in that campaign;
`node_pc_owners` is roster metadata, not an authorisation boundary.

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

## Shipping (spec-043)

`main` deploys to prod and accepts **Pull Requests only** (GitHub ruleset).
The loop:

1. Branch off `main`, build the thing.
2. Want to click around first? Merge your branch into `staging` — it
   auto-deploys to https://staging.theloopers.org (own DB: a disposable
   snapshot of prod; breaking staging is fine, that's what it's for).
3. Open a PR of your **feature branch** into `main`. Green gate → merge.
   Never merge the `staging` branch itself into anything.
4. `staging` drifted or broke? Anyone:
   `git fetch && git checkout staging && git reset --hard origin/main &&
   git push --force-with-lease origin staging`

Migrations: apply your feature's migration to the staging DB by hand when
you test there; the prod migration flow is unchanged. Refresh button and
details: `infra/staging-runbook.md`.

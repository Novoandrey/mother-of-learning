# Implementation Plan — Telegram Auth + Character Card v0 (spec-046)

**Status**: Plan draft — awaiting Tasks (chat 96)
**Spec**: `spec.md` (Clarify done) · **Epic**: `.specify/epics/rpg-engine/constitution.md` (first ship)

## Approach (one line)

Walking skeleton: a client-side Telegram Mini App reads `initData` → a Next.js
route handler validates the HMAC and mints a Supabase-compatible JWT
(`sub` = linked `auth.users.id`) → supabase-js uses it via the **`accessToken`**
option → RLS-scoped read of the caller's `character` nodes → a read-only card
with the primary portrait served from a public Cloudflare R2 bucket. Linking is
DM-driven (an admin view writes `user_profiles.telegram_id`). No GoTrue session
hacking, no upload, no engine.

## Key technical decisions

- **Custom JWT via the `accessToken` option** (supabase-js 2.103), NOT GoTrue
  sessions / `@supabase/ssr` cookies. A self-minted JWT has no GoTrue refresh
  token, and the ssr cookie format (`sb-…-auth-token` = access+refresh) would
  trigger a failing refresh. `accessToken: async () => jwt` sidesteps both:
  supabase-js disables its own auth and uses our token for every request. JWT is
  short-lived (~1h) and re-minted on each Mini App open (initData is always
  fresh on open), so no refresh path is needed.
  - *Rejected for v0:* SSR + httpOnly cookie + per-request bearer client. More
    secure (token off the browser) but more moving parts + the ssr-cookie
    caveat. Revisit when the Mini App needs writes.
- **initData validation**: HMAC-SHA256.
  `secret_key = HMAC_SHA256("WebAppData", bot_token)`;
  `HMAC_SHA256(data_check_string, secret_key) == hash`; reject if `auth_date`
  older than the freshness window (~1h). `node:crypto` / Web Crypto — no lib.
  *(Confirm exact field handling against Telegram's current docs at Implement.)*
- **JWT mint**: `jose` (HS256, signed with `JWT_SECRET`). Claims:
  `sub` = `auth.users.id`, `role: 'authenticated'`, `aud: 'authenticated'`,
  `iat`, `exp`. These make PostgREST treat the request as authenticated and make
  `auth.uid()` return `sub`, so the existing RLS (024 + ~10 policy migrations)
  keeps working **unchanged** — this is the whole point of FR-002.
- **The mint endpoint is an auth endpoint** — initData HMAC *is* the
  authentication; treat it with login-level care. It performs only a lookup
  (`telegram_id` → user) via a service read, not a write.
- **R2 read-side only**: public-read bucket + custom domain; the client builds
  `URL = ${NEXT_PUBLIC_R2_PORTRAIT_BASE}/${r2_key}`. No R2 SDK, no signing. A
  static placeholder asset covers PCs without a portrait.
- **Player Mini App = mobile-first** (epic E10; Tailwind media queries, no
  `useIsMobile`); **DM mapping view = desktop** (AGENTS.md desktop-primary).

## Data model (migrations — applied by Andrey: Studio on prod, by hand on staging)

- **M1 `NNN_user_profiles_telegram_id.sql`** —
  `alter table user_profiles add column if not exists telegram_id bigint unique;`
  (+ comment). `bigint` (Telegram ids exceed 32-bit); `unique` → 1:1 (C-05). No
  new read policy: the mint looks up via a service read; self-read is covered by
  the existing `user_profiles` policy. Ends with a verification `SELECT`.
- **M2 `NNN_character_portraits.sql`** —
  ```sql
  create table if not exists character_portraits (
    id                uuid primary key default gen_random_uuid(),
    character_node_id uuid not null references nodes(id) on delete cascade,
    r2_key            text not null,
    is_primary        boolean not null default false,
    created_at        timestamptz default now()
  );
  -- index by node; one primary per node (partial unique on is_primary);
  -- RLS: enable; SELECT for campaign members (R6 transparency — mirror the
  --      existing node-read policy); NO client write (seed via service role).
  ```
  Ends with a verification `SELECT`. Idempotent (`IF NOT EXISTS` /
  `ON CONFLICT`), wrapped `BEGIN;`/`COMMIT;`.
- Both: call `present_files` after creation (project rule). Neither touches
  `nodes`/`node_types` → **no sidebar invalidation** (AGENTS.md).

## Components / artifacts (create · change)

- `app/tg/page.tsx` (client) — Mini App shell: load the Telegram WebApp SDK
  (script tag or `@twa-dev/sdk`), read `initData` + `themeParams`, run the auth
  flow, render states (loading · unlinked · my-characters list · card).
  Mobile-first; theme tokens reused from `design.md` 022 (FR-008).
- `app/api/tg/auth/route.ts` — POST: validate initData → look up `telegram_id`
  → `{ jwt }` or `{ unlinked, telegram_id, username }`.
- `lib/telegram/init-data.ts` — pure: parse + HMAC-validate. Unit-tested.
- `lib/telegram/mint.ts` — pure: build + sign the Supabase JWT (jose).
  Unit-tested.
- `lib/supabase/tg-client.ts` — browser client created with
  `accessToken: () => jwt`.
- `lib/queries/my-characters.ts` — read `character` nodes where
  `owner_user_id = auth.uid()`, join the primary portrait. RLS-scoped.
- DM mapping view (`app/.../telegram-links/`) + `app/actions/telegram-links.ts`
  with `linkTelegramAction` — owner/dm-gated (`getMembership`), writes
  `user_profiles.telegram_id` via the admin client. Desktop.
- portrait placeholder asset in `public/`.
- deps: `jose` (+ optionally `@twa-dev/sdk`).

## Linking flow (C-01 → б; leanest, no pending table)

1. Unlinked Telegram opens the Mini App → mint route returns
   `{ unlinked, telegram_id, username }` → the screen shows the id/@handle and
   "send this to the DM in the campaign chat".
2. Player relays the id (the campaign Telegram they already live in). The DM
   opens the mapping view → enters the `telegram_id` + picks the account →
   `linkTelegramAction` writes `user_profiles.telegram_id`.
3. Player reopens → linked → card.
- *Pending-queue UX (recording unlinked opens so the DM sees a list) is deferred
  to the next spec with upload — the relay keeps v0 thin.*

## Config & secrets

- `TELEGRAM_BOT_TOKEN` — server-only (initData HMAC). Dokploy env + staging
  secret. Never in repo.
- `SUPABASE_JWT_SECRET` — server-only; **= the Supabase stack's `JWT_SECRET`**
  (confirmed in the 024 compose: `GOTRUE_JWT_SECRET` / `PGRST_JWT_SECRET` =
  `${JWT_SECRET}`). ⚠️ **Operator dep**: expose that value to the Next app env.
  Staging: the cloud project's JWT Secret (Dashboard → Settings → API).
- `NEXT_PUBLIC_R2_PORTRAIT_BASE` — public bucket base / custom domain.
  🔴 must also go into Dokploy **Build-time Arguments** (NEXT_PUBLIC inlining,
  per `infra/staging-runbook.md`).

## Operator tasks (🌐 / 🐧 — Andrey)

- BotFather: dedicated bot + Mini App / WebApp URL → `…/tg` (staging first, then
  prod).
- Cloudflare R2: create the public-read portraits bucket + custom domain; set
  `NEXT_PUBLIC_R2_PORTRAIT_BASE`.
- Expose `JWT_SECRET` to the app env as `SUPABASE_JWT_SECRET`; add
  `TELEGRAM_BOT_TOKEN`.
- Apply M1 + M2 to staging by hand for testing; prod via Studio.
- Seed-load portraits (Google Drive → R2 + insert primary `character_portraits`
  rows) — **I'll script this at Implement** (rclone / S3 API + a name-match
  insert; portraits are on Drive, I have Drive access).

## Order (dependency spine for Tasks)

P0 Schema (M1, M2) → P1 Identity core (init-data · mint · route · tg-client ·
unit tests) → P2 DM mapping (view + action) → P3 Mini App shell + my-characters
+ card + R2 render + placeholder → P4 Operator/seed (bot · bucket · secrets ·
seed script) → P5 Staging E2E (SC-001/002/006).
- P1 is unit-testable without infra. P3 needs P0+P1. P5 needs the operator
  pieces (P4) on staging.

## Testing

- Vitest: init-data validation (valid / expired / forged), mint claims, lookup.
  `npm run build` hangs in the sandbox → rely on `lint` + `typecheck` +
  `vitest`; the CI gate is authoritative.
- Staging E2E: open from bot → unlinked → DM binds → reopen seamless (SC-001);
  `auth.uid()` == web account id (SC-002); portrait renders real/placeholder
  (SC-006).

## Constitution / AGENTS compliance

- Next.js 16: **read `node_modules/next/dist/docs/` before route-handler code**
  (AGENTS caveat).
- Auth gating: `linkTelegramAction` gated (owner/dm). Mint route = initData
  HMAC. my-characters = RLS via the minted JWT.
- No sidebar invalidation (neither new object is a sidebar table).
- Hand-rolled validators (no zod); named exports for server components, default
  for client components.
- Consult the `supabase` skill (custom JWT / `accessToken` / RLS) at Implement.
- Shipping: app code via `claude/<slug>` branch → (staging) → PR into `main`;
  migrations by hand on staging, Studio on prod.

## Open Plan decisions (confirm / default)

- Auth architecture: **A — client-side `accessToken`** ← recommend.
  (B = SSR cookie, rejected for v0.)
- Mini App route: **`/tg`** ← recommend.
- JWT exp: **~1h, re-mint on open** ← recommend.
- ⚠️ `SUPABASE_JWT_SECRET` exposure — needs your confirmation the box's
  `JWT_SECRET` can be provided to the app env (and the staging equivalent).

## Quality gate (Plan → Tasks)

Defaults above accepted/adjusted · `JWT_SECRET` exposure confirmed → break into
`tasks.md`.

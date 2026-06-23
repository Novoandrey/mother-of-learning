# Tasks — Telegram Auth + Character Card v0 (spec-046)

Derived from `plan.md`. Markers: 🤖 Claude · 🧑 Andrey (operator) · 🌐 dashboard.
Migrations land in `mat-ucheniya/supabase/migrations/` (next free = **115, 116**).
**During Implement: one task at a time — `[x]` + brief report + wait before the
next** (project rule). After any `.sql` → `present_files`.

## Phase 0 — Schema
- [x] **T001** 🤖 Write `115_user_profiles_telegram_id.sql`: `add column if not
  exists telegram_id bigint unique` + comment; `BEGIN;`/`COMMIT;`; verification
  `SELECT`. → `present_files`.
- [x] **T002** 🤖 Write `116_character_portraits.sql`: table (`id`,
  `character_node_id` FK→`nodes` on delete cascade, `r2_key`, `is_primary`,
  `created_at`); index by node; partial unique (one primary per node); enable
  RLS + SELECT-for-campaign-members policy (mirror the node-read policy; R6);
  no client write; verification `SELECT`. → `present_files`.
- [x] **T003** 🧑 Apply 115 + 116 to staging by hand (prod via Studio at ship).
  [needs T001, T002]

## Phase 1 — Identity core (unit-testable, no infra)
- [x] **T004** 🤖 Add dep `jose` (+ `@twa-dev/sdk` if the shell uses it).
- [x] **T005** 🤖 `lib/telegram/init-data.ts` — pure: parse + HMAC-SHA256
  validate (`secret_key = HMAC("WebAppData", bot_token)`; check `hash`; reject
  stale `auth_date`). Confirm field handling against Telegram docs.
- [x] **T006** 🤖 Vitest for T005 (valid / expired / forged / missing hash).
- [x] **T007** 🤖 `lib/telegram/mint.ts` — pure: sign the Supabase JWT (jose
  HS256, `SUPABASE_JWT_SECRET`; claims `sub`, `role:'authenticated'`,
  `aud:'authenticated'`, `iat`, `exp` ~1h).
- [x] **T008** 🤖 Vitest for T007 (claims + signature verifiable with secret).
- [x] **T009** 🤖 `app/api/tg/auth/route.ts` — POST: validate (T005) → look up
  `telegram_id`→user (service read) → mint (T007) → `{ jwt }` or
  `{ unlinked, telegram_id, username }`. Next 16: read route-handler docs first.
  [needs T001, T005, T007]
- [x] **T010** 🤖 `lib/supabase/tg-client.ts` — browser client with
  `accessToken: () => jwt`.
- [x] **T011** 🤖 `lib/queries/my-characters.ts` — RLS read: `character` nodes
  where `owner_user_id = auth.uid()`, join the primary portrait. [needs T002]

## Phase 2 — DM mapping (desktop, gated)
- [x] **T012** 🤖 `app/actions/telegram-links.ts` — `linkTelegramAction(
  campaignId, telegramId, userId)`: gate `getMembership` owner/dm; hand-rolled
  validation (numeric id, not already linked); admin update
  `user_profiles.telegram_id`. [needs T001]
- [x] **T013** 🤖 Mapping view (desktop page): form `telegram_id` + account
  picker (campaign members) → `linkTelegramAction`. Gated. [needs T012]

## Phase 3 — Mini App + card (mobile-first)
- [x] **T014** 🤖 `app/tg/page.tsx` shell: load the Telegram WebApp SDK, read
  `initData` + `themeParams`, run the auth flow (POST T009 → configure T010),
  state machine (loading / unlinked / list / card). [needs T009, T010]
- [x] **T015** 🤖 Unlinked screen: show `telegram_id` + @handle + "send to DM"
  copy. [part of T014]
- [x] **T016** 🤖 My-characters (0 → empty state · 1 → straight to card · >1 →
  list) + card v0: name + primary portrait (R2 URL, placeholder fallback),
  read-only. [needs T011, T014]
- [x] **T017** 🤖 Placeholder asset in `public/` + portrait URL builder
  (`NEXT_PUBLIC_R2_PORTRAIT_BASE` + `r2_key`).
- [x] **T018** 🤖 Reuse `design.md` 022 tokens / dark theme; map Telegram theme
  params.

## Phase 4 — Operator / seed
- [x] **T019** 🧑 BotFather: dedicated bot + Mini App / WebApp URL → staging
  `…/tg`.
- [x] **T020** 🧑 🌐 Cloudflare R2: public-read portraits bucket + custom domain;
  set `NEXT_PUBLIC_R2_PORTRAIT_BASE` (+ Dokploy Build-time Arguments).
- [x] **T021** 🧑 Env: expose the box `JWT_SECRET` → app as
  `SUPABASE_JWT_SECRET`; add `TELEGRAM_BOT_TOKEN` (box + staging).
  ⚠️ Plan decision #4 — unblocks the mint path.
- [x] **T022** 🤖 Seed script: Drive → R2 (rclone / S3) + insert primary
  `character_portraits` rows (name-match Drive files → character nodes).
  [needs T002, T020]
- [x] **T023** 🧑 Run T022 (load images + rows).

## Phase 5 — Staging E2E + ship
- [x] **T024** 🧑 Deploy to staging (feature branch → `staging`); apply 115 + 116
  to staging.
- [x] **T025** 🧑 E2E on staging: open from bot → unlinked → DM binds (T013) →
  reopen seamless (SC-001); `auth.uid()` == web account id (SC-002); portrait
  real/placeholder (SC-006).
- [x] **T026** 🤖 Open PR of the feature branch → `main` (human merges).
  Moot — 046's content rode in **spec-044 PR #4** (branch fully contained in main).

## Sequencing
P0 → P1 (core, testable now) → P2 / P3 (need P0 + P1) → P4 operator (T022 needs
T020) → P5. The mint path is unblocked only once **T021** (`SUPABASE_JWT_SECRET`)
lands. T003 / T024 (staging migrations) gate the E2E.

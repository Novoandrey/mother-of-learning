# Feature Specification: Telegram Auth + Character Card v0

**Feature Branch**: `046-telegram-auth-pc-card`
**Created**: 2026-06-20 (chat 96)
**Status**: Tasks — ready for Implement (chat 96)
**Input**: Andrey (chat 96): «давай сделаем первый слой — открыть и увидеть
мобильный вид карточки своего персонажа с портретом и именем и залогиниться
телегой связанной с твоим аккаунтом в theloopers».
**Epic**: `.specify/epics/rpg-engine/constitution.md` — **new first ship**;
governed by E1 (UX-first), E4 (transparency, read side), E10 (mobile first,
ship = measure). Engine principles E2/E3/E6/E7/E8/E9/E11 do **not** apply
(read-only, no modules, no realtime in v0). The identity half is **infra** in
the lineage of specs 006/024 (Supabase Auth), not engine.
**Depends on**: 024 (auth keyed to `auth.users`); node type `character` +
`nodes.owner_user_id` (006/028/030); `design.md` 022 (tokens, dark theme).
A dedicated Telegram bot with a WebApp URL via BotFather — **Andrey action**.
**Does NOT depend on**: 045 engine · 044 ledger · DEBT-011 realtime · the full
sheet (022).
**New operator dependency**: a Cloudflare R2 bucket for portraits (R2 is
already used for backups — this is a new bucket + creds). **Supersedes**
spec-030's portrait-storage scope: 046 becomes the first R2 portrait consumer;
030 reduces to art pipeline / any richer upload UX.

## Context

Walking skeleton for the Telegram-first direction (chat 96 decision): the
thinnest end-to-end path that exercises every layer of the stack —
Telegram `initData` → minted JWT → Supabase Auth (`auth.users`) → fetch the
caller's PCs → mobile render. Per chat-90 live data, 0/31 sheets were edited
in a month: the product surface is dead because a separate, password-gated
site is not where players are. This slice meets them **inside Telegram**
(zero-install, no password) and proves the identity pipe on staging.

It also takes over the **auth/shell pathfinder** role 044 was carrying: the
shared mobile entry is now a Telegram Mini App (WebApp), not an installable
PWA, and the mobile session is Telegram-minted, not password login. 044
(ledger) and 022 (sheet) then ride this de-risked shell + auth instead of each
rebuilding install + auth + layout.

Carries **no business logic** and no schema beyond the telegram↔account
mapping. **Read-only by design** — the point is "I opened it and saw my
character," not editing.

## Scope

**In**: validate Telegram `initData`; mint a Supabase-compatible JWT bound to
an existing theloopers account; first-time linking `telegram_id ↔ auth.users`;
Telegram Mini App shell served by the existing Next.js; read-only character
card v0 (name + portrait); a "my characters" list when the caller owns more
than one PC; password login retained behind a flag; **portrait storage on
Cloudflare R2** — `character_portraits` (one-to-many) schema + read-side wiring
+ render the **primary** portrait (placeholder fallback); a minimal **DM/admin
account-mapping view** (the C-01 → б linking mechanism).

**Out**: editing anything; the engine (045); ledger (044); realtime
(DEBT-011); **portrait upload, carousel of past portraits, and per-portrait
metadata (loop / inspiration / description)** — the explicit next spec (Andrey:
«кнопка загрузить — буквально следующая фича»); bulk art production /
moderation; the full sheet — statblocks, skills, dice (022).

## User Scenarios & Testing

### User Story 1 — Open my character from Telegram (Priority: P1)
A linked player taps the Mini App in the bot, lands inside without a password,
and sees their character card (name + portrait placeholder). If they own
several PCs they get a short "my characters" list and tap one.
**Acceptance**: open → (list →) card; no password; ≤ 2 taps to a card.

### User Story 2 — First-time account linking (Priority: P1)
A player whose Telegram is not yet linked is shown a "link your account" step
and establishes the link once (mechanism = C-01). Subsequent opens are
seamless (US1). **Acceptance**: link completes once; the second open skips it.

### User Story 3 — Identity preserves existing access (Priority: P1)
Inside the Mini App, `auth.uid()` equals the player's existing web account id,
so RLS and server-action gates behave identically to the web app.
**Acceptance**: the same owner resolves under the Telegram session and the web
session for the same player.

### User Story 4 — Password login still works (Priority: P2)
Web Supabase login is not removed; it stays behind a dev/admin flag for
fallback. **Acceptance**: an admin can still log in with a password on the web.

### Edge Cases
- Telegram user with no theloopers account → C-02 (refuse vs. create).
- `initData` expired or forged → reject, no session.
- Player owns 0 PCs → empty state, not an error.
- Player owns a shared PC (Зак) → appears in the list (ownership model = C-05).
- Reopen after the Telegram session sleeps → re-validate, no re-link.

## Requirements

### Identity (infra)
- **FR-001**: Validate Telegram `initData` (HMAC-SHA256 keyed by the bot token;
  check `auth_date` freshness). Invalid → no session.
- **FR-002**: Mint a Supabase-compatible JWT whose `sub` = `auth.users.id` of
  the linked theloopers account — **never `telegram_id` directly** (RLS and
  gates key on `auth.users`). Sign with the Supabase JWT secret.
- **FR-003**: First-time linking `telegram_id → auth.users` (mechanism C-01);
  persist the mapping (storage = C-05).
- **FR-004**: The bot token is a server secret (route-handler env + staging
  secrets), never committed to the repo.
- **FR-005**: Minting is a **Next.js route handler**, not a Supabase Edge
  Function — `supabase/functions/` is absent; do not stand up edge-runtime.
- **FR-006**: Password login retained behind a flag (C-04).
- **FR-006a** (C-01 → б): a minimal **DM/admin mapping view** — lists Telegram
  users who opened the Mini App but have no linked account, and binds each to an
  existing theloopers `auth.users`. This is the linking mechanism; no self-serve
  code / deep-link in v0.

### Shell
- **FR-007**: Telegram Mini App shell (WebApp SDK, Telegram theme), served by
  the existing Next.js app on theloopers, behind the Telegram-JWT entry.
  Dedicated bot + WebApp URL via BotFather.
- **FR-008**: Reuse design tokens / dark theme from `design.md` 022.

### Character card v0
- **FR-009**: "My characters" = nodes of type `character` where
  `owner_user_id` = caller. 0 → empty state; 1 → card directly; >1 → list.
- **FR-010**: Card renders **read-only**: name + the PC's **primary** portrait —
  the real image from Cloudflare R2 when one exists, **placeholder** fallback
  otherwise. Fields beyond name = C-03 (deferred).
- **FR-010a**: Portrait schema = a **`character_portraits` table** (one-to-many:
  `character_node_id`, `r2_key`, primary flag / `created_at`) — not a single
  column — so the next feature (carousel + per-portrait metadata) needs no
  migration. v0 reads only the primary row. R2 is read-side only: serve/fetch
  from a public-read bucket, app builds the URL from `r2_key` + bucket base. No
  write / upload path in v0.
- **FR-011**: Transparency (E4): reads only; **no edit affordance** in v0.

### System qualities
- **FR-012**: Server reads auth-gated per `AGENTS.md` (resolveAuth /
  getMembership). Mobile-first per Constitution VI.

## Key Entities
- **telegram_link**: mapping `telegram_id ↔ auth.users.id` (field on
  `user_profiles`, or its own table — C-05).
- **character node**: existing; `owner_user_id` identifies "mine".
- *(No new business entities. No portrait entity — deferred to 030.)*

## Open Questions (Clarify phase)
- **C-01 (critical)** — first-link mechanism: (a) one-time code generated in
  the web app under the logged-in account, entered in the Mini App; (b) DM /
  owner sets the mapping in an admin view; (c) signed deep-link token from web.
- **C-02** — telegram user with no theloopers account: refuse ("get an account
  first") or let the Mini App create an `auth.users`? (~20 known players ⇒
  likely link-to-existing only.)
- **C-03** — card v0 fields: name + portrait only, or also identifiers
  (race / class / level)? Which fields on the `character` node hold them?
- **C-04** — password-login flag: env? role? separate `/admin` path? Visible to
  ordinary players at all?
- **C-05** — mapping storage: `telegram_id` on `user_profiles` (1:1) or its own
  table (future 1:many)?
- **C-06 (portraits)** — ingest + privacy: (i) who puts portraits in — player
  self-upload (write path, breaks read-only), DM/admin upload, or operator
  seed/bulk-load; (ii) bucket — public-read R2 + public URL (no signed-URL
  machinery; portraits aren't secret) vs. private + signed URLs; (iii) field on
  `character` node — `portrait_key` (R2 object key) vs. full `portrait_url`.

## Clarifications (chat 96)

- **C-01 → (б) DM/admin manual mapping.** First open of an unlinked Telegram
  user shows their `telegram_id` / @handle and an "ask the DM to link you"
  message. The DM binds it to an existing theloopers account in a minimal admin
  view (lists unlinked Telegram users → pick account). Reopen → linked,
  seamless. No self-serve code / deep-link in v0.
- **C-02 → refuse; link-to-existing only.** No `auth.users` creation from the
  Mini App. Unlinked Telegram user with no account → "ask the DM".
- **C-03 → name + portrait only** for v0. Race / class / level deferred to the
  fuller card.
- **C-04 → env flag.** Web password login stays as-is (dev / admin fallback);
  the Mini App is Telegram-only; no password UI shown to players; no new flag
  UI built.
- **C-05 → `telegram_id` column on `user_profiles` (unique, 1:1)** for linked
  users. Enumerating pending (unlinked) Telegram users for the admin view is a
  Plan-level implementation detail (pending record vs. derived).
- **C-06 → portraits: admin/operator seed ingest · public-read R2 · key-based ·
  one-to-many schema.** Schema is a **`character_portraits` table**
  (`character_node_id`, `r2_key`, primary flag / `created_at`), NOT a single
  column — this fits the stated next feature (carousel of all past portraits +
  per-portrait metadata: which loop, what inspired it, …) so the operator seed
  lands in the final structure and the next spec adds UI only, no migration.
  Bucket is public-read (portraits aren't secret → no signed-URL machinery);
  the app builds the URL from `r2_key` + bucket base. **v0 renders the primary
  portrait read-only.** **Upload button + carousel + per-portrait metadata =
  the explicit next spec** (Andrey: «кнопка загрузить — буквально следующая
  фича»). Operator seed-load (Google Drive → R2 → insert primary rows) is an
  operator task in the plan.

## Success Criteria

### Measurable Outcomes
- **SC-001**: On staging, a player opens the Mini App from the bot, links once,
  and on reopen lands inside without a password.
- **SC-002**: `auth.uid()` inside the Mini App session == the player's web
  account id (RLS / gates intact — the same owner resolves under both sessions).
- **SC-003**: The player sees their PC card(s) (name + placeholder portrait);
  ≤ 2 taps from open to a card.
- **SC-004**: Web password login still works behind the flag.
- **SC-005**: Zero new business logic / schema beyond the telegram↔account
  mapping and the portrait field (review check).
- **SC-006**: A PC with a portrait in R2 shows the real image on the card; a PC
  without one shows the placeholder (no broken image).

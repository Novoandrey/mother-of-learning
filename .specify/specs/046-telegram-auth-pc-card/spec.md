# Feature Specification: Telegram Auth + Character Card v0

**Feature Branch**: `046-telegram-auth-pc-card`
**Created**: 2026-06-20 (chat 96)
**Status**: Clarify — in progress (chat 96; portraits/R2 folded into scope)
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
Cloudflare R2** — schema + read-side wiring + render real-or-placeholder
(ingest shape → C-06).

**Out**: editing anything; the engine (045); ledger (044); realtime
(DEBT-011); **player self-upload of portraits** (write feature — deferred to a
later increment); bulk art production / moderation; the full sheet —
statblocks, skills, dice (022).

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

### Shell
- **FR-007**: Telegram Mini App shell (WebApp SDK, Telegram theme), served by
  the existing Next.js app on theloopers, behind the Telegram-JWT entry.
  Dedicated bot + WebApp URL via BotFather.
- **FR-008**: Reuse design tokens / dark theme from `design.md` 022.

### Character card v0
- **FR-009**: "My characters" = nodes of type `character` where
  `owner_user_id` = caller. 0 → empty state; 1 → card directly; >1 → list.
- **FR-010**: Card renders **read-only**: name + portrait — the real image
  from Cloudflare R2 when the node has one, **placeholder** fallback otherwise.
  Portrait ingest path + bucket privacy = C-06. Fields beyond name = C-03.
- **FR-010a**: Portrait schema = a field on the `character` node (`portrait_key`
  or `portrait_url` — C-06); R2 wiring is read-side only in v0 (serve/fetch),
  no write/upload path.
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

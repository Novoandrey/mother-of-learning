# Chat 98 — spec-044 + spec-046 production cutover, realtime live, WAL monitor

**Date:** 2026-06-23
**Specs:** 044 (Mobile Ledger), 046 (Telegram Auth + PC Card) — both shipped to prod.
**Next:** spec-052 (Inventory) → Clarify.

## What shipped to prod

- **PR #4** (`claude/044-mobile-ledger`) merged → carried 044 (P0–P3 ledger Mini
  App) **and** 046's substance (real GoTrue auth route, telegram_id mig 115,
  portraits mig 116 + seed script, DM-link `/c/<slug>/settings/telegram`, PC
  card in `/tg`). The 046 branch is fully contained in main — no separate PR
  (T026 moot).
- **PR #5** (`claude/044-realtime-client`) merged → T023 realtime client: `/tg`
  subscribes to private `campaign:<id>` channel, re-fetches affected screens on
  `tx_insert` broadcast (refreshKey prop, no remount).
- **Operator cutover** (Andrey): env (`TELEGRAM_BOT_TOKEN` + build-arg
  `NEXT_PUBLIC_R2_PORTRAIT_BASE`), migrations 115/116/117 via Studio tunnel, bot
  Menu Button → `/tg`, 31 portraits seeded.

## DEBT-011 closed (realtime re-enabled)

- Self-hosted stack is plain compose at `/home/andrey/supabase/docker` (overrides
  `compose-override.kong.yml`, `compose-override.db-loopback.yml`), pinned to an
  upstream era → matching `supabase/realtime:v2.76.5`. Service block added
  (env from existing `.env`, `API_JWT_SECRET=${JWT_SECRET}`, healthcheck on
  `:4000/api/tenants/realtime-dev/health`), `docker compose up -d realtime` →
  healthy. Rides kong `/realtime/v1/` (no new Traefik router).
- Migration 117: trigger on `transactions` → `realtime.send` to private
  `campaign:<id>` + RLS on `realtime.messages`. Applied prod (and staging).

## T021 — WAL replication-slot monitor

- `infra/wal-slot-monitor.sh`: read-only check of each logical slot's retained
  WAL, Telegram alert (same MrBranches bot/topic) over THRESHOLD_MB (default
  500), cooldown stamp. Never drops a slot.
- **Bug found:** `docker compose exec` takes the **service name `db`**, not the
  `container_name` `supabase-db` → "service supabase-db is not running". Fixed
  (PG_SERVICE=db). Runs as the stack's Docker user (andrey), env file
  `/opt/infra/wal-monitor.env` chown'd to andrey, cron in andrey's crontab,
  log to home. TG secrets: `TG_CHAT_ID=-1002576013907`, `TG_THREAD_ID=17119`
  (from the topic link), token from BotFather. Smoke-test → `TG response: 200`.

## Prod-use feedback → spec-052

Recorded into `052-inventory-containers-sets/spec.md`:
1. Player wants to see their own **pending заявки** (moves/buys awaiting DM) in
   the Mini App and cancel them → FR-015, C-11.
2. **Quantity** must be first-class everywhere items appear (20 arrows, 5
   rations) → FR-016, C-12 (does 044's item-transaction carry a qty delta, or is
   a migration needed?). 052 already had qty in moves/buy/sets/display.

## Open / next chat

- **BUG-TG-DESKTOP** (backlog): a player added + working on mobile gets "Ты пока
  не в кампании" on **Telegram Desktop**. telegram_id is linked correctly
  (screenshots matched). Same class as the mobile cookie bug — desktop's session
  isn't applied for the RLS read (`getMyCampaign` → null). Hypothesis: cached old
  webview build on Desktop. Step 1: full Telegram Desktop restart. If it
  persists: add `no-cache`/`dynamic` on `/tg` + a temporary debug readout of the
  received telegram_id and whether a session was minted.
- **spec-052 → Clarify** (C-01..C-12). Key: C-01 (purchase approval auto vs
  DM-queue + gold source), C-11 (cancel-own-request), C-12 (item qty data model).
- **Version:** 044 + 046 are live but the prod label is still v1.0.0 — bump +
  CHANGELOG entry if cutting a release tag (Andrey's call).

## Config note

Asked whether prod is really on prod settings: yes. A wrong Supabase URL /
service role would break **all** users; a wrong bot token would fail initData
validation for everyone. Most users work on prod data → config is prod. The
single-user desktop issue is per-user, not config.

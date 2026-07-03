# Tasks: Ledger Master Message (spec-054-A)

Small assembly on top of spec-053. No migration. Branch
`claude/spec-054-ledger-master` off `origin/main`.

## Build

- [ ] **T001** Export `esc` + `zm` (money formatter) from
  `lib/telegram/ledger-format.ts` so the master renderer reuses them (no
  duplicated pure helpers).
- [ ] **T002** `lib/telegram/ledger-master-format.ts` (PURE): `MasterState`
  type; `renderMasterMessageHtml(state)` — dashboard (loop + общак + per-PC
  money) + `<blockquote expandable>` feed tail; `formatRecentLine(row)`; ≤4096
  clamp with truncation marker (FR-001, FR-007, FR-009).
- [ ] **T003** `lib/telegram/ledger-master.ts` (impure, admin client):
  - `composeMasterState(admin, campaignId)` — loop (number+title), campaign PCs,
    `getAllBalancesTg`, recent campaign tx (current loop, newest-first) → state.
  - `getMasterMessageId` / `setMasterMessageId` — read + RMW-merge into
    `campaigns.settings.ledger_master_message_id` (FR-004).
  - `refreshMasterMessage(admin, campaignId, { mint })` — mint → post+store;
    else edit stored id; no id → bootstrap post+store; edit fails → repost+store
    (FR-002, FR-003, FR-005, FR-006). Never throws.
- [ ] **T004** Hook into `lib/telegram/ledger-feed.ts`: inside the existing
  `after()`, after `sendLedgerMessage`, call
  `refreshMasterMessage(admin, event.campaignId,
  { mint: event.type === 'loop-started' })`, wrapped in its own try/catch.

## Verify

- [ ] **T005** Unit tests `lib/telegram/__tests__/ledger-master-format.test.ts`:
  dashboard shape (money only, no items), collapsible feed, empty campaign,
  4096 clamp drops oldest + marks truncation, HTML-escaping of PC/item names.
- [ ] **T006** `pnpm typecheck` + `pnpm test` green.
- [ ] **T007** Manual note: on staging (feed unconfigured) the path is a no-op;
  live pin/rotate walkthrough is a prod tail (needs `TG_LEDGER_*`).

## Ship

- [ ] **T008** Update root `NEXT.md` (+ "spec-053 в проде" line) — rides with
  this PR, not a standalone docs-only PR (gate gotcha).
- [ ] **T009** PR feature branch → `main` (green gate → merge). **Andrey's
  explicit yes required before push/PR.**

## Deferred (this spec)

- Rich Messages renderer — after live verification of 4096 / all-bots /
  client-degradation.
- Edit debounce — only if a batch op fans out many events.
- Optional DM "post/refresh master now" button — bootstrap-on-next-event covers
  it for v1.

# Tasks — Mobile Ledger (spec-044)

Derived from `plan.md`. Markers: 🤖 Claude · 🧑 Andrey (operator) · 🌐 dashboard.
Assumes **spec-046 is on `main`** (it is) — 044 reuses its `/tg` shell,
`lib/telegram/mint`, `tg-client`, `jose`. Next free migration = **117**.
**During Implement: one task at a time — `[x]` + brief report + wait before the
next** (project rule). After any `.sql` → `present_files`.
App code (`mat-ucheniya/**` except `*.md`) ships `claude/044-mobile-ledger` →
staging hand-test → **PR into `main`** (never direct).

## Phase 0 — Auth adapter (path B, unit-testable, no infra)
- [x] **T001** 🤖 `lib/telegram/verify.ts` — pure: verify a minted JWT (jose
  HS256, `SUPABASE_JWT_SECRET`; check `exp`, `aud`/`role`) → `{ userId } | null`.
  Mirror of 046's mint claims; no new trust path.
- [x] **T002** 🤖 Vitest for T001 (valid / expired / forged / wrong-secret).
- [x] **T003** 🤖 `lib/auth.ts` — add `getMembershipFor(userId, campaignId)`,
  the cookie-free counterpart to `getMembership`. Cookie path untouched.
- [x] **T004** 🤖 `app/actions/transactions.ts` — refactor internal
  `resolveAuth(campaignId)` → `resolveAuth(campaignId, opts?: { tgToken? })`:
  if `tgToken`, verify (T001) → `userId` → `getMembershipFor` (T003); else the
  existing cookie path. Additive signature — every existing call site keeps
  working. [needs T001, T003]
- [x] **T005** 🤖 Vitest: `resolveAuth` token path (membership resolved;
  forged/expired rejected; cookie path regression-safe). [needs T004]
  > Done as **T002 coverage** (the verify boundary — valid/expired/wrong-secret/
  > wrong-aud/wrong-role/no-sub/tampered/empty). `resolveAuth`'s glue is
  > DB-touching (getMembershipFor / getCurrentUser, server-only imports) and
  > isn't unit-tested in this repo's harness — same as `getMembership`; verified
  > by typecheck + staging E2E. No server-mock harness added (scope).

## Phase 1a — Shell additions (044 owns them; 046 ships minimal)
- [x] **T006** 🤖 `lib/queries/campaign-characters.ts` —
  `getCampaignCharacters(campaignId, userId)`: all `character` nodes in the
  campaign, each tagged `isOwn`, own PCs ordered first; join primary portrait.
- [x] **T007** 🤖 ⚠️ **First check (PL-4/risk #1)**: confirm RLS grants
  **member-wide `SELECT`** on `transactions` (and node/portrait reads) under the
  minted JWT — needed for E4 foreign reads + the realtime channel. If it is
  own-PC-only today, widen via a migration (renumber 117→118 if so). Record the
  finding before building reads.
  > **Finding (2026-06-23):** `tx_select` is already
  > `using (is_member(campaign_id))` — **member-wide SELECT in place**. Foreign
  > ledger reads work under the minted JWT; the realtime channel RLS mirrors the
  > same `is_member`. **No widening migration needed** — 044 has only mig 117.
- [x] **T008** 🤖 `app/tg/page.tsx` — list → two groups («Мои» top /
  «Остальные» below) via T006; foreign PCs open read-only. [needs T006, T007]
- [x] **T009** 🤖 PC home screen + **per-PC app launcher** (bag-icon Ledger app;
  greyed future apps). Ledger is the only active app. [needs T008]

## Phase 1b — Ledger reads (tg-client / RLS, no adapter)
- [x] **T010** 🤖 `lib/queries/ledger-tg.ts` — tg-client cursor readers: wallet
  (aggregate + denominations), feed (paginated, dodges the ~1000-row clamp),
  stash/общак. Wrap the existing cursor query shapes; zero new bookkeeping
  logic. [needs T007]
- [x] **T011** 🤖 Ledger app screen: wallet card (aggregate зм large +
  пп/зм/см/мм row, **tabular numerals**) + feed (grouped by loop-day, `pending`
  badge in amber) + «+» FAB + "показать ещё" pagination. [needs T010, T009]
- [x] **T012** 🤖 Общак screen: balance + recent movements + Положить / Забрать
  entry points. [needs T010]
- [x] **T013** 🤖 Read-only foreign PC: hide record/transfer/edit controls when
  `!isOwn` (wallet + feed still render). [needs T011]

## Phase 1c — Ledger writes (existing core via adapter)
- [ ] **T014** 🤖 Record sheet: direction (Расход/Доход) + amount (mandatory) +
  category/note/loop-day-override (optional) + money↔item toggle; calls
  `createTransaction` with `{ tgToken }`; optimistic update + honest rollback
  toast on failure (L2). [needs T004, T011]
- [ ] **T015** 🤖 Transfer sheet: to PC / to общак; calls `createTransfer` /
  `putMoneyIntoStash` (etc.) with `{ tgToken }`. [needs T004, T011]
- [ ] **T016** 🤖 ⚠️ **Free общак (PL-2)**: add `autoApprove?` to
  `createTransfer` + `createItemTransfer`; stash wrappers pass `true`; status =
  `(autoApprove || role !== 'player') ? 'approved' : 'pending'`, set
  `approved_by/at` on auto-approve, `batch_id = null`. **Desktop behavior
  changes too** (same actions) — note in the PR. [edits transactions.ts +
  stash.ts]
- [ ] **T017** 🤖 Vitest: free-общак status (player stash op → approved; player
  PC→PC → pending; DM → approved). [needs T016]

## Phase 1d — Realtime (E7 + DEBT-011)
- [x] **T018** 🤖 `117_realtime_transactions_broadcast.sql`: `AFTER INSERT`
  trigger on `transactions` → **`realtime.send()`** (error-capturing; doesn't
  break inserts) into `campaign:<id>` private channel (compact payload incl.
  `actor_pc_id`); RLS on `realtime.messages` gating the topic to members via
  `is_member`. Idempotent; `BEGIN;`/`COMMIT;`; ✅/❌ verification `SELECT`. →
  `present_files` ✓. [needs T007]
  > **Built & delivered.** Uses `realtime.send` (not `broadcast_changes`) — more
  > portable + self-error-capturing. ⚠️ References `realtime.*` objects, which
  > exist only **after T020** re-enables Realtime — so the apply order is **T020
  > → then 117 (T019)**, not the file order.
- [ ] **T019** 🧑 Apply 117 to staging by hand — **after T020** (117 needs the
  `realtime` schema). Prod via Studio at ship. [needs T018, T020]
- [ ] **T020** 🧑 🌐 ⚠️ **DEBT-011** — precedes applying 117: re-enable the
  Realtime container on the box (Dokploy): container + env; expose the WS route
  via Traefik/kong (keep `compose-override.kong.yml` + `COMPOSE_FILE` so labels
  survive); wire channel auth.
- [ ] **T021** 🧑 Add WAL replication-slot lag monitoring to the backup cron
  (slot grows → CPX32 disk). [part of DEBT-011]
- [ ] **T022** 🤖 `infra/realtime-runbook.md` — self-hosted re-enable steps,
  channel auth, WAL-slot monitoring. [pairs with T020/T021]
- [ ] **T023** 🤖 Client subscribe: `tg-client` subscribes to `campaign:<id>`;
  on insert append row + recompute affected balance(s); revalidate-on-focus /
  reconnect fallback (FR-010). [needs T018, T020, T011]

## Phase 2 — Approvals + transparency (P2)
- [ ] **T024** 🤖 Approvals tracking: submit a request + track status (own
  `pending` rows, amber badge; DM decision reflects in the feed). Reuses the
  existing queue. [needs T011]
- [ ] **T025** 🤖 All-PC balances screen (behind `⋮`): name + aggregate зм,
  own/общак row, read-only; tap row → that PC read-only. [needs T010]

## Phase 3 — Starter equipment (P3, tucked away)
- [ ] **T026** 🤖 Starter-equip screen (behind `⋮`): build a batch of items
  (catalog typeahead + free-text homebrew rows) + money rows → submit via the
  existing `submitBatch` (→ approval queue, C-03). Players gain no
  item-creation rights. [needs T004]
- [ ] **T027** 🤖 Post-submit state («Отправлено, ждёт одобрения») +
  collapsed «Задан ✓» after approval. [needs T026]

## Phase 4 — Staging E2E + ship
- [ ] **T028** 🧑 Deploy feature branch → `staging`; apply 117 to staging.
  [needs green Phase 1]
- [ ] **T029** 🧑 E2E on staging: record → second device ≤ 2 s (SC-003);
  free-общак put/take with no approval (C-05); foreign PC read-only;
  realtime after re-enable; one real iOS + one real Android (SC-004).
- [ ] **T030** 🤖 Open PR of the feature branch → `main` (human merges).
  [needs green staging]

## Tails (deferred — not blockers)
- [ ] **(tail) T031** 🤖 ★ Finalize app icon glyph + app label («Деньги»?) +
  empty-state microcopy once Andrey settles the design ★ slots.
- [ ] **(tail) T032** 🤖 ★ The single realtime-arrival "праздник" animation
  (1-sec row highlight) polish (P5).

## Sequencing
Phase 0 (adapter, testable now) → 1a (shell; **T007 RLS check first**) → 1b
(reads) → 1c (writes; T016 free-общак is the one backend delta) → 1d (realtime;
**T020 self-hosted re-enable is the long pole**, staging-verified) → 2 → 3 →
Phase 4 ship. **Apply order for realtime: T020 (re-enable) → 117 (T019)**, since
117 references the `realtime` schema. T019/T028 (staging migration) gate the
E2E. CI gate is authoritative (`npm run build` hangs in the sandbox — rely on
lint + typecheck + vitest).

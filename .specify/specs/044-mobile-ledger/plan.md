# Implementation Plan: Mobile Ledger (spec-044)

**Status**: Plan draft — awaiting review (then Tasks)
**Created**: 2026-06-23 · **Author**: Claude
**Inputs**: `spec.md` (Clarified, C-00…C-05), `design.md` (light pass),
epic `constitution.md` (E4/E6/E7/E10), research note D-7 (realtime).
**Assumes**: spec-046 merged to `main` first (this rides its `/tg` shell,
`lib/telegram/*` mint+verify, `tg-client`). 044 branches from clean `main`.

---

## 1. Summary & approach

044 is a thin money layer **inside the `/tg` Mini App**, not a new app.
Reads go straight through the minted-JWT `tg-client` under RLS (same path
046 uses for `getMyCharacters`). Writes reuse the **existing bookkeeping
core** (transactions/stash actions) through a thin auth adapter so those
actions run under the Mini App's JWT instead of a cookie session. Two
bounded backend deltas only (FR-004): the auth adapter, and a free-общак
flag. Realtime (E7) is the first self-hosted consumer: append-only inserts
broadcast on a per-campaign channel; this carries the Realtime re-enable
(DEBT-011) if 044 ships before 045.

Split of concerns:
- **Reads** (wallet, feed, общак, balances, character cards) → direct
  `tg-client` queries under RLS. No server action, no adapter.
- **Writes** (record, transfers, free-общак, starter-equip batch) →
  existing server-action core via the auth adapter (PL-1).
- **Realtime** → DB trigger broadcasts inserts; client subscribes and
  recomputes balances on receipt (PL-3).

---

## 2. Key technical decisions

### PL-1 — Auth adapter (path B), one set of actions

The existing write actions authenticate via `getCurrentUser()` →
`supabase.auth.getUser()` on a **cookie/GoTrue** session. The Mini App has
no cookie; it holds a **minted JWT** (HS256, signed with
`SUPABASE_JWT_SECRET`, produced by 046's `lib/telegram/mint`). Plan:

- Add **`lib/telegram/verify.ts`** (or extend `mint.ts`): verify a minted
  JWT against `SUPABASE_JWT_SECRET`, return `{ userId }` or null. Reuses
  046's secret + claim shape; no new trust path.
- Add **`getMembershipFor(userId, campaignId)`** in `lib/auth.ts` — the
  cookie-free counterpart to `getMembership` (which derives the user from
  the cookie). Cookie path stays unchanged.
- Refactor the actions' internal `resolveAuth(campaignId)` to
  **`resolveAuth(campaignId, opts?: { tgToken?: string })`**: if `tgToken`
  is present, verify → `userId` → `getMembershipFor`; else the existing
  cookie path. **One set of actions**, additive signature; every existing
  call site keeps working (no `tgToken` = cookie path).
- The Mini App client holds the JWT in page state (already does) and
  passes it as `{ tgToken }` to each ledger action call.

Why not a parallel route-handler API: the actions already separate auth
(`resolveAuth`) from the write; a token param is the smallest change and
keeps the bookkeeping core in exactly one place (SC-006). Token expiry:
the client re-mints on open (046) and on a verify-failure response
(`401`-style `ok:false`) it re-mints and retries once.

### PL-2 — Free общак (C-05 / FR-005)

Add `autoApprove?: boolean` to `createTransfer` and `createItemTransfer`.
The stash wrappers (`putMoneyIntoStash` / `takeMoneyFromStash` /
`put|takeItemFromStash`) pass `true`. Status becomes
`(autoApprove || role !== 'player') ? 'approved' : 'pending'`. For a
player free-общак op: `approved_by_user_id = author`, `approved_at = now`
(rule-based self-approval; satisfies the audit CHECK), `batch_id = null`
(it never enters the queue). **Desktop behavior changes too** — the same
stash actions back the desktop UI; this is intended and authorized.
Non-stash player transfers (PC→PC) keep `pending` (C-01) — only the stash
wrappers set the flag.

### PL-3 — Realtime transport (E7 / D-7), per-campaign channel

- **Channel granularity**: one **private channel per campaign**
  (`campaign:<id>`). The ledger's views are campaign-scoped in aggregate
  (общак, balances) and per-PC for the feed; a single campaign channel
  broadcasting every transaction insert lets each open view filter
  client-side by what it shows (current PC / общак / all). Simpler than
  per-actor channels (no resubscribe on navigation); chatter is trivial
  at ~20 players. (D-7's "per PC-sheet" channel was for 045's sheet — a
  different surface.)
- **Mechanism**: an `AFTER INSERT` trigger on `transactions` calls
  `realtime.broadcast_changes()` into `campaign:<id>` with the row
  (incl. `actor_pc_id`). Clients subscribe via the minted-JWT
  `tg-client`; on event they append the row and recompute the affected
  balance(s). Append-only ⇒ no LWW, no conflict.
- **Channel auth**: RLS on `realtime.messages` restricting topic
  `campaign:<id>` to members of that campaign (mirror the membership
  predicate used elsewhere).
- **DEBT-011 (self-hosted re-enable)**: the Realtime container was
  stripped from the box stack. Re-enable in Dokploy (container + env),
  expose the WS route via Traefik/kong (mind
  `compose-override.kong.yml` + `COMPOSE_FILE` so labels survive), wire
  channel auth, and add **WAL replication-slot lag monitoring** to the
  backup cron (slot grows → CPX32 disk). **Runbook → `infra/`** (new).
  Verify end-to-end on **staging** before prod.
- **Fallback (FR-010)**: revalidate-on-focus/reconnect for suspended
  mobile sessions — resilience, not the substitute.

### PL-4 — Shell additions (opening work, 044 owns them)

- Replace `getMyCharacters(userId)` use in the `/tg` list with
  **`getCampaignCharacters(campaignId, userId)`** → all campaign PCs, each
  tagged `isOwn`, own PCs ordered first. List renders two groups
  («Мои» / «Остальные»). Foreign PCs open read-only (controls hidden).
- PC screen gains the **per-PC app launcher** (bag-icon Ledger app;
  greyed future apps). Ledger = the only active app in 044.
- **Verify in this phase**: RLS grants **member-wide `SELECT`** on
  `transactions` (and the node/portrait reads), not own-PC-only, so E4
  foreign-ledger viewing works under the minted JWT. If it doesn't, the
  RLS policy is widened (a migration) — flagged as the first check.

### PL-5 — Pagination & reads

Feed reads use cursor pagination to dodge the PostgREST ~1000-row clamp.
A `getLedgerPage(...)` cursor reader already exists (desktop uses it via
`loadLedgerPage`). For the Mini App, reads run through the `tg-client`
under RLS directly (mirroring `getMyCharacters`) — wrap the same cursor
query as a `tg-client`-friendly reader. No new bookkeeping logic.

### PL-6 — Refresh model

The Mini App is a client SPA: after a write it does an optimistic update
confirmed by realtime; **no `revalidatePath`** is involved (that's for the
desktop server-rendered pages). The AGENTS.md sidebar-invalidation
contract therefore applies to the **desktop** surfaces only; the Mini App
refreshes via client state + realtime. Recorded so Implement doesn't bolt
revalidation onto client components.

---

## 3. Data model / migrations

No new tables. 044 adds **one migration**:

- `NNN_realtime_transactions_broadcast.sql`: the `AFTER INSERT` trigger on
  `transactions` → `realtime.broadcast_changes()` on `campaign:<id>`, and
  the RLS policy on `realtime.messages` gating the campaign topic to
  members. Idempotent (`create or replace`, `drop policy if exists`),
  wrapped `BEGIN; … COMMIT;`, ending with a verification `SELECT`
  (trigger + policy exist). Applied by Andrey via Studio (prod) / manually
  on staging; `present_files` on creation.

Auth adapter and free-общак are **code only** — no schema.
(Migrations 115/116 belong to 046, already on its PR.)

---

## 4. File layout (additive)

```
lib/telegram/verify.ts            JWT verify → { userId }            (new)
lib/auth.ts                       + getMembershipFor(userId, camp)   (edit)
lib/queries/campaign-characters.ts getCampaignCharacters(+isOwn)     (new)
lib/queries/ledger-tg.ts          tg-client cursor readers (wallet/feed/stash) (new)
app/actions/transactions.ts       resolveAuth(+tgToken); createTransfer/Item(+autoApprove) (edit)
app/actions/stash.ts              wrappers pass autoApprove=true      (edit)
app/tg/page.tsx                   list → groups; PC screen → launcher (edit)
app/tg/_components/…              PCHome, AppLauncher, Ledger (wallet/feed/record/transfer/stash),
                                  AllBalances, StarterEquip          (new, client)
supabase/migrations/NNN_realtime_transactions_broadcast.sql          (new)
infra/realtime-runbook.md         self-hosted Realtime re-enable      (new)
```

Conventions (AGENTS.md): Tailwind media queries only (no `useIsMobile`);
named exports for server modules, default for client components;
hand-rolled validators (reuse existing); auth-gated writes (via adapter).

---

## 5. Implement phasing (preview — task breakdown lands in Tasks)

- **Phase 0 — adapter plumbing**: `verify.ts`, `getMembershipFor`,
  `resolveAuth(+tgToken)`; vitest (valid/expired/forged token, membership
  resolution). Nothing user-visible; de-risks every write below.
- **Phase 1a — shell**: `getCampaignCharacters`; list groups; PC home +
  launcher. RLS member-wide-SELECT check (widen if needed).
- **Phase 1b — ledger reads**: wallet + feed (paginated) + общак view via
  `tg-client`/RLS; read-only foreign view.
- **Phase 1c — ledger writes**: record (expense/income/item), transfers
  PC↔PC, **free общак** (autoApprove); all via the adapter. Optimistic +
  honest rollback (L2).
- **Phase 1d — realtime**: migration (trigger + RLS) + `infra/` re-enable
  runbook + client subscribe + balance recompute; verify on staging.
- **Phase 2** — approvals tracking (submit/track status); all-PC balances.
- **Phase 3** — starter-equip screen (`submitBatch` of items+money →
  existing queue; homebrew as free-text rows), tucked behind `⋮`.

Each phase ships behind the others; 1a–1d are the P1 bet (SC-001/002/003).

## 6. Testing

- **vitest** (CI gate authoritative; `npm run build` hangs in sandbox):
  adapter verify + membership; free-общак status logic; tg-client cursor
  readers; `getCampaignCharacters` own-first/isOwn.
- **Manual on staging** (E2E): record→appears on second device ≤2s
  (SC-003); free-общак put/take no-approval; foreign read-only; realtime
  after re-enable. Real iOS + Android from the pool (SC-004).

## 7. Risks & open checks

1. **RLS member-wide SELECT on `transactions`** — required for E4 foreign
   reads + realtime channel. First check in Phase 1a; widen via migration
   if own-PC-only today.
2. **Realtime self-hosted re-enable** is the long pole (container, WS via
   Traefik/kong, channel auth, WAL slot lag). Highest-uncertainty work;
   staging-verified before prod. Runbook captures it.
3. **Token lifetime** — minted JWT expiry during a long session; re-mint
   on verify-failure + retry once (PL-1).
4. **Desktop free-общак change** — same stash actions back desktop;
   behavior shift is intended/authorized (PL-2), note in the PR.
5. **`db_max_rows` clamp** — cursor pagination everywhere on the feed
   (PL-5).

## 8. Constitution / definition of done

E4 (transparency: read any, edit own), E6 (faster than paper: ≤10s
record), E7 (realtime ≤2s), E10 (mobile-first). SC-006 holds: bookkeeping
core untouched beyond the two authorized deltas. Migration idempotent +
verification SELECT + `present_files`. Mini App refreshes client-side
(PL-6). Ships via `claude/044-mobile-ledger` → staging hand-test → PR into
`main`.

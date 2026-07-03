# Feature Specification: Ledger Master Message (pinned dashboard)

**Feature Branch**: `claude/spec-054-ledger-master`
**Created**: 2026-07-03
**Status**: In progress
**Input**: Increment **A** of the post-053 ledger epic. Builds directly on
spec-053's Telegram ledger feed (`lib/telegram/bot.ts`, `ledger-feed.ts`,
`ledger-format.ts`). Adds one editable, pinned **master message** — a standing
money dashboard for the "Денежки, лут" topic — with **no schema change**
(reuses `campaigns.settings` JSONB) and **no new bookkeeping math** (reuses
spec-044's `getAllBalancesTg`). Expeditions/«вылазки» (increment B) take
spec-055+.

## Context

Spec-053's feed narrates each money/loot event as its own message — great for
"what just happened", useless for "where are we now". A player scrolling the
topic can't see the party's current purse without summing the feed by hand. The
DM's authored **#ДоходыРасходы** longread is prose, not live numbers — and the
bot must **never** touch it.

This spec adds a single message the bot keeps up to date: **current loop +
общак balance + per-PC money balances**, with the transaction feed folded under
a **collapsible cut** in the same message. The admin pins it once; from then on
it's the topic's standing dashboard.

Everything it needs already exists: the numbers come from spec-044's read layer
(`getAllBalancesTg` → `{ rows: per-PC gp, stashGp }`), the in-place edit comes
from spec-053's `editLedgerMessage` (whose doc-comment already flags it as "here
for the future editable-pinned-summary"), and every money/loot event already
funnels through one choke point (`notifyLedgerEvent` in `ledger-feed.ts`, with
`campaignId` + `after()` in hand). So this spec is **assembly + storage + a
refresh trigger + per-loop rotation** — not a build.

## Decisions (resolved with Andrey, 2026-07-03)

1. **Content.** Dashboard = current loop + общак balance + per-PC **money**
   balances (no item lists). The transaction feed lives **under a collapsible
   cut** (`<blockquote expandable>`) inside the same message. The DM's
   #ДоходыРасходы prose is untouched — only machine numbers sit near it.
2. **Refresh cadence.** Re-read balances and re-write the message on **every
   ledger event**, inside the existing `after()` in `notifyLedgerEvent` — off
   the write's critical path, cheap at one-campaign scale. (Telegram will mark
   the pinned message "edited"; accepted.)
3. **Loop shift.** Reuse the existing loop-start flow. On the `loop-started`
   event the old master message is **frozen as history** (we stop editing it);
   the bot posts a **new** message for the new loop; the **admin pins it by
   hand** (the bot does not pin). Consistent with balances being per-loop.
4. **Substrate — hybrid.** Render with the universal `<blockquote expandable>`
   now (works on every client, ships collapsibility today). Keep the renderer
   **swappable** so Bot API 10.1 **Rich Messages** (`RichBlockTable` /
   `RichBlockDetails`, `editMessageText(rich_message=…)`) can drop in as a
   verified fast-follow. See **Research** below.
5. **Storage.** `campaigns.settings.ledger_master_message_id` (JSONB — same bag
   as `approvals_enabled`, `item_default_prices`; **no migration**).

## Design (the assembly)

- **`lib/telegram/ledger-master-format.ts` (PURE).** `MasterState → HTML`. Owns
  all wording + the `<blockquote expandable>` layout + the ≤4096 clamp. This is
  the swappable render seam: a `renderMasterRich(state)` sibling lands here for
  the fast-follow without touching compose/orchestration.
- **`lib/telegram/ledger-master.ts` (impure, server).** `composeMasterState`
  (admin-client reads: loop, PCs, `getAllBalancesTg`, recent tx), storage
  helpers (`get/setMasterMessageId`, RMW-merge into settings), and
  `refreshMasterMessage(admin, campaignId, { mint })` — the post/edit/rotate
  orchestration. Never throws.
- **Hook.** Inside `notifyLedgerEvent`'s existing `after()`, after the per-event
  `sendLedgerMessage`, call `refreshMasterMessage(admin, event.campaignId,
  { mint: event.type === 'loop-started' })`, wrapped so a failure can't break
  the event send (which already can't break the write).

## Requirements

- **FR-001** The master message MUST show: current loop number, общак (stash)
  gp balance, and each campaign PC's **money** balance (gp-aggregate; **no**
  item holdings). The recent transaction feed MUST sit under a collapsible
  `<blockquote expandable>` in the same message.
- **FR-002** The message MUST be re-rendered and edited in place on **every**
  ledger event, from inside `notifyLedgerEvent`'s `after()` — off the write
  path. A failure to refresh MUST NOT throw into the event send or the write.
- **FR-003** On a `loop-started` event the bot MUST post a **new** master
  message (for the new loop) and store its id, **without** editing the previous
  one (which stays as frozen history). The bot MUST NOT pin — pinning is the
  admin's manual step.
- **FR-004** The message id MUST persist at
  `campaigns.settings.ledger_master_message_id`, written by read-modify-write so
  sibling settings keys are never clobbered.
- **FR-005** Bootstrap: if no id is stored when a non-`loop-started` event
  fires, the bot MUST post a first master message and store its id (so the very
  first money action after deploy materialises the message for the admin to
  pin).
- **FR-006** Self-heal: if editing the stored id fails (e.g. the admin deleted
  the message), the bot MUST post a fresh one and replace the stored id.
- **FR-007** The rendered message MUST stay ≤ 4096 UTF-8 chars: the feed tail is
  clamped (newest-first) to fit, and truncation MUST be marked (e.g. `…`). The
  dashboard header always survives; only feed lines are dropped.
- **FR-008** Staging/dev safety is inherited: when the feed isn't configured
  (`ledgerFeedConfigured() === false`) the whole path is a no-op (bot.ts).
- **FR-009** The renderer MUST be swappable (a pure `MasterState → payload`
  function) so a Rich Messages renderer can replace the HTML one without
  reworking compose, storage, or the hook.

### Non-goals for correctness

- No "updated at HH:MM" line — Telegram's "edited" marker signals freshness.
- No debounce of edits in v1 (one edit per event). Noted as a follow-up if a
  batch op ever fans out many events (see Out of Scope).

## Research: Bot API for long collapsible messages (2026-07-03)

Andrey asked to scout the latest bot capabilities for "a great very long message
with collapsible text". Findings:

- **Bot API 10.1 (2026-06-11) — Rich Messages.** Document-grade messages built
  from blocks: `RichBlockSectionHeading`, `RichBlockDivider`, `RichBlockList`,
  **`RichBlockTable`/`RichBlockTableCell`** (a real balances table),
  **`RichBlockDetails`** (a titled collapsible section — nicer than a
  blockquote), block/pull quotes, media blocks. New methods `sendRichMessage`
  (accepts `message_thread_id`, so it posts into our topic) and
  `sendRichMessageDraft`; **`editMessageText` gained a `rich_message` param** →
  rich messages **can be edited in place** (so "refresh on every event" works).
  Our bot layer is raw `fetch`, so adopting it is just new JSON — no SDK
  blocker.
- **Two unverified facts** (not in the docs, must be checked against the live
  API before betting on Rich): (1) whether the **4096-char limit** is lifted for
  rich messages — this is the *only* thing gating "very long"; both
  `<blockquote expandable>` and `RichBlockDetails` only **visually** collapse, so
  collapsed text still counts against the cap; (2) whether `sendRichMessage` is
  **available to all bots** or business-only.
- **Maturity risk.** The feature is 3 weeks old (rendered by Telegram Desktop
  6.9). On a **player-facing pinned** message, how older/not-yet-updated clients
  degrade a rich message is an open question.
- **Decision → hybrid.** Ship the universal `<blockquote expandable>` renderer
  now; keep the render seam swappable; adopt Rich Messages as a fast-follow once
  (1) the 4096 question, (2) all-bots availability, and (3) client degradation
  are verified live.

Sources: [Bot API changelog](https://core.telegram.org/bots/api-changelog),
[Bot API reference](https://core.telegram.org/bots/api),
[Telegram Desktop 6.9 coverage](https://www.techtimes.com/articles/318257/20260611/telegram-desktop-69-bots-get-document-grade-formatting-guardian-controls-streaming.htm).

## Out of Scope

- **Rich Messages rendering.** Fast-follow after the three live checks above.
- **Manual "advance loop" control.** Reuse the existing loop-start flow (D3).
- **Edit debounce / rate-limit.** One edit per event in v1. If a future batch op
  (e.g. `applyEncounterLoot`) fans out many events, revisit — but the epic tail
  already plans `applyEncounterLoot` as a **single** aggregate feed event, which
  sidesteps the fan-out.
- **`applyEncounterLoot` feed line.** Separate PR (epic tail).
- **Item holdings in the dashboard.** Money only (D1).
- **Inventory key unification** (/tg by name vs desktop by node_id). Separate
  spec (variant C).

## Success Criteria

- **SC-001** After deploy + the first money action, a single master message
  appears in the topic showing the current loop, общак gp, and every PC's gp;
  the admin can pin it.
- **SC-002** Any subsequent money/loot event updates the pinned message's
  numbers in place within seconds, without a new message.
- **SC-003** Starting a new loop leaves the previous master message untouched
  and posts a fresh one for the new loop for the admin to pin.
- **SC-004** The message never exceeds Telegram's 4096-char limit; when the feed
  is long, the oldest lines are dropped and truncation is visible.
- **SC-005** With the feed unconfigured (staging/dev), nothing is posted or
  edited — zero side effects.

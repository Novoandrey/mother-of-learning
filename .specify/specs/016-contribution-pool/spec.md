# Feature Specification: Real-money Contribution Pool (Сборы)

**Feature Branch**: `016-contribution-pool`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User prompt — "mini-module for chipping in on real-world
stuff: food ordered for a session, room rental if any, miniatures
kitty, etc. Real currency. Must show who owes how much and let
the pool's author mark who paid and who didn't."

## Context

Every real table has a side-channel of real-world money: someone
orders pizza and floats the cost, someone else rents the room,
the group saves up for a new set of miniatures or a board. Today
this lives entirely outside the app — in a Telegram thread, in
screenshots of a Tinkoff bill, or (worst case) in the DM's
memory. This is annoying for two reasons:

1. **The person who laid out the money has to chase people.**
   They need a list of "who owes how much and who already paid",
   they keep it in their head or on a napkin, and they forget.
2. **The rest of the party has no single place to look** and
   answer "do I owe anyone anything for the last three sessions?".

This feature is intentionally **orthogonal to the in-game
ledger** (spec-010/011). It does **not** touch gold pieces,
character wallets, the stash, loops, or sessions-as-ledger-time.
It is a **sidecar tool for the real-world human layer** of the
campaign: real RUB, real IOUs, one pool per thing-being-collected.

The feature scope is modest on purpose — this is a "сделать по
приколу" utility, not a Splitwise replacement:

1. Any campaign member can open a **pool** ("Сбор") with a title,
   a real-world total amount in a real currency (RUB by default),
   and a list of participants with per-person shares.
2. The author sees a checklist of participants and flips a
   checkbox for each person who has paid them back.
3. Every campaign member can see the pool, their own share, and
   whether they are marked as paid — so the author doesn't have
   to answer "did you get my money?" in DMs.
4. Pools can be closed when the author has collected everything
   (or decides to give up). Closed pools stay visible in a
   "history" view.

Everything else is out of scope. No payment processing (no
Tinkoff / Sberbank / CloudPayments integrations — the payment
itself happens out-of-band, the app only tracks the intent and
confirmation). No automatic reminders, no push notifications, no
"nudge a late payer" UX. No cross-campaign pools. No integration
with in-game currency — putting 500 RUB for pizza is not related
to any gp balance and does not generate any ledger row.

**Two framing points pinned at the spec level** because they
would otherwise drift into HOW territory and re-litigate each
time:

1. **Real-world currency is a freetext-ish enum, not a
   conversion system.** Each pool picks one currency at creation
   (RUB, USD, EUR — more may be added; list is data, not code).
   Pools never convert between currencies. No FX, no rates, no
   multi-currency totals.
2. **The author is the single source of truth on who paid.**
   Participants do not self-mark "I paid" — the person who laid
   out the money is the one who saw the bank notification or the
   bills, and only they flip the checkbox. This avoids "did you
   get it?" ambiguity loops.

## Goals

- **Primary**: the person who laid out the real money has a
  single place to track "who owes how much, and who has paid"
  for each collection, without leaving the app.
- **Secondary**: any campaign member can open the app and answer
  "do I owe someone for the last sessions?" in under 10 seconds,
  without asking in chat.
- **Tertiary**: closed pools stay as a readable history of
  "what did the group actually spend real money on together".

## Non-goals

- **Payment processing.** The app never moves real money. It
  records intent (who should pay whom how much) and confirmation
  (author says "got it").
- **Payment-provider integrations.** No Tinkoff / Sberbank /
  CloudPayments / Stripe / revolut / apple-pay. A future spec may
  add "copy my IBAN to clipboard" affordances; that is explicitly
  not this one.
- **Automatic reminders / notifications.** No push, no emails,
  no Telegram hooks. Chase is manual.
- **Splitting an amount across multiple currencies or pools.**
  One pool, one currency, one total. If someone paid the
  miniatures kitty in USD and you want that as a separate row,
  open a second pool.
- **Cross-campaign pools.** A pool belongs to one campaign. If
  two campaigns share a room rental, they need two pools (the
  same human can be a participant in both; they are two separate
  IOU lists).
- **Integration with the in-game ledger.** A Сбор never creates,
  reads, or updates a `transactions` row. The two subsystems
  share nothing but the app frame and user auth.
- **FX / conversion / "equivalent in RUB".** Out of scope.
- **Tax / accounting exports.** Out of scope.
- **Editing a pool after it has been archived / hard-closed.**
  Closed pools are read-only; reopening is a conscious, explicit
  action (see FR-027).
- **Per-campaign role gating on who can create a pool.** MVP:
  every campaign member can. Role-gated creation (DM-only) is a
  P3 flag for later.
- **Recurring collections / templates.** "Same pizza-money pool
  every other week" is not auto-generated. The user copies an
  old pool by hand if they want a shortcut.
- **Commenting / discussion inside a pool.** Commentary lives in
  Telegram where the group already talks; the pool is just
  numbers.
- **Mobile-specific PWA install flow.** Standard responsive
  web, same as the rest of the app.

---

## User Scenarios & Testing

### User Story 1 — DM opens a pool for the pizza they just ordered (Priority: P1)

Andrey runs a session. Mid-session the group orders pizza; he
pays 4 500 RUB on his card. He taps **"+ Сбор"** on the
campaign's Сборы tab, fills:

- Title: `Пицца 24 апреля`
- Currency: `RUB` (the campaign default)
- Total amount: `4500`
- Participants: picks the 5 people who were at the table from a
  multi-select of campaign members, optionally adds a free-text
  name (`Петя` — a friend who came along and isn't in the
  campaign)
- Split mode: `Equal` → system auto-computes `4500 / 6 = 750
  RUB/person` (including Andrey himself — see US1.3 for the
  skip-self case)

Saves. The pool is now visible to every campaign member. Andrey
leaves the table; during the week people start paying him by
Tinkoff transfer; each time he gets a notification, he opens the
pool and ticks the corresponding participant's checkbox.

**Why this priority**: this IS the feature. Every other story is
a variation on it. If this one doesn't feel one-tap-per-state-
change on mobile, the feature has failed.

**Independent Test**: create a pool `Пицца 24 апреля`, `4500 RUB`,
6 participants, equal split. Expect 6 participants each owing
750 RUB, all in "unpaid" state. Author taps one participant's
checkbox; expect that participant to flip to "paid" and the pool
summary to update to `750 / 4500 paid`.

**Acceptance Scenarios**:

1. **Given** Andrey is a campaign member and taps "+ Сбор",
   **When** he fills title, total `4500 RUB`, picks 6 members,
   chooses `Equal` split and saves, **Then** the pool exists
   with 6 participant rows, each with share `750 RUB` and status
   `unpaid`; the pool's summary shows `0 / 4500 RUB paid, 4500
   RUB remaining`.
2. **Given** the pool is saved, **When** any campaign member
   opens the Сборы tab, **Then** they see the pool in the
   "Open" list with its title, total, author, currency, and a
   per-user-visible hint ("Ты должен 750 RUB" for members in the
   participant list; "Ты не участвуешь" for members who aren't;
   for the author, a short "Автор" chip instead of a debt hint).
3. **Given** the author wants to **exclude himself** from the
   split (he paid, he's not owed by himself), **When** he ticks
   an optional "Exclude me from the split" checkbox at creation
   time, **Then** the split is recomputed over the remaining
   participants only (e.g. `4500 / 5 = 900 RUB/person`), and the
   author is not shown as a participant. Default is **include
   the author** — this is the normal case (Andrey chipped in on
   the pizza he's paying for, he ate it too).
4. **Given** the author is also a participant, **When** the pool
   renders, **Then** the author's row is shown in the
   participant list with a special affordance ("paid by
   default" — see FR-015). The author's share counts toward the
   pool total but is automatically marked paid and cannot be
   unticked (it would not make sense to owe money to yourself).
5. **Given** the split produces a non-integer share (e.g. `100
   RUB / 3 = 33.33`), **When** the pool renders, **Then** the
   shares are shown with 2-decimal precision and the total
   reconciles exactly (one participant eats the rounding
   residual; see FR-011).

---

### User Story 2 — Author marks a participant as paid (Priority: P1)

Andrey's phone buzzes: `Вам перевели 750 руб. от Лёши`. He opens
the Сборы tab, taps the open pool, finds Лёша's row, taps the
checkbox. The row flips to `paid`, the pool summary updates
(`1500 / 4500 RUB`, remaining `3000 RUB`), the remaining count
decrements by one.

**Why this priority**: the whole value of the feature is the
author's "mark paid" loop. It must be one-tap from the pool
list, work on mobile, and survive network churn.

**Independent Test**: open a pool with 6 unpaid participants,
tap participant 3's checkbox. Expect that participant to flip to
`paid` with a timestamp, the summary to update, and a
minimal-friction undo affordance (second tap unticks).

**Acceptance Scenarios**:

1. **Given** a pool with 6 unpaid participants, **When** the
   author taps participant 3's paid checkbox, **Then** that
   row's status is `paid`, a timestamp is recorded (`paid_at =
   now`), and the summary recomputes.
2. **Given** the same row is now `paid`, **When** the author
   taps the same checkbox again, **Then** the row flips back to
   `unpaid`, the timestamp is cleared, and the summary
   decrements. (Undo within the same session is critical — author
   mis-taps are routine on mobile.)
3. **Given** two campaign members (author + co-DM) are both
   viewing the pool simultaneously, **When** one of them flips a
   checkbox, **Then** the other will see the updated state on
   their next refresh / navigation. Realtime sync is **not
   required**; last-write-wins is acceptable (same rule as
   everywhere else in the project).
4. **Given** the current user is not the pool's author, **When**
   they view the pool, **Then** the checkboxes are **not**
   tappable — the status is read-only for non-authors (FR-010).
5. **Given** the DM (not the author) opens the pool, **When**
   the DM taps a checkbox, **Then** the tap works — the DM is
   treated as a second author for every pool in their campaign
   (FR-010-b).

---

### User Story 3 — Campaign member checks whether they owe anything (Priority: P1)

Lena opens the app on Monday morning, wondering: "did I forget
to pay Andrey for anything?". She goes to the campaign's
**Сборы** tab. She sees:

- A **summary card at the top**: `Ты должна 1500 RUB по 2
  открытым сборам` (sum of her unpaid shares across all open
  pools in this campaign, in the campaign's default currency, or
  split by currency if mixed — see FR-018).
- A list of open pools; each pool row shows her own status in
  that pool: `— 750 RUB, неоплачено` / `✓ 750 RUB, оплачено` /
  `не участвуешь`.

She taps a pool to see the full participant list and the author's
contact / payment details (see FR-007).

**Why this priority**: this is the "read side" of the feature —
the reason non-authors benefit from the app tracking this at
all, instead of just living in Telegram. If a member can't
answer "do I owe?" in one screen, the Telegram thread wins and
the app loses.

**Independent Test**: log in as Lena, navigate to Сборы. Verify
the top-of-page summary matches the sum of her unpaid shares
across all open pools, and that each pool row shows her personal
status inline (not just the pool-wide totals).

**Acceptance Scenarios**:

1. **Given** Lena is a participant in 2 open pools (owes 750
   RUB in one, 750 RUB in another) and not a participant in a
   third, **When** she opens the Сборы tab, **Then** the header
   shows `Ты должна 1500 RUB` and each pool row shows her
   personal status inline.
2. **Given** Lena has been marked paid in one of the pools,
   **When** she refreshes, **Then** that pool's row shows `✓
   750 RUB` and the header total decreases by 750 RUB.
3. **Given** Lena is not a participant in a pool, **When** she
   opens the Сборы tab, **Then** that pool still appears in her
   list (it's public inside the campaign) but her status chip
   reads `не участвуешь` and her owed amount does not contribute
   to the header total.
4. **Given** pools exist in mixed currencies (one RUB, one USD),
   **When** the header renders, **Then** it shows each currency
   on its own line: `Ты должна 1500 RUB · 20 USD`. No conversion
   is attempted.

---

### User Story 4 — Author closes a pool once everyone has paid (Priority: P1)

Eventually all 5 participants have paid. The pool summary reads
`4500 / 4500 RUB, 0 RUB remaining`. Andrey taps **"Закрыть
сбор"**, confirms. The pool is now **closed** — it disappears
from the default "Open" list and lives in a "History" section.
All fields become read-only; Andrey cannot flip checkboxes on a
closed pool without explicitly reopening it (see US8).

**Why this priority**: without a close action, the pool list
becomes an ever-growing backlog and the header summary stops
being useful (old closed pools pollute the count). The close
action is also the "I'm done tracking this" signal.

**Independent Test**: on a pool with every participant paid, tap
"Закрыть сбор". Expect the pool to move to the History list and
its summary to show `closed at <timestamp>` with all controls
disabled.

**Acceptance Scenarios**:

1. **Given** a pool has every participant marked paid, **When**
   the author taps "Закрыть сбор" and confirms, **Then** the
   pool's status flips to `closed`, a `closed_at` timestamp is
   recorded, and the pool moves from the "Open" to the "History"
   list.
2. **Given** a pool has at least one unpaid participant, **When**
   the author taps "Закрыть сбор", **Then** the confirm dialog
   explicitly warns: `У 2 участников статус "не оплачено" —
   закрыть всё равно?`. The author can confirm anyway (this is
   "we're giving up on collecting" — real life). On confirm, the
   pool becomes closed with the unpaid rows preserved as-is.
3. **Given** a pool is closed, **When** any campaign member
   views it, **Then** all controls (mark-paid, edit share,
   delete participant, edit total, etc.) are disabled; a
   banner reads `Закрыто <timestamp>`; a single action is
   available to the author — "Переоткрыть" (US8).

---

### User Story 5 — Author edits a pool's participants or amount (Priority: P2)

Midway through collection, Andrey realises the total should have
been 4 800 RUB, not 4 500 (he forgot a delivery fee). He opens
the pool, taps edit, changes the total to `4800`. The split
**re-computes automatically**: each of 6 people now owes `800
RUB` instead of `750 RUB`. Already-paid rows stay `paid` and do
not flip back — but a warning banner appears: `3 из 6 уже
заплатили старую сумму (750). Разница: 50 RUB с каждого.` Andrey
can then either (a) leave those rows paid anyway and chase the
difference manually, or (b) mark the already-paid rows back to
unpaid so the new total flows through cleanly. The form does
not pick for him.

**Why this priority**: P2 because the "just get the initial
number right" path is the common one; the edit case is real
but rarer. It must be correct (the participant list must update
cleanly with no orphan rows), and the edit UI must not silently
move money.

**Independent Test**: edit a pool's total from 4 500 to 4 800
after 3 of 6 participants paid 750 each. Expect all 6
participants' shares to update to 800, the 3 paid participants
to remain `paid` with a warning chip `старая сумма: 750`, and
the summary to read `2250 / 4800 RUB paid, 2550 RUB remaining`.

**Acceptance Scenarios**:

1. **Given** a pool with 6 participants at 750 RUB each (3
   paid), **When** the author edits the total to 4 800, **Then**
   the split re-computes to 800 RUB each, already-paid rows keep
   their `paid` status but carry a `paid at old amount: 750`
   chip so the author knows to chase 50 RUB more. Unpaid rows
   simply show the new 800 amount.
2. **Given** the author adds a new participant to the pool,
   **When** the split mode is `Equal`, **Then** the total
   divides across the new count (e.g. `4500 / 7 = 642.86`),
   all unpaid rows update. Already-paid rows keep their old
   amount with the same "old amount" chip and are excluded from
   the re-split (see FR-013).
3. **Given** the author removes a participant who is `unpaid`,
   **When** they confirm, **Then** the participant row is
   deleted and the remaining unpaid rows re-split the remaining
   amount.
4. **Given** the author tries to remove a participant who is
   `paid`, **When** they attempt the deletion, **Then** the form
   warns: `Этот участник отмечен как оплативший — удаление
   сломает баланс. Сначала отметьте как не оплаченное.`. The
   deletion is blocked until the author unticks `paid` on that
   row first.
5. **Given** the split mode is `Custom` (per-person amounts set
   by hand — see FR-009), **When** the author edits the total,
   **Then** the custom shares are **not** auto-rescaled; the
   form shows a validation banner if shares no longer sum to the
   new total, and the author must reconcile by hand.

---

### User Story 6 — Non-member ad-hoc participant (Priority: P2)

Petya, a friend of Andrey's, comes to a session as a one-off
guest. He isn't in the campaign. He shares the pizza. When
Andrey creates the pool, he adds Petya as a **free-text
participant** (just a name, no user link). Petya's row behaves
exactly like a member row — he has a share, the author ticks him
paid when he pays — but Petya **does not see the pool** (he has
no account in the campaign). The display name "Петя" appears in
the participant list for every campaign member who looks at the
pool.

**Why this priority**: P2 because the common case is
campaign-member participants. But a one-off guest is frequent
enough that forcing them into the campaign-members table (just
to have a pizza IOU) would be wrong.

**Independent Test**: create a pool with 5 campaign-member
participants + 1 free-text participant "Петя". Verify Petya's
row works identically for the author (mark paid / unpaid) and
that Petya — having no account — cannot see the pool.

**Acceptance Scenarios**:

1. **Given** the author taps "+" in the participant picker,
   **When** they switch to "Добавить имя" mode and type `Петя`,
   **Then** a participant row is created with `display_name =
   'Петя'`, `user_id = NULL`.
2. **Given** the ad-hoc participant row exists, **When** any
   campaign member opens the pool, **Then** Petya's name appears
   with no avatar / no "click to profile" affordance — it's a
   plain text label.
3. **Given** the author later realises Petya IS actually a
   campaign member and wants to link the row to his account,
   **When** they tap the row and choose "Связать с участником",
   **Then** the `user_id` is attached and the `display_name` is
   replaced by the member's canonical name — all paid-status
   data is preserved.

---

### User Story 7 — "My pools" view across campaigns (Priority: P3)

A single human plays in multiple campaigns (the app supports
this via auth). Andrey is DM of mat-ucheniya and a player in two
other campaigns. He wants a **single personal view** that shows:

- All open pools where he is the author, across every campaign,
  with per-pool collection progress.
- All open pools where he owes money, across every campaign,
  with his personal share.

This view lives outside any single campaign — it's a
profile-level / home-level page.

**Why this priority**: P3 because this is a nice-to-have power
feature, not required for the MVP. The per-campaign Сборы tab
covers the 80% case ("I'm in one campaign, tracking its pools").
The cross-campaign view is polish.

**Independent Test**: log in, navigate to a profile-level "My
pools" page (exact URL decided in plan). Expect it to aggregate
all open pools across every campaign the user is a member of,
grouped by role (authored by me / I owe).

**Acceptance Scenarios**:

1. **Given** Andrey authors 2 open pools in campaign A and 1 in
   campaign B, **When** he opens the personal "My pools" page,
   **Then** he sees 3 pool rows grouped under "Authored", each
   with a campaign chip and current progress.
2. **Given** he owes money in 1 pool in campaign A and 2 pools
   in campaign C, **When** he opens the same page, **Then** the
   "You owe" section lists 3 rows, each with its campaign chip
   and his personal share.

---

### User Story 8 — Reopen a closed pool (Priority: P3)

Three weeks after closing the pizza pool, Andrey realises Лёша
actually never paid (Andrey mis-ticked his row in the rush). The
pool is already closed. Andrey opens it from History, taps
**"Переоткрыть"**, confirms. The pool flips back to `open`; the
`closed_at` timestamp is cleared; the pool re-appears in the
"Open" list. Andrey fixes Лёша's checkbox back to `unpaid` and
resumes collecting.

**Why this priority**: P3 because it's a correction for a rare
mistake. Must exist (data integrity) but doesn't drive the
feature's value.

**Independent Test**: on a closed pool, tap "Переоткрыть". Expect
the pool to return to the Open list with fully editable fields
and `closed_at` cleared.

**Acceptance Scenarios**:

1. **Given** a closed pool, **When** the author taps
   "Переоткрыть" and confirms, **Then** status flips to `open`,
   `closed_at` is nulled, and the pool reappears in the Open
   list.
2. **Given** a closed pool, **When** a non-author campaign
   member views it, **Then** the "Переоткрыть" button is not
   visible (read-only rule per FR-010).

---

### Edge Cases

- **Empty participant list.** A pool cannot be created with zero
  participants. The form blocks save with `Добавьте хотя бы
  одного участника`.
- **Single participant + author is excluded.** An "excluded
  author" pool with one participant effectively means "Лёша
  owes me the whole thing". This is valid (not degenerate) and
  works: one row, one share = total, one checkbox.
- **Non-integer share rounding.** When equal split doesn't
  divide cleanly, one participant absorbs the residual. The
  choice of whom is deterministic: the last participant in the
  list (see FR-011). This is visible in the UI (a `↑X.XX` chip
  next to the rounded-up share).
- **Zero total.** Explicitly disallowed — a pool with total = 0
  has no meaning. The form rejects save.
- **Negative total.** Disallowed.
- **Currency that isn't in the pre-defined list.** Out of scope
  for MVP; the currency picker is a fixed enum (see FR-004).
  If a future campaign plays in GEL, we add it to the enum.
- **Author deletes their own campaign account.** (Hypothetical
  — the app doesn't support account deletion today, but the
  data model must be resilient.) A pool with no author is
  display-only; editing is gated on author presence. If the
  author's account ever becomes soft-deleted, the pool shows
  `Автор удалён` and allows the DM to re-assign authorship
  (out of MVP scope — noted as a future concern in FR-026).
- **Participant user is removed from the campaign.** Their row
  remains (historical record) with a `больше не в кампании` chip.
  The amount they owe still counts toward the pool's total; the
  author can still mark them paid.
- **Concurrent edits.** Two authors (DM + pool author) tick the
  same participant's checkbox simultaneously. Last-write-wins;
  the later tap decides. Same behaviour as spec-010/011.
- **Extremely long title.** Titles are capped at 100 chars
  (same as node titles); the form truncates input.
- **Mobile input of a large amount.** The total input accepts
  numbers with two-decimal precision. Locale-specific separators
  (`,` vs `.`) must both work (Russian users type `4500,50`).
- **Clicking "delete pool" by accident.** Pool deletion is a
  destructive action with a confirm dialog. Deleted pools are
  **soft-deleted** (`deleted_at` timestamp) — same convention as
  other soft-deletable entities in the project — so accidents
  are recoverable by a DM who knows where to look. Soft-deleted
  pools are not shown in any view.
- **Huge campaign (29 PCs / 15 active members).** The
  participant picker must handle long lists — same "search +
  multi-select" pattern used in spec-009 session participants.
- **Pool created in past tense (retroactive).** Creation date is
  `now` by default but the form exposes an optional "дата сбора"
  field for the event the pool covers — purely informational, it
  affects history sorting only.

---

## Requirements

### Functional Requirements

**Pool entity**

- **FR-001**: A **pool** has a title, a currency (one of the
  supported currencies — see FR-004), a positive total amount
  with 2-decimal precision, an author (a campaign member), a
  campaign (the pool's scope), a status (`open` / `closed`), and
  timestamps (`created_at`, `updated_at`, `closed_at`,
  `deleted_at`).
- **FR-002**: A pool has **0 or 1 session** it references (an
  optional `session_id`). This is purely informational (shown on
  the pool card for context) and creates no other coupling. A
  pool without a session is common (e.g. a room-rental pool
  covering the whole campaign).
- **FR-003**: A pool's title MUST be 1–100 characters. The total
  amount MUST be > 0. The currency MUST be from the enum.
- **FR-004**: Supported currencies in MVP: `RUB`, `USD`, `EUR`.
  Currencies are a **data-driven enum** (the list lives in a
  config source, not hardcoded in UI; adding a new currency does
  not require a code change — though MVP may ship with them
  hardcoded as long as the extension path is obvious).
- **FR-005**: The campaign-default currency is `RUB` in
  mat-ucheniya. Other campaigns may override this in a campaign
  setting (the setting key is new; see Assumptions). The form
  pre-fills the default; the user can change it per pool.

**Participants**

- **FR-006**: A pool has ≥ 1 participant. Each participant has
  a display name, optional `user_id` (campaign member link), a
  share amount (positive, 2-decimal), and a paid status (`paid`
  / `unpaid`) with optional `paid_at` timestamp.
- **FR-007**: Participants may be **campaign members** (picked
  from the members list — the picker shows display names and
  avatars) or **ad-hoc names** (free-text, no `user_id`). The
  picker MUST allow both.
- **FR-008**: The **author's payment-display information** (how
  others should pay them — e.g. "Tinkoff 2200...", "SBP +7...")
  is a free-text field on the pool, optional, shown at the top
  of the pool's detail view. It is **not** a structured
  payment-method entity; it's just a note. The author writes
  whatever is useful to copy into a banking app.

**Split mode**

- **FR-009**: The pool supports two split modes: **Equal**
  (total is divided evenly across participants) and **Custom**
  (author sets each participant's share by hand). The mode is a
  pool-level setting, not per-participant.
- **FR-010**: Edit permissions:
  - The pool **author** can edit every field of an `open` pool
    and flip paid/unpaid on any participant.
  - A **DM** of the pool's campaign can edit the pool as if
    they were the author (co-author rule).
  - Every other campaign member has **read-only** access to open
    pools. They cannot tick checkboxes, edit amounts, or
    add/remove participants.
  - Closed pools are read-only for everyone except via the
    explicit Reopen action (FR-027).
- **FR-011**: When **Equal** split produces a non-integer
  share, the amounts are rounded to 2 decimals and the rounding
  residual is absorbed by the **last participant in the
  participant list**. The form shows a visible chip on that
  participant (`↑X.XX`) so the rounding is transparent.
- **FR-012**: Switching split mode from **Equal** to **Custom**
  copies the currently-computed shares into per-participant
  custom fields (the author then edits them by hand). Switching
  from **Custom** back to **Equal** overwrites the custom values
  — the form warns before doing so.

**Paid status**

- **FR-013**: When the total changes or a participant is added
  / removed, **unpaid** shares re-split to match the new
  configuration. **Paid** shares do not change — they retain
  their `paid_at` timestamp and the amount paid at that time
  (stored as `paid_amount` snapshot on the participant row).
  The UI shows both numbers when they diverge (`должно 800
  RUB, заплачено 750`).
- **FR-014**: Undoing a paid mark (author taps an already-paid
  checkbox) clears `paid_at` and `paid_amount`; the participant
  row is treated as `unpaid` and the share re-enters the unpaid
  pool (for the purpose of FR-013's re-split rule on future
  total edits).
- **FR-015**: When the author is also a participant (default),
  their row is **auto-marked paid** at creation time with
  `paid_at = created_at`. The author cannot untick their own
  row. (They can exclude themselves from the split at creation
  time via the opt-out — see US1.3.)

**Pool lifecycle**

- **FR-016**: A newly created pool is `open`. The author can
  close it at any time via a confirm dialog. Closing records
  `closed_at = now`.
- **FR-017**: Closing a pool **does not auto-remove unpaid
  participants**. Unpaid rows remain in the pool with their
  status intact — the close is "we stopped collecting", not
  "we resolved every debt".
- **FR-027**: A closed pool can be reopened by the author (or a
  DM of the pool's campaign). Reopen clears `closed_at` and
  moves the pool back to the Open list.
- **FR-028**: A pool can be **soft-deleted** by its author (or a
  campaign DM). Soft-delete sets `deleted_at` and hides the pool
  from every view. No hard-delete in MVP.

**Visibility & views**

- **FR-018**: The campaign's **Сборы** view has two lists:
  "Открытые" (pools with `status = 'open'`, sorted by most
  recently updated) and "История" (pools with `status =
  'closed'`, sorted by `closed_at` descending). Soft-deleted
  pools appear in neither list.
- **FR-019**: The Сборы view header summarises the current
  user's open debts **per currency**, across all open pools in
  the current campaign (not across campaigns — see FR-024). The
  header reads: `Ты должен 1500 RUB` or `Ты должна 1500 RUB · 20
  USD` (mixed) or `Ничего не должен` (none). The user's pronoun
  form is NOT auto-inferred — the app uses a neutral plural
  form `Ты должен(а) …` unless campaign-settings override it
  (out of scope).
- **FR-020**: Each pool row in the list shows: title, currency
  + total, author name, session chip (if any), `open` date,
  progress bar (`paid / total`), and the current user's
  personal status chip (`— 750 RUB, неоплачено` / `✓ 750 RUB,
  оплачено` / `не участвуешь`).
- **FR-021**: The pool detail page shows: header (title,
  author, currency, total, session chip), the author's
  payment-info free-text, the participant list with paid/unpaid
  checkboxes, totals footer (`paid / total, remaining`), and
  the action row (close / reopen / delete / edit).
- **FR-022**: Every campaign member can see every pool in their
  campaign (open and closed). There is no per-pool ACL beyond
  "author + DM can edit, everyone else reads".

**Layout & mobile-first**

- **FR-023**: The pool creation form and the pool detail page
  are **mobile-first** — the form is usable on a narrow viewport
  with ≤ 3 fields above the fold (title, total, participants);
  the detail page shows author + progress bar + participant
  list without horizontal scroll.
- **FR-024**: The header-level "ты должен" summary is
  **per-campaign** in the MVP. A cross-campaign "My pools" view
  (US7) is a P3 follow-up.

**Data scope**

- **FR-025**: Pools belong to a campaign. Deleting a campaign
  (out of scope today) would soft-delete its pools; the data
  model MUST not allow orphan pools.
- **FR-026**: The model SHOULD tolerate author-account soft-
  deletion by displaying `Автор удалён` rather than erroring
  the page. DM-reassign-authorship is out of MVP scope.

---

### Key Entities

- **Pool** (`contribution_pools`): `id`, `campaign_id`,
  `author_user_id`, `session_id?`, `title`, `currency`,
  `total_amount` (DECIMAL), `split_mode` (`equal`|`custom`),
  `payment_info_note?`, `event_date?`, `status`
  (`open`|`closed`), timestamps (`created_at`, `updated_at`,
  `closed_at?`, `deleted_at?`).
- **Participant** (`contribution_participants`): `id`,
  `pool_id`, `user_id?` (nullable — ad-hoc rows), `display_name`
  (required — redundant with `auth.users.display_name` when
  `user_id` is set, but lets us show a stable name even if the
  member leaves the campaign), `share_amount` (DECIMAL),
  `paid` (bool), `paid_at?`, `paid_amount?` (snapshot — see
  FR-013), `created_at`, `updated_at`.

Note: this spec does not decide the exact table names, columns,
or constraints — those belong in `plan.md`. The above is the
conceptual entity model.

---

## Clarifications

_To be filled during the Clarify phase. Candidate open questions:_

1. **Author payment info as free-text vs structured.** MVP goes
   with free-text (FR-007). If later users want "copy IBAN to
   clipboard" or "link to SBP", this graduates to a small
   sub-model. Not in MVP.
2. **Cross-campaign pools.** Explicitly out of scope (Non-goals
   + FR-024). If a single IRL event spans two campaigns, the
   author creates two pools. Is this the right call? Likely
   yes — two campaigns usually have non-overlapping member lists
   anyway, so merging them into one pool would create
   participant rows that "don't belong" to either campaign.
3. **Currency list extensibility.** MVP ships with RUB / USD /
   EUR. Adding a new currency — is it a code change or a
   settings change? Recommend: code change is acceptable for
   now (just an enum literal add + no schema change), formalise
   into a table if the list exceeds 5–6 entries.
4. **Campaign-default currency.** mat-ucheniya defaults to RUB.
   If other campaigns run this app, a campaign-level setting
   "default pool currency" lives in `campaign_settings` (which
   already exists for auth-related settings). Confirm the key
   name.
5. **"My pools" cross-campaign view.** US7 is P3. Needed for
   MVP? No. Skip in initial implementation; add later if
   requested.
6. **DM as co-author.** FR-010 says DMs can edit any pool in
   their campaign. Is this the desired rule, or should the DM
   only have read access on pools they didn't author? Current
   design: DM is always a co-author (matches the general "DM
   sees all, can fix all" mental model in spec-006).
7. **Ad-hoc participant linking.** US6 allows linking an ad-hoc
   row to a user_id post-hoc. Required in MVP? Recommend yes —
   it's a small addition on top of the edit flow and avoids the
   "I added Петя as text and now I want to connect him" gap.
8. **Notifications.** Explicitly no push / email in MVP. But
   should the pool detail page show a "last updated: 2 hours
   ago" timestamp so participants can tell if the author has
   been checking their pool? Recommend yes — it's free and
   useful. Covered by the `updated_at` column (FR-001).

---

## Success Criteria

**Quantitative**:

- **SC-001**: Creating a pool with 6 equal-split participants
  is completable in **≤ 15 seconds** on a mobile device from a
  cold navigation. Measured by a hand-walkthrough; no automated
  benchmark required.
- **SC-002**: Marking a participant paid from the pool list
  (not detail) is **1 tap** — no nav, no modal, no confirm.
  Marking paid from the detail page is 1 tap.
- **SC-003**: On a campaign with 10 open pools and 20 campaign
  members, the Сборы tab renders in **under 500 ms server-side**
  on mat-ucheniya's production deploy. Measured informally (eye
  test); if it ever feels slow, profile.
- **SC-004**: A campaign member can answer "do I owe anything
  right now" in **1 navigation step** from the campaign home
  (the Сборы tab is directly in the campaign nav).

**Qualitative**:

- **SC-005**: Andrey uses the pool to track the next pizza /
  miniatures / room-rental spend instead of Telegram. If he
  drops back to Telegram for these, the feature has failed.
- **SC-006**: A new campaign member, on first look at the Сборы
  tab, can figure out what a pool is and whether they owe
  anything without reading docs.
- **SC-007**: The feature does not leak into the in-game
  bookkeeping UI. A player on the PC page or the /accounting
  page sees no "Сборы" chrome — these concerns stay separated.

---

## Assumptions & Non-Goals

**Assumptions**:

- Every campaign member has a user account (spec-006 is shipped;
  ad-hoc participant rows are the only non-account participants).
- The app's existing `display_name` field is suitable as the
  participant name for linked rows. Ad-hoc rows carry a
  redundant `display_name` on the participant row itself so
  display doesn't break if a member is later removed from the
  campaign.
- Currencies are stored as 3-letter ISO codes (`RUB`, `USD`,
  `EUR`). Amount precision is 2 decimals; larger precision is
  unneeded for real-money collections.
- The existing campaign-member model has `display_name` and
  (optional) avatar — both already used in spec-006.
- Locale-specific number formatting: the app already handles
  russian `1 500,50` vs english `1,500.50` displays; this spec
  reuses that formatter (no new localisation work).

**Explicitly non-goals (reiterated)**:

- Payment processing, payment-provider integration, payment
  confirmation via bank API, receipt parsing.
- Reminders, notifications, email, telegram bot integration.
- FX conversion, currency equivalents, "worth in RUB" display.
- Cross-campaign pools.
- Integration with the in-game `transactions` ledger.
- Auto-close, auto-archive, or auto-delete of old pools.
- Role-gating pool creation (DM-only). MVP: any member can
  create a pool.
- Recurring / template pools.
- Inline commentary / discussion inside a pool.
- Exporting pools to CSV / XLSX (could be trivially added later,
  not MVP).
- Hard deletion of pools. MVP uses soft-delete only.

---

## Incremental Roadmap

If shipped as a single release, the implementation order is
dictated by user-story priorities:

1. **MVP (P1)**: schema + Pool CRUD (create/close/delete) +
   Participant CRUD + mark-paid checkbox + campaign Сборы tab
   with Open/History split + per-user "ты должен" header. This
   covers US1, US2, US3, US4.
2. **Polish (P2)**: edit-total / edit-participant-list flow with
   unpaid re-split and paid-snapshot (US5). Ad-hoc participant
   link-to-user (US6).
3. **Power (P3)**: cross-campaign "My pools" view (US7). Reopen
   a closed pool (US8). Campaign-default currency setting
   (already tee'd up in assumptions).

If the user wants a thinner first release, stop after MVP; the
P2/P3 items are live-able gaps.

---

## Constitution check

- ✅ **I. Петля как ядро** — N/A here. A Сбор is intentionally
  **outside** the loop. Documented in non-goals.
- ✅ **II. Атомарность** — a paid-status flip is one record
  update. Pool edit is one form save.
- ✅ **III-b. Плоская навигация** — Сборы is a campaign-level
  tab, not a nested hierarchy. Pools do not become nodes in the
  entity graph.
- ✅ **IV. Данные-первичны** — pool state (who paid what) lives
  in a table; UI is a read lens.
- ✅ **V. Event sourcing** — the mark-paid action mutates a bool
  in place. Not full event sourcing; deliberate simplification.
  The cost of full sourcing (who ticked when, undo history) is
  not justified for this side feature. Noted as future concern.
- ✅ **VI. Читалка** — mobile-first per FR-023. ≤ 3 fields for
  the creation form above the fold.
- ✅ **VII. Каждый релиз играбелен** — MVP alone is the whole
  Сборы feature. P2 and P3 are improvements, not
  prerequisites.
- ✅ **VIII. Простота стека** — same Supabase tables + Next.js
  pages; no new infra.
- ✅ **IX. Универсальность** — currency and campaign-default
  stay in campaign settings; no mat-ucheniya hardcodes.
- ✅ **X. Конституция кампании** — N/A.

---

## References

- `.specify/memory/constitution.md` — v3.0.0.
- `.specify/memory/bookkeeping-roadmap.md` — in-game ledger
  series (009-015). **This spec is deliberately outside** that
  series — bookkeeping-roadmap treats money as an in-game
  resource, spec-016 treats money as a real-world utility.
- `.specify/specs/006-auth-and-roles/spec.md` — campaign
  member / DM role semantics reused in FR-010.
- `.specify/specs/009-loop-progress-bar/spec.md` — session
  participants picker UX reused in US1 / US6.

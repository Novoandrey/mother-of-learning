# Feature Specification: Loop Progress Bar + Session Packs

**Feature Branch**: `009-loop-progress-bar`
**Created**: 2026-04-23
**Status**: Draft
**Input**: First spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Makes loop time and party
composition first-class data, introduces a visual loop progress bar
with stacked session rows.

## Context

The "Mother of Learning" setting runs on a fixed-length time loop
(30 days by default). The campaign has 29 PCs who play in parties of
4-7. Sessions can overlap in in-game time: party A plays days 7-9,
then party B plays days 5-8. Today the in-game date on a session is
free text (`game_date`, e.g. `"Day 1-2"`), and there is no field for
the participating party. As a result, the UI cannot show loop
progress and cannot compute "how far through the loop a given PC
has reached."

This spec replaces the free-text time field with numbers
(`day_from`/`day_to`), attaches a set of participant PC nodes to
each session, and renders a visual loop progress bar where party
overlap is obvious.

It is the foundation for the rest of the Bookkeeping roadmap —
transactions (spec-010+) will attach to `session_id` and carry an
explicit `day_in_loop`.

---

## User Scenarios & Testing

### User Story 1 — DM edits a session with day range and party (Priority: P1)

When a DM creates or edits a session, they set the in-game day
range and pick which PCs participated. The "Day" field stops being
free text ("Day 1-2") and becomes two numeric inputs (1..30). A new
"Participants" multi-select appears, letting the DM pick from the
campaign's PC nodes.

**Why this priority**: nothing else in the feature can render
without these two pieces of data. This is a data change, not a UI
polish — it's the base of the entire bookkeeping roadmap.

**Independent Test**: the session form lets the DM set
day-from/day-to and select 4-7 PCs; the values persist and are
visible after reload.

**Acceptance Scenarios**:

1. **Given** a new session form is open, **When** the DM sets
   `day_from = 7`, `day_to = 9` and checks 5 PCs, **Then** the
   session saves with those values, and on next open of the
   session page exactly those 5 PCs appear as participants and
   "Days 7-9" shows in the card header.
2. **Given** an existing session with `day_from = 5`, `day_to = 8`,
   **When** the DM changes `day_to` to `10` and removes one PC,
   **Then** changes persist and the participants list reflects
   the new state.
3. **Given** the DM sets `day_from = 9`, `day_to = 7` (inverted),
   **When** they try to save, **Then** the form blocks save and
   shows an inline error "day_from cannot exceed day_to".
4. **Given** the DM sets `day_from = 0` or `day_to = 35`,
   **When** they try to save, **Then** the form blocks save and
   says the day must be within the loop length.
5. **Given** a session with `day_from = day_to = 5` (single-day),
   **When** the DM saves, **Then** this is valid — the session is
   marked as happening on a single day.

---

### User Story 2 — Everyone sees a loop progress bar with party overlaps (Priority: P1)

On the loop page (`/c/[slug]/loops?loop=N`), a horizontal progress
bar renders under the loop title. The horizontal axis is days
1..`length` (`length` = loop length, default 30). Each session
renders as a horizontal segment from `day_from` to `day_to`. If
two sessions overlap in days, they are laid out on different
horizontal lanes so overlap is visually obvious. Hovering
(desktop) or tapping (mobile) a segment reveals the session
number, title, day range, and participant names.

**Why this priority**: core user value — understand loop state in
30 seconds with no scrolling through text. "Reader, not a
dashboard" (constitution principle VI).

**Independent Test**: open the loop page — see a bar with day
ticks 1..30, segments for every dated session, tooltip on
hover/tap shows the party.

**Acceptance Scenarios**:

1. **Given** a loop has 3 sessions `[5-8, 7-9, 12-14]`, **When**
   the user opens the loop page, **Then** they see three
   segments; the 5-8 and 7-9 segments sit on different lanes
   (overlap visible), 12-14 is on its own.
2. **Given** an empty loop (no sessions or all sessions lack
   day_from/day_to), **When** the page loads, **Then** an empty
   bar with day ticks 1..30 renders with the caption "no dated
   sessions yet".
3. **Given** a session has 5 participants, **When** the user
   hovers (desktop) or taps (mobile) its segment, **Then** they
   see: session number, title, day range, list of participant
   names.
4. **Given** a played session has no `day_from`/`day_to` (legacy
   record), **When** the bar renders, **Then** that session does
   not appear on the bar but is shown as a separate "undated"
   badge above/below the bar.
5. **Given** a loop with `status='current'`, **When** the page
   loads, **Then** a dashed marker on the bar highlights the
   **loop frontier** (`max(day_to)` across all its sessions) with
   a caption "reached day N".

---

### User Story 3 — Player sees how far their PC has gone in the current loop (Priority: P2)

On a character node's catalog detail page, a "Current loop" block
shows the character frontier = `max(day_to)` over sessions of the
current loop where this PC is a participant. If the PC has not
played in the current loop at all, the block says "has not played
in this loop yet".

**Why this priority**: gives a player context ("my story has
reached day 8"). Cheap to build, high value for the player mode.
Without this, spec-010 (ledger) would compute balances "at an
unspecified point in time."

**Independent Test**: on the PC page you see text like "Loop 4:
up to day 8 (sessions #6, #7)".

**Acceptance Scenarios**:

1. **Given** PC "Marcus" was in session #6 (days 3-5) and session
   #7 (days 6-9) of loop 4, **When** Marcus's card opens,
   **Then** it shows "Loop 4: up to day 9" with links to #6, #7.
2. **Given** PC "Lex" was not in any session of loop 4, **When**
   Lex's card opens, **Then** it shows "Loop 4: has not played
   yet".
3. **Given** no loop has `status='current'`, **When** any PC card
   opens, **Then** the "Current loop" block is hidden.

---

### Edge Cases

- **PC re-appears in overlapping sessions.** A PC may be in
  `participants` of sessions whose day ranges overlap. Technically
  allowed, not blocked. Visually — nothing special, two segments
  on different lanes.
- **Retrograde (PC in a later-added session that ends earlier).**
  E.g., PC was in a session with days 7-9, then the DM adds them
  to a session with days 5-6. Technically not blocked. A visual
  warning icon ⏪ is **out of scope** for this spec and is planned
  for spec-010 (ledger), where retrograde matters for balance
  computation.
- **Sessions without `day_from`/`day_to`.** Production already
  contains sessions with free-text `game_date` and no numbers.
  They must remain readable and editable without data loss (page
  opens, data not dropped), but do not participate in the
  progress bar — they render as a separate "undated" badge.
  Automatic parsing of `game_date` into numbers is **out of
  scope** — the DM fills numbers manually; the UI surfaces an
  "undated sessions" list as a nudge.
- **Empty party (`participants = []`).** Allowed. The session
  does not count toward character frontier for any PC.
- **Off-loop session (`loop_number IS NULL`).** Does not appear
  on any loop progress bar, but may still have
  `day_from`/`day_to` — rare but allowed for one-off sessions.
  Shown in the general sessions list as-is.
- **Different loops have different lengths.** A loop may be
  short (e.g. a test loop). The progress bar renders per the
  specific loop's length. If length is not set — default to 30.
- **PC removed from a party retroactively.** Character frontier
  is computed on the fly (aggregate query), so it just
  disappears from the PC card.
- **Two DMs edit the same session simultaneously.**
  Last-write-wins (as elsewhere in the project). This spec does
  not attempt to solve it — see `backlog.md` / Spec-007 retro.

---

## Requirements

### Functional Requirements

**Data**

- **FR-001**: A session MUST have `day_from` and `day_to` fields
  (both nullable; integers; `day_from ≤ day_to`; both within
  `1..loop.length` for loop-bound sessions).
- **FR-002**: A session MUST have a set of participant PC nodes.
  Order does not matter. A given PC appears at most once per
  session.
- **FR-003**: A loop MUST have a length-in-days field (nullable
  in storage for back-compat; UI falls back to 30 when absent).
- **FR-004**: Existing sessions without `day_from`/`day_to` MUST
  remain readable and editable without data loss. The legacy
  free-text `game_date` is preserved; new UI shows it as a
  read-only caption.

**Session editor**

- **FR-005**: The session create/edit form MUST have "Day from"
  and "Day to" numeric inputs (in addition to or instead of the
  legacy free-text field).
- **FR-006**: The form MUST have a "Participants" multi-select
  populated from the campaign's PC nodes. The selector MUST
  support search (the campaign has 29+ PCs). Grouping is not
  required.
- **FR-007**: The form MUST validate `day_from ≤ day_to` and
  range `1..loop.length`. Errors display inline and block save
  until fixed.

**Loop progress bar**

- **FR-008**: The loop page MUST render a progress bar with a
  day 1..length axis. On mobile, the bar scrolls horizontally if
  it overflows.
- **FR-009**: Every session of the loop with `day_from`/`day_to`
  set MUST render as a horizontal segment on the bar. Segments
  of different sessions MUST be visually distinct (different
  lanes / stack / color / border — concrete styling in
  `plan.md`).
- **FR-010**: When two sessions overlap on days, the overlap
  MUST be visually obvious (segments do not fully hide each
  other).
- **FR-011**: Interaction (hover on desktop / tap on mobile) on
  a segment MUST reveal: session number, title, day range,
  participant names.
- **FR-012**: For a loop with `status='current'`, the bar MUST
  mark the loop frontier (`max(day_to)` across its sessions)
  with a caption "reached day N". Past/future loops — no
  frontier marker.
- **FR-013**: Sessions of the loop without `day_from`/`day_to`
  MUST appear above/below the bar as "session #N — undated"
  badges so they are not lost from the UI.

**Character card**

- **FR-014**: The PC node detail page MUST render a "Current
  loop" block with the character frontier, if the campaign has a
  loop with `status='current'`.
- **FR-015**: The character frontier shows the maximum `day_to`
  across sessions of the current loop where the PC is a
  participant, and links to up to 3 most recent such sessions
  (excess as "+N more").
- **FR-016**: If the PC was in no session of the current loop,
  the block shows "has not played in this loop yet".

**Persistence and API**

- **FR-017**: The new data (`day_from`, `day_to`,
  `length_days`, participants) MUST live in the existing
  graph infrastructure: after spec-003, sessions and loops
  are nodes (data in `nodes.fields` jsonb), and relationships
  between nodes are edges (`edges` table). No new tables are
  created. Exact field keys and edge-type slug — in
  `plan.md`.
- **FR-018**: Server functions fetching a session and a loop's
  sessions MUST return `day_from`, `day_to`, `participants`
  (array of `{id, title}`) in a single query (no N+1).
- **FR-019**: Participant edges MUST inherit the same access
  rules as any other edge in the campaign graph (already set
  up in migrations 024/031). No new RLS policies are
  required.

---

### Key Entities

- **Session** (existing node, `type='session'`). Gains two
  attributes: `day_from: int?`, `day_to: int?`. Invariant: both
  set or both NULL; `day_from ≤ day_to`; both within
  `1..loop.length_days`.
- **Loop** (existing node, `type='loop'`). Gains:
  `length_days: int?`. If NULL — UI defaults to 30.
- **Participation** (new relationship). An edge with the
  semantics "PC participated in a session." At most one such
  edge per (session, PC) pair. Slug, direction, and storage
  details — in `plan.md`.
- **Loop Frontier** (derived, not stored). `max(day_to)`
  across a loop's sessions.
- **Character Frontier** (derived, not stored). `max(day_to)`
  across the current loop's sessions where the PC is a
  participant.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: A DM creates/edits a session with 5 participants
  and a day range in ≤ 30 seconds (no manual PC lookup in
  another tab).
- **SC-002**: Opening a loop page with 6-10 sessions, the user
  sees the entire progress bar without additional clicks (one
  scroll-screen on desktop; horizontal scroll on mobile).
- **SC-003**: Character frontier on the PC card is computed in
  ≤ 1 aggregate query (no N+1 over sessions).
- **SC-004**: No existing session without `day_from`/`day_to`
  becomes inaccessible after the migration deploys (0 x HTTP
  500 on session and loop pages).
- **SC-005**: Loop page with 10 sessions renders with TTFB ≤
  500ms on mat-ucheniya (Vercel edge, current caching
  pattern).

---

## Assumptions

- Loop length for "Mother of Learning" is 30 days. This is the
  default for a new loop; other campaigns configure it later
  via UI (out of scope for this spec — the storage key exists
  in the migration, the edit UI is a separate ticket). Loops
  without `length_days` set render as 30-day loops.
- PC nodes are `nodes` with `type='character'`. The campaign
  already knows its PCs via nodes + campaign_id.
- The legacy text `game_date` is **not** parsed or
  auto-converted. The DM sees a list of "undated" sessions and
  fills numbers by hand. Parsing "Day 5-8" → `day_from=5,
  day_to=8` is not in scope.
- The progress bar is loop-scoped only. A campaign-wide
  timeline across multiple loops is out of scope.
- Retrograde warning (⏪) is planned for spec-010 (requires
  transaction data).
- Realtime progress bar updates are not required —
  polling/SSR is enough.

---

## Out of Scope

- Parsing the legacy free-text `game_date` into numbers.
- Retrograde detector and ⏪ warning.
- Editing loop length from UI in this spec (the storage field
  is created; the editor is a separate ticket).
- Visualizing off-session events (lands with spec-010).
- Mobile player mode (spec-007 stage 5) — separate roadmap.
- Multi-range day selection (e.g., session spans day 3 and
  day 7 but not 4-6). The range is always contiguous
  `[day_from..day_to]`.
- Any RLS changes beyond the new edge type (which inherits
  the existing `edges` policies).

---

## Clarifications

### Round 1 — 2026-04-23

**Q1. Participants picker scope: only player-owned characters, or
any `type='character'` node?**
**A**: Only PCs. The filter is an inner join against
`node_pc_owners` (introduced in migration 027) — NPCs, monsters,
and other character-typed nodes are excluded, even if an NPC
tagged along in-fiction. This keeps the picker short and matches
the bookkeeping intent (ledger actors are players).

**Q2. Mobile interaction for session segment on the progress bar:
inline row expand, bottom sheet, or floating tooltip?**
**A**: Bottom sheet. Tapping a segment opens a modal sheet from
the bottom with the same content as the desktop tooltip (session
number, title, day range, participant names). Dismissed by swipe
down or backdrop tap. Rationale: cleaner for touch, avoids layout
reflow on the bar itself.

**Q3. "Undated" badges for sessions without `day_from`/`day_to`:
above or below the progress bar?**
**A**: Below the bar, so the bar itself sits closest to the loop
title (primary content stays above the fold).

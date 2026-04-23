# Implementation Plan: Loop Progress Bar + Session Packs

**Branch**: `009-loop-progress-bar` | **Date**: 2026-04-23 | **Spec**:
`.specify/specs/009-loop-progress-bar/spec.md`

## Summary

Two numeric fields (`day_from`, `day_to`) and one relationship
(session → participant PCs) attached to existing session and loop
nodes via `nodes.fields` (jsonb) and a new edge type. No new
tables. UI adds a horizontal per-loop progress bar with stacked
lanes, a participants multi-select in the session form, and a
"Current loop" block on PC detail pages.

One migration (`032_session_packs_and_loop_length.sql`) is
idempotent and non-destructive: new `edge_types` row, extended
`node_types.default_fields` for `session` and `loop`. No ALTER
TABLE on user data.

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres) + Tailwind
v4. Working dir inside repo: `mat-ucheniya/`.

**New dependencies**: none. Uses existing `@supabase/ssr`,
`lucide-react`, React 19.

**Auth/RLS**: unchanged. Participant edges reuse the `edges`
policies set up in migrations 024/031 (campaign members can
read/write edges in their campaign).

**Caching**: existing sidebar cache
(`lib/sidebar-cache.ts`, 60s) — session edits already invalidate
it. Participant edits re-use the same invalidation hook.

## Constitution Check

- ✅ **I. Loop as core** — this spec makes loop time a
  first-class model.
- ✅ **III-b. Flat navigation** — day is NOT a node; sessions
  remain nodes, PCs remain nodes.
- ✅ **IV. Data-first** — all new data lives in existing
  `nodes.fields` + `edges`, UI reads.
- ✅ **V. Event sourcing readiness** — no destructive writes;
  sets the stage for transactions (spec-010).
- ✅ **VI. Reader** — mobile-first loop progress bar, minimal
  form fields.
- ✅ **VII. Every release shippable** — MVP = US1+US2, US3 is a
  cheap add-on that can ship in the same PR or be deferred.
- ✅ **VIII. Simple stack** — no new libraries.
- ✅ **IX. Universal** — `length_days` lives on the loop, not
  hardcoded anywhere.

## Data Model

### `nodes.fields` additions (jsonb, no schema change)

**Session node (`type='session'`)** — existing keys preserved,
two new keys appended:

| Key        | Type                 | Notes                                          |
|------------|----------------------|------------------------------------------------|
| `day_from` | integer, stored as number | 1..`loop.length_days`. NULL/missing ⇒ undated. |
| `day_to`   | integer              | `day_to ≥ day_from`. Both set or both missing. |

**Loop node (`type='loop'`)** — one new key:

| Key           | Type    | Notes                                  |
|---------------|---------|----------------------------------------|
| `length_days` | integer | Default UI fallback = 30 when missing. |

Legacy `game_date: text` stays as-is. UI may render it when
`day_from`/`day_to` are absent.

### New edge type: `participated_in`

- `slug`: `participated_in`
- `is_base`: `true` (global, shared across campaigns — like
  `contains`)
- `label`: `Участник сессии` (human-readable)
- **Direction**: `source_id` = session node, `target_id` = PC
  character node.
- **Uniqueness**: relies on the existing
  `UNIQUE (source_id, target_id, type_id)` on `edges` — one
  participation per (session, PC) pair.
- **Lookup patterns**:
  - Session → participants: `edges WHERE source_id=$session AND type_id=$pid` (uses `idx_edges_source`).
  - PC → sessions played: `edges WHERE target_id=$pc AND type_id=$pid` (uses `idx_edges_target`).

Rationale for edges over a dedicated table:
- Consistent with spec-003 architecture (everything's a node or
  an edge).
- Free RLS (inherits `edges` policies from migration 024/031).
- Free indexes (`idx_edges_source`, `idx_edges_target`).
- No extra invalidation surface.

### Derived values (not stored)

- **Loop frontier**:
  `MAX((fields->>'day_to')::int)` across session nodes in the
  loop (via `contains` edges from loop → session).
- **Character frontier**:
  same, restricted to sessions where the PC is a
  `participated_in` target.

## Server Layer

### `lib/loops.ts` changes

Extend the `Session` type:

```ts
export type Session = {
  // existing fields...
  day_from: number | null
  day_to: number | null
  participants: { id: string; title: string }[]
}
```

Extend `Loop`:

```ts
export type Loop = {
  // existing fields...
  length_days: number  // default 30 if missing in fields
}
```

Change `nodeToSession()` to parse `day_from`/`day_to` from
`fields` and accept a `participants` array injected by the
caller.

### New / changed query functions

1. **`getSessionsByLoop(campaignId, loopNumber)`** — now does two
   queries:
   - Fetch session nodes (as before).
   - Fetch all `participated_in` edges where `source_id IN
     (sessionIds)`, join to `nodes` for PC titles. Group by
     `source_id` into a `Map<sessionId, Participant[]>`.

   Hydrate sessions with participants. Cost: 2 queries + 1 join,
   regardless of session count. Satisfies SC-003.

2. **`getSessionById(id)`** — same pattern: one row + one edges
   query scoped to that session.

3. **`getLoopFrontier(loopId)`** — new helper. SQL-ish:

   ```sql
   SELECT MAX((n.fields->>'day_to')::int) AS frontier
   FROM edges e
   JOIN nodes n ON n.id = e.target_id
   WHERE e.source_id = $loopId
     AND e.type_id = (SELECT id FROM edge_types WHERE slug='contains' AND is_base)
     AND n.fields->>'day_to' IS NOT NULL;
   ```

   Implemented with Supabase client via RPC or by fetching loop
   sessions and reducing in app code (we already fetch them for
   the page render — reuse).

4. **`getCharacterFrontier(characterId, loopId)`** — new
   helper:

   ```sql
   SELECT MAX((s.fields->>'day_to')::int) AS frontier,
          array_agg(s.id ORDER BY (s.fields->>'session_number')::int DESC) AS session_ids
   FROM edges p                           -- participated_in
   JOIN nodes s ON s.id = p.source_id
   JOIN edges c ON c.target_id = s.id     -- contains (loop → session)
   WHERE p.target_id = $characterId
     AND p.type_id = (SELECT id FROM edge_types WHERE slug='participated_in' AND is_base)
     AND c.source_id = $loopId
     AND c.type_id  = (SELECT id FROM edge_types WHERE slug='contains' AND is_base);
   ```

   Either via Postgres function (cleaner, faster) or two chained
   Supabase queries. **Decision**: two queries in app code
   first; promote to RPC only if SC-005 TTFB budget is
   missed.

### Write paths

**Server action**
`updateSessionParticipants(sessionId, characterIds: string[])`
in `app/actions/sessions.ts`:

1. Membership check (reuse existing helper).
2. `delete from edges where source_id=sessionId and type_id=participated_in_type_id`.
3. `insert into edges (source_id=sessionId, target_id=eachPc, type_id=participated_in_type_id, campaign_id=...)`.
4. `invalidateSidebar(campaignId)` — sidebar may surface
   session titles; safer to invalidate.

Not wrapped in a Postgres transaction (Supabase JS client
limitation). Race window = sub-second. Last-write-wins matches
project convention (see AGENTS.md note on shared-world
editing).

**Day fields** (`day_from`, `day_to`) are saved through the
existing generic node update path — they are just more keys in
`fields`. No new server action.

**Loop length_days** — same: stored in loop node's `fields`.
No UI in this spec.

## UI Components

### `components/participants-picker.tsx` (new, client)

Props: `campaignId`, `initialSelectedIds: string[]`,
`onChange(ids: string[])`. Internally:
- fetches **PCs only** on mount via server action
  `getCampaignPCs(campaignId)` — inner-joins
  `nodes` with `node_pc_owners` (migration 027) filtered to
  `type='character'`. NPCs and monsters excluded by design (see
  spec Clarifications Q1).
- Returns `{id, title, player_display_name?}[]`, sorted by
  `title`.
- text input filters the list client-side
- checkbox per row; selected sticky at top
- shows count `5 / 29 selected`

Renders as a dropdown that opens on click (no external library —
Tailwind + React state). Mobile: full-screen sheet variant when
viewport < 640px.

### `components/loop-progress-bar.tsx` (new, client)

Props: `loop: { id, length_days, status }`, `sessions: Session[]`
(already hydrated with `day_from/day_to/participants`).

Algorithm: **lane assignment** (greedy):
1. Filter to dated sessions, sort by `day_from ASC`, then
   `day_to ASC`.
2. For each session, pick the first lane where no previously
   placed session overlaps in `[day_from, day_to]`. If no lane
   fits, create a new one.
3. Result: `Map<sessionId, laneIndex>` + total lane count.

Render:
- Outer `<div class="overflow-x-auto">` with a grid of
  `length_days` columns on desktop; min-width ≈ `length_days *
  24px` on mobile so it scrolls.
- Day axis: top row of small numbered cells (1, 2, 3, …, 30).
  Every 5th bold. Wider tap target on mobile.
- Each lane = one horizontal track ~24px high.
- Each session = `<div>` absolutely positioned by CSS
  `grid-column: day_from / day_to + 1` (numeric grid line
  approach).
- Segment style: rounded rectangle, subtle border, session
  number label inside.
- Hover (`group-hover:`) or click (mobile): tooltip card with
  session #, title, day range, participant names.
- Loop frontier (if `status='current'`): dashed vertical line
  after column `frontier + 1` with caption "dошли до дня N".
- Undated sessions: rendered **below** the bar as a pill-row —
  `"Undated: #6, #7"` with links to those session pages.

Visual reference for size: on desktop, 30-day bar ≈ 720px; on
375px mobile, horizontal scroll with ≈ 24px per day.

**Tooltip placement**:
- Desktop — floating card below the segment, positioned via
  `group-hover` + absolute positioning.
- Mobile — **bottom sheet** (full-width modal sliding up from
  the bottom). Opens on segment tap; dismissed by swipe-down or
  backdrop tap. Same content as desktop tooltip. Implemented
  with a small controlled `<div>` + CSS transform, no external
  library.

### Session form changes

Existing form lives in the generic catalog create/edit flow
(`components/create-node-form.tsx` + `NodeFormField`). Changes:

1. `NodeFormField` gains handling for `day_from`/`day_to` —
   render as side-by-side numeric inputs when
   `typeSlug==='session'` and `fieldKey==='day_from'` (we show
   both in a single custom widget via a special-case early
   return, same pattern as `loop_number` dropdown).
2. Add a separate section below the fields list — a rendered
   `<ParticipantsPicker />` driven by a new state on the form
   (not part of `fields`, saved via the separate server
   action).
3. `lib/node-form-constants.ts`:
   - `FIELD_LABELS`: add `day_from: 'День от'`, `day_to: 'День
     до'`, `length_days: 'Длина петли (дней)'`.
   - `NUMBER_FIELDS`: add `'day_from'`, `'day_to'`,
     `'length_days'`.
   - `fieldPriority`: put `day_from/day_to` right after
     `session_number`, before `played_at`.
4. Inline validation (client-side) in the form before submit:
   - both empty OR both set
   - `1 ≤ day_from ≤ day_to ≤ loopLength`
   - `loopLength` resolved from the session's loop's
     `fields.length_days`, fallback 30.

### PC detail changes

`components/node-detail.tsx`: when `node.type === 'character'`
AND a current loop exists, render a `<CharacterFrontierCard
characterId={} loopId={} loopNumber={} />` block.

**`components/character-frontier-card.tsx`** (new, server
component): queries `getCharacterFrontier`, renders:
- "Петля {N}: до дня {frontier}" or "Петля {N}: ещё не играл"
- Up to 3 session links, `+N more` if >3

### Session detail page tweaks

`app/c/[slug]/sessions/[id]/page.tsx`: in header, render
`Дни {day_from}-{day_to}` chip when set, otherwise fall back
to `game_date` caption. Participant list rendered as a row of
character-node links below the header.

## Migration (SQL sketch)

File: `mat-ucheniya/supabase/migrations/032_session_packs_and_loop_length.sql`

```sql
-- Migration: 032_session_packs_and_loop_length
-- Feature: spec-009 — Loop progress bar + session packs.
-- Non-destructive. Idempotent. No data migration.

BEGIN;

-- 1. New base edge type for session participation.
INSERT INTO edge_types (slug, label, is_base, campaign_id)
VALUES ('participated_in', 'Участник сессии', true, NULL)
ON CONFLICT (slug) WHERE is_base = true DO NOTHING;

-- 2. Extend default_fields for session node types so that new
--    sessions get empty day_from/day_to by default (so the
--    editor form renders the inputs without extra logic).
UPDATE node_types
SET default_fields = default_fields
    || jsonb_build_object('day_from', '', 'day_to', '')
WHERE slug = 'session'
  AND NOT (default_fields ? 'day_from');

-- 3. Extend default_fields for loop node types with length_days.
UPDATE node_types
SET default_fields = default_fields
    || jsonb_build_object('length_days', 30)
WHERE slug = 'loop'
  AND NOT (default_fields ? 'length_days');

COMMIT;
```

Notes:
- No `ALTER TABLE`. Strictly additive.
- `default_fields` change only affects **new** nodes going
  through `default_fields`-aware code paths; existing nodes are
  untouched.
- Rollback trivial: delete the `edge_types` row; revert
  `default_fields` via a compensating UPDATE if needed.

## File Plan

```
mat-ucheniya/
├── supabase/migrations/
│   └── 032_session_packs_and_loop_length.sql        (new)
├── lib/
│   ├── loops.ts                                     (modify — types + participants hydration)
│   ├── node-form-constants.ts                       (modify — labels + priority)
│   └── sessions.ts                                  (new — server actions for participants)
├── app/
│   └── actions/
│       └── sessions.ts                              (new — updateSessionParticipants)
│       └── characters.ts                            (new — getCampaignPCs)
├── components/
│   ├── participants-picker.tsx                      (new, client)
│   ├── loop-progress-bar.tsx                        (new, client)
│   ├── loop-progress-bar-lanes.ts                   (new — pure lane assignment, unit-testable)
│   ├── character-frontier-card.tsx                  (new, server)
│   ├── node-form-field.tsx                          (modify — day_from/day_to widget)
│   ├── create-node-form.tsx                         (modify — embed ParticipantsPicker when type=session)
│   └── node-detail.tsx                              (modify — render CharacterFrontierCard for type=character)
└── app/c/[slug]/
    ├── loops/page.tsx                               (modify — render LoopProgressBar)
    └── sessions/[id]/page.tsx                       (modify — day chip + participants row)
```

## Invalidation Contract

- `updateSessionParticipants` → `invalidateSidebar(campaignId)`
  (session title itself doesn't change, but safer and consistent).
- `day_from`/`day_to` edits flow through the existing generic
  node update server action — already invalidates sidebar.
- Loop page (`/c/[slug]/loops`) is already `export const dynamic
  = 'force-dynamic'`, no additional invalidation needed.

## Validation Rules (central)

Single source of truth in `lib/session-validation.ts` (new):

```ts
export function validateDayRange(
  day_from: number | null,
  day_to: number | null,
  loopLength: number
): string | null {
  if (day_from == null && day_to == null) return null   // both empty = OK
  if (day_from == null || day_to == null) return 'Set both day_from and day_to or neither'
  if (!Number.isInteger(day_from) || !Number.isInteger(day_to)) return 'Days must be integers'
  if (day_from < 1) return 'day_from must be ≥ 1'
  if (day_to > loopLength) return `day_to must be ≤ ${loopLength}`
  if (day_from > day_to) return 'day_from cannot exceed day_to'
  return null
}
```

Used by:
- client-side form (inline error)
- server action (defense in depth)

## Open Questions

None blocking. Flagging two small decisions made in this plan
that I'm happy to revisit:

1. **Lane assignment is greedy by `day_from` ASC.** Alternative
   is "most-overlapping-first" for tighter packing, but greedy
   is predictable and deterministic (DM sees stable lanes as
   sessions are edited). Keeping greedy.
2. **Character frontier uses two chained queries, not a
   Postgres RPC.** Simpler, passes the SC-005 budget on
   current data volume (29 PCs × up to ~20 sessions per loop).
   Upgrade to RPC only if profiling shows need.

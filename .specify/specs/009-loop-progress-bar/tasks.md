# Tasks: Loop Progress Bar + Session Packs

**Input**: `spec.md`, `plan.md` in `specs/009-loop-progress-bar/`
**Updated**: 2026-04-23
**Tests**: Manual, against the Acceptance Scenarios in `spec.md`.
No unit tests except the pure lane-assignment function.

## Organization

Phase 1 (migration) blocks all server/UI work.
Phase 2 (server layer) must land before any UI.
Phases 3, 4, 6 are independent user stories:

- Phase 3 = US1 (session editor with day range + participants)
- Phase 4 = US2 (loop progress bar)
- Phase 6 = US3 (PC character frontier, P2)

Phase 5 (session page polish) is cosmetic — can ship with or
after US1/US2.

## Format: `[ID] [P?] [Priority] [Story] Description`

`[P]` = can run in parallel with other `[P]` tasks in the same
phase (no shared file). Priority: P1 = MVP, P2 = important,
P3 = nice-to-have.

---

## Phase 1: Migration

**Purpose**: Add `participated_in` base edge type and extend
`default_fields` for `session` and `loop` node types.

**⚠️ Idempotent & non-destructive.** No ALTER TABLE. Safe to
re-run.

- [x] **T001** [P1] Write `mat-ucheniya/supabase/migrations/032_session_packs_and_loop_length.sql`:
  - `INSERT INTO edge_types (slug='participated_in', label='Участник сессии', is_base=true)` with `ON CONFLICT … DO NOTHING`
  - `UPDATE node_types … SET default_fields = default_fields || {day_from: "", day_to: ""}` where `slug='session'` and key not present
  - `UPDATE node_types … SET default_fields = default_fields || {length_days: 30}` where `slug='loop'` and key not present
  - Wrap in `BEGIN; … COMMIT;`
  - After writing: call `present_files` so the user can download
- [x] **T002** [P1] User applies migration in Supabase (manual step). Wait for confirmation before Phase 2.

**Checkpoint**: `edge_types` has `participated_in`. `node_types` default_fields extended. Existing data untouched.

---

## Phase 2: Server Layer

**Purpose**: Type definitions, query hydration for participants,
server actions, validation utility.

- [x] **T003** [P1] Extend types in `mat-ucheniya/lib/loops.ts`:
  - `Session` gets `day_from: number | null`, `day_to: number | null`, `participants: { id: string; title: string }[]`
  - `Loop` gets `length_days: number` (always a number in the type — parsed with fallback 30)
  - `nodeToSession()` parses `day_from`/`day_to` from `fields` (accept int, numeric string, or empty); `participants` defaults to `[]` when not injected
  - `nodeToLoop()` parses `length_days` with fallback 30
- [x] **T004** [P1] Add participants hydration in `mat-ucheniya/lib/loops.ts`:
  - New internal helper `hydrateParticipants(sessionIds: string[]): Promise<Map<string, {id,title}[]>>` — single Supabase query on `edges` joined to `nodes`, filtered by `type_id = participated_in`
  - Update `getSessionsByLoop()` and `getAllSessions()` to call hydration and merge into sessions
  - Update `getSessionById()` similarly (single-element case)
  - Verify no N+1 (2 queries total per call site)
- [x] **T005** [P1] Add frontier helpers in `mat-ucheniya/lib/loops.ts`:
  - `getLoopFrontier(loopId: string): Promise<number | null>` — reduces over already-loaded sessions if available, otherwise single query
  - `getCharacterFrontier(characterId: string, loopId: string): Promise<{ frontier: number | null; sessionIds: string[] }>` — two chained queries: fetch session ids where PC is `participated_in` target AND `contains` target from loop, then aggregate
- [x] **T006** [P1] Create server action file `mat-ucheniya/app/actions/characters.ts`:
  - `'use server'` directive
  - `getCampaignPCs(campaignId: string): Promise<{ id: string; title: string; owner_display_name: string | null }[]>` — inner join `nodes` with `node_pc_owners` where `type='character'`, left join `user_profiles` for owner display name, sort by `title`
  - Membership check via existing helper
- [x] **T007** [P1] Create server action file `mat-ucheniya/app/actions/sessions.ts`:
  - `'use server'` directive
  - `updateSessionParticipants(sessionId: string, characterIds: string[]): Promise<void>`
  - Membership check
  - Resolve campaign_id from session node
  - Resolve `participated_in` edge_type id (cache in module scope)
  - `delete from edges where source_id=$sessionId and type_id=$pid` (raw enough — RLS enforces access)
  - `insert into edges (...)` for each characterId (no duplicates because of unique constraint; treat conflicts as no-op via `onConflict('source_id,target_id,type_id')`)
  - Call `invalidateSidebar(campaignId)` at end
- [x] **T008** [P1] [P] Create `mat-ucheniya/lib/session-validation.ts`:
  - `validateDayRange(day_from, day_to, loopLength): string | null` — exact rules per plan.md
  - Both empty ⇒ OK; both set ⇒ integer check + range check + ordering check
- [x] **T009** [P1] [P] Update `mat-ucheniya/lib/node-form-constants.ts`:
  - `FIELD_LABELS`: add `day_from: 'День от'`, `day_to: 'День до'`, `length_days: 'Длина петли (дней)'`
  - `NUMBER_FIELDS`: add `'day_from'`, `'day_to'`, `'length_days'`
  - `fieldPriority`: put `day_from`/`day_to` right after `session_number` (priority value between 0 and 1)

**Checkpoint**: All server code compiles. `getSessionById` returns day_from/day_to/participants. `getCampaignPCs` returns PCs only.

---

## Phase 3: Session Editor (US1, P1)

**Purpose**: DM can set day range and participants on a session.

- [x] **T010** [P1] Create `mat-ucheniya/components/participants-picker.tsx` (client component):
  - Dropdown opens on button click; fetches PCs via `getCampaignPCs` server action (cached with `useState` on first open)
  - Filter text input
  - Scrollable list with checkbox per row; selected rows sticky at top
  - Counter `{n} / {total} selected`
  - On viewport < 640px: render as full-screen sheet (dialog with `position: fixed; inset: 0`) instead of dropdown
  - Props: `campaignId`, `initialSelectedIds`, `onChange`
- [x] **T011** [P1] Modify `mat-ucheniya/components/node-form-field.tsx`:
  - Add early-return special case for `fieldKey === 'day_from'` when `typeSlug === 'session'`: render a combined "День от / День до" widget (two numeric inputs side-by-side). The widget calls `onChange` for `day_from` and accepts/emits `day_to` via a new optional prop pattern OR use two separate rendered widgets with validation wrapper — **decision**: render two separate inputs but wrap them in a flex row when both appear in form sequence. Keep it dumb.
  - For `fieldKey === 'day_to'`: render standard number input (same as other NUMBER_FIELDS), no special case needed beyond ordering
- [x] **T012** [P1] Modify `mat-ucheniya/components/create-node-form.tsx`:
  - When `typeSlug === 'session'`: render `<ParticipantsPicker />` as a separate section below the fields grid
  - Track `participantIds` in local state (not in `fields`)
  - On submit: after the existing node insert/update (which persists `day_from`/`day_to` via `fields`), call `updateSessionParticipants(sessionId, participantIds)`
  - Show inline validation error from `validateDayRange()` before allowing submit
  - Resolve `loopLength` from the session's selected loop's `fields.length_days` (fallback 30); re-validate on loop change
- [x] **T013** [P1] Manual test US1:
  - Create new session with day_from=7, day_to=9, 5 participants → reload → see everything persisted
  - Edit existing session, change day_to to 10, remove one participant → reload → see changes
  - Try day_from=9, day_to=7 → error blocks save
  - Try day_from=0 or day_to=35 → error blocks save
  - Single-day session (day_from=day_to=5) saves fine

**Checkpoint**: US1 works end-to-end. Data round-trips through the form.

---

## Phase 4: Loop Progress Bar (US2, P1)

**Purpose**: Visual loop progress bar with stacked lanes, overlap obvious, tooltip on interaction.

- [x] **T014** [P1] [P] Create `mat-ucheniya/components/loop-progress-bar-lanes.ts`:
  - Pure function `assignLanes(sessions: {id, day_from, day_to}[]): { laneByid: Map<string, number>; laneCount: number }`
  - Greedy algorithm per plan.md (sort by day_from ASC then day_to ASC; first-fit lane)
  - No React, no Supabase — purely a data function for easy manual verification
- [x] **T015** [P1] Create `mat-ucheniya/components/loop-progress-bar.tsx` (client component):
  - Props: `loop: { id, length_days, status }`, `sessions: Session[]` (hydrated)
  - Filter dated vs undated; run `assignLanes` on dated
  - Render outer `<div class="overflow-x-auto">` with min-width sized to `length_days * 24px` (mobile) / `length_days * 24px` (desktop — works for 30, ~720px)
  - Day axis row (1, 2, 3, …, length_days); bold every 5th
  - One row per lane; each session absolutely positioned by CSS `grid-column: day_from / day_to + 1` in a grid with `length_days` columns
  - Session segment: rounded rectangle with session number centered, border
  - Loop frontier marker: if `loop.status === 'current'`, dashed vertical line after `frontier + 1` column, caption "дошли до дня N" (computed client-side via `Math.max(...day_to)`)
  - Undated sessions: pill-row rendered **below** the bar ("Undated: #6 Title, #7 Title" with anchor links to session pages)
  - Empty state: when no dated sessions, bar renders but shows "пока нет сессий с датами" caption below axis
- [x] **T016** [P1] Add segment interaction in `loop-progress-bar.tsx`:
  - Desktop: on hover, show a small tooltip card below the segment (session #, title, day range, participant names). Use `group-hover` + absolute positioning, no external library.
  - Mobile (viewport < 640px): on tap, open bottom sheet — `<div>` sliding up from the bottom with backdrop. Same content. Close on backdrop tap or swipe-down (tracked via touch events, simple ΔY > 50px threshold).
  - Ensure both modes share the same content render function to avoid drift
- [x] **T017** [P1] Integrate into `mat-ucheniya/app/c/[slug]/loops/page.tsx`:
  - When a loop is selected, render `<LoopProgressBar loop={currentLoop} sessions={sessions} />` below the loop title, above the sessions list
  - Sessions are already fetched in the page; just ensure they are the hydrated version (day_from/day_to/participants)
- [ ] **T018** [P1] Manual test US2:
  - Loop with sessions [5-8, 7-9, 12-14] → three segments, overlap visible on different lanes
  - Empty loop → empty bar with ticks and "no dated sessions" caption
  - Hover (desktop) / tap (mobile) → tooltip/sheet shows correct participants
  - Undated session renders as pill-row below bar
  - Current loop shows frontier marker with "reached day N"

**Checkpoint**: US2 works. Bar renders, interactions work on both desktop and mobile.

---

## Phase 5: Session Detail Page Polish (Shippable with Phase 3-4)

- [x] **T019** [P2] [P] Modify `mat-ucheniya/app/c/[slug]/sessions/[id]/page.tsx`:
  - In the header area, render a chip "Дни {day_from}-{day_to}" when both are set; fall back to legacy `game_date` caption otherwise
  - Below the header, render a "Участники: @name1, @name2, …" row (linking each participant to their node page)
  - If `participants.length === 0`, skip the row entirely

**Checkpoint**: Session page shows new data inline.

---

## Phase 6: PC Character Frontier (US3, P2)

**Purpose**: On a PC node detail page, show "Current loop: up to day N (sessions #X, #Y)".

- [x] **T020** [P2] [P] Create `mat-ucheniya/components/character-frontier-card.tsx` (server component):
  - Props: `characterId`, `loopId`, `loopNumber`
  - Calls `getCharacterFrontier(characterId, loopId)`
  - Renders: `Петля {loopNumber}: до дня {frontier}` + up to 3 most recent session links as `#6`, `#7` chips; overflow as `+N more`
  - When frontier is null: `Петля {loopNumber}: ещё не играл в этой петле`
- [x] **T021** [P2] Modify `mat-ucheniya/components/node-detail.tsx`:
  - When `node.type === 'character'` AND the campaign has a loop with `status='current'`: render `<CharacterFrontierCard />` in the node metadata sidebar/block (pick a slot consistent with existing layout — probably next to owner info)
  - If no current loop exists — skip silently
- [ ] **T022** [P2] Manual test US3:
  - PC that played in sessions #6 (3-5) and #7 (6-9) of current loop → card shows "до дня 9" and links to #6, #7
  - PC that played in 0 sessions of current loop → "ещё не играл"
  - No current loop → card not rendered

**Checkpoint**: US3 works. P2 can ship in same PR as US1/US2 or separately.

---

## Phase 7: Close-out

- [x] **T023** [P1] Run lint + typecheck:
  - `cd mat-ucheniya && npm run lint && npx tsc --noEmit`
  - Fix any errors introduced during Phases 2-6
- [ ] **T024** [P1] Mark all `[ ]` → `[x]` in this `tasks.md` as they complete
- [ ] **T025** [P1] Update `NEXT.md`:
  - Move "spec-009 Loop progress bar + session packs" from "Следующий приоритет" into "В проде сейчас"
  - Set next priority to spec-010 Transactions ledger
  - Bump last applied migration to `032_session_packs_and_loop_length.sql`
- [ ] **T026** [P1] Add a `chatlog/YYYY-MM-DD-chatNN-spec-009-loop-progress-bar.md` entry per `chatlog/README.md` template
- [ ] **T027** [P1] Update `backlog.md` if anything new surfaced during implement
- [ ] **T028** [P1] Git commit + push:
  - Conventional-style message: `feat(spec-009): loop progress bar + session packs`
  - Push to `main`, Vercel auto-deploys

**Checkpoint**: Feature in prod, docs synced, ready for spec-010 in a new chat.

---

## Dependency Graph (abbreviated)

```
T001 → T002 → T003 ─┬─ T004 ─┬─ T005
                    │         └─ T011 ─┐
                    ├─ T006 ─ T010 ────┼─ T012 ─ T013
                    ├─ T007 ──────────┤
                    ├─ T008 ──────────┤
                    └─ T009 ──────────┘
                    ┌─ T014 ─ T015 ─ T016 ─ T017 ─ T018
                    └─ T020 ─ T021 ─ T022
T023 ─ T024 ─ T025 ─ T026 ─ T027 ─ T028
```

`[P]` tasks in each phase can run in parallel:
- Phase 2: T008, T009 parallel with T003-T007
- Phase 4: T014 parallel with T015 start
- Phase 5: T019 parallel with Phase 4 work
- Phase 6: T020 parallel with Phase 4 work

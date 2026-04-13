# Tasks: Граф сущностей — фундамент

**Input**: Design documents from `specs/001-entity-graph-foundation/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/supabase-api.md, research.md
**Updated**: 2026-04-13 — feature complete, deployed to production

**Tests**: Manual testing via quickstart.md scenarios.

**Organization**: Tasks grouped by user story. Each story independently testable after Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 maps to spec.md user stories + clarified features

---

## Phase 1: Setup

**Purpose**: Working Next.js project deployed to Vercel with Supabase connected

- [x] T001 Run `npx create-next-app@latest mat-ucheniya --typescript --tailwind --app` and verify dev server starts
- [x] T002 Create Supabase project in Dashboard, copy URL and anon key
- [x] T003 Install dependencies: `npm install @supabase/supabase-js @supabase/ssr`
- [x] T004 [P] Create `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] T005 [P] Create Supabase browser client in `lib/supabase/client.ts`
- [x] T006 [P] Create Supabase server client in `lib/supabase/server.ts` with cookies
- [x] T007 Create root layout in `app/layout.tsx` with base HTML, fonts, Tailwind globals
- [x] T008 Create campaign routing: `app/c/[slug]/layout.tsx` — resolve campaign by slug, pass campaign_id to children via context/prop. Redirect `/` to `/c/mat-ucheniya/catalog`
- [x] T009 Deploy to Vercel, connect GitHub repo, set env vars. Verify: site opens at URL

**Checkpoint**: Empty site at `/c/mat-ucheniya/catalog`. Supabase connected.

---

## Phase 2: Foundational (database schema + seed)

**Purpose**: Postgres tables with real campaign data. BLOCKS all user stories.

**⚠️ CRITICAL**: No UI work can begin until this phase is complete

- [x] T010 Write SQL migration `supabase/migrations/001_initial_schema.sql`:
  - Table `campaigns` (id uuid PK, name, slug UNIQUE, created_at)
  - Table `node_types` (id uuid PK, campaign_id FK, slug, label, icon, default_fields jsonb, sort_order, created_at)
  - Table `edge_types` (id uuid PK, campaign_id FK NULL, slug, label, is_base boolean DEFAULT false, created_at). UNIQUE (campaign_id, slug) for custom; base types have campaign_id=NULL
  - Table `nodes` (id uuid PK, campaign_id FK, type_id FK, title, fields jsonb, search_vector tsvector, created_at, updated_at)
  - Table `edges` (id uuid PK, campaign_id FK, source_id FK CASCADE, target_id FK CASCADE, type_id FK edge_types, label, meta jsonb, created_at). UNIQUE (source_id, target_id, type_id)
  - All indexes from data-model.md
- [x] T011 Write trigger function in same migration: auto-update `search_vector` on nodes INSERT/UPDATE using `to_tsvector('russian', title || ' ' || coalesce(fields->>'description',''))`
- [x] T012 Apply migration to Supabase via SQL Editor or `supabase db push`
- [ ] T013 Generate TypeScript types: `supabase gen types typescript > lib/supabase/types.ts` *(skipped — deferred to later)*
- [x] T014 Write `supabase/seed.sql`:
  - 1 campaign "Мать Учения" (slug: mat-ucheniya)
  - 10 node_types: character, npc, location, group, organization, creature, item, spell, event, mechanic
  - 6 base edge_types (is_base=true, campaign_id=NULL): knows, teaches, located_in, owns, member_of, contains
  - 10 NPCs: Тайвен, Ильза, Кайрон, Зориан, Хаслуш, Имайя, Бенисек, Акоджа, Лайонел, Нора (fields from spreadsheets, with tags)
  - 5 PCs: Альд (Алек), Дрипли (Егор), Маркус (Стасян), Британия (Андрей), Янка (Катя) (with tags)
  - 3 Locations: Промежуточный слой, Гадкий Койот, Клуб авантюристов
  - 3 Groups: Академия Сиории (organization), 3 курс (group), Группа 1 (group)
  - ~20 edges: contains (nesting), teaches, knows, member_of, located_in
- [x] T015 Apply seed. Verify: 21 nodes, 6 edge_types, ~20 edges in Table Editor
- [x] T016 Create campaign helper in `lib/campaign.ts`: `getCampaignBySlug(slug)` query + types

**Checkpoint**: 21 entities + 6 edge types + ~20 connections in database.

---

## Phase 3: User Story 1 — поиск и навигация (Priority: P1) 🎯 MVP

**Goal**: Type a name → see filtered list → click → full card with connections

**Independent Test**: `/c/mat-ucheniya/catalog` → type "Тайв" → click → card → click Дрипли → navigate

### Implementation

- [x] T017 [P] [US1] Create `components/search-input.tsx` — debounce 300ms, updates URL `?q=`
- [x] T018 [P] [US1] Create `components/node-card.tsx` — title, type badge, truncated description, link to `/c/[slug]/catalog/[id]`
- [x] T019 [P] [US1] Create `components/node-list.tsx` — responsive grid of NodeCards
- [x] T020 [US1] Create `app/c/[slug]/catalog/page.tsx` — Server Component: read `?q=`, textSearch or list all, join node_types, render SearchInput + NodeList
- [x] T021 [P] [US1] Create `components/edge-list.tsx` — connections grouped by outgoing/incoming, each = type label + linked node name
- [x] T022 [P] [US1] Create `components/node-detail.tsx` — title h1, type badge, JSONB fields as key-value, EdgeList
- [x] T023 [US1] Create `app/c/[slug]/catalog/[id]/page.tsx` — fetch node + edges with joins, render NodeDetail, 404 handling
- [x] T024 [US1] Create `app/page.tsx` — redirect to `/c/mat-ucheniya/catalog`
- [x] T025 [US1] Manual test: quickstart scenario 1 + scenario 4 (backlinks)

**Checkpoint**: Search and browse works. MVP complete. Deploy v0.1.

---

## Phase 4: User Story 2 — фильтрация по типу (Priority: P1)

**Goal**: Filter catalog by entity type to see only PCs / NPCs / locations

**Independent Test**: Click "Персонаж игрока" → see exactly 5 PCs with player names

### Implementation

- [x] T026 [US2] Create `components/type-filter.tsx` — chips from node_types, updates URL `?type=`, preserves `?q=`
- [x] T027 [US2] Update `app/c/[slug]/catalog/page.tsx`: read `?type=`, combine with `?q=`
- [x] T028 [US2] Update `components/node-card.tsx`: show `fields.player` as subtitle for characters
- [x] T029 [US2] Add empty state to `node-list.tsx`: "Ничего не найдено" + create link
- [x] T030 [US2] Manual test: quickstart scenario 2

**Checkpoint**: Catalog filters work. Deploy v0.2.

---

## Phase 5: User Story 3 — создание сущностей (Priority: P2)

**Goal**: Quick-create new entity in under 30 seconds

**Independent Test**: "+" → NPC → "Горнокрабль" → save → find in search

### Implementation

- [x] T031 [US3] Create `components/create-node-form.tsx` — type dropdown (default_fields as hints), title input, dynamic fields, submit → redirect
- [x] T032 [US3] Create `app/c/[slug]/catalog/new/page.tsx` — renders CreateNodeForm
- [x] T033 [US3] Add "+" button to catalog page → `/c/[slug]/catalog/new`
- [x] T034 [US3] Manual test: quickstart scenario 3

**Checkpoint**: Entity creation works. Deploy v0.3.

---

## Phase 6: User Story 5 — создание связей (Priority: P2)

**Goal**: Add connections between entities from node detail page

**Independent Test**: Open node → "Добавить связь" → search target → select type → save → appears on both nodes

### Implementation

- [x] T035 [US5] Create `components/create-edge-form.tsx` — dropdown of edge_types (WHERE is_base=true OR campaign_id=current), search input for target node, optional label, submit → insert edge → refresh list
- [x] T036 [US5] Add "Добавить связь" button to `components/node-detail.tsx` toggling CreateEdgeForm inline
- [x] T037 [US5] Manual test: create edge → verify on source card → verify backlink on target card

**Checkpoint**: Graph grows organically. Deploy v0.4.

---

## Phase 7: Polish & deploy

- [x] T038 [P] Page titles and meta: campaign name in `<title>`
- [x] T039 [P] Style pass: consistent spacing, borders, hover states
- [x] T040 [P] Responsive check: 375px viewport
- [x] T041 Push to GitHub, Vercel auto-deploys
- [x] T042 Run all quickstart scenarios + edge creation on prod
- [x] T043 Share URL with players

**Checkpoint**: Production v1.0.

---

## Dependencies

```
Phase 1 (Setup)
  └→ Phase 2 (DB) ─── BLOCKS ALL ───┐
                                      ├→ US1 (Search) → US2 (Filter)
                                      │       └→ US5 (Create edge)
                                      └→ US3 (Create node) [parallel with US1]
All stories → Phase 7 (Polish)
```

## Implementation Strategy

### MVP (4 days)
Setup → DB → US1 → **deploy, show friends**

### Full (8 days)
Setup + DB (2d) → US1 (2d) → US2 (1d) → US3 (1d) → US5 (1d) → Polish (0.5d)

---

## Summary

- **43 tasks** across **7 phases**
- **5 deployable increments** (v0.1 → v1.0)
- All URLs: `/c/[campaign-slug]/...`
- `edge_types` with `is_base` flag for universal DnD types
- Edge creation on node detail page

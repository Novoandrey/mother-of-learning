# Tasks: Трекер энкаунтера — MVP

**Input**: spec-002, plan-002
**Updated**: 2026-04-13
**Tests**: Manual testing по quickstart-сценариям.
**Organization**: По user stories. US2 (создание) перед US1 (бой) — нечего трекать без участников.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Database

**Purpose**: Таблицы encounters + encounter_participants в Supabase

- [x] T001 Write SQL migration `supabase/migrations/002_encounters.sql`
- [x] T002 Apply migration to Supabase
- [x] T003 TypeScript types — inline in components (no generated types file)

**Checkpoint**: ✅ Таблицы в базе.

---

## Phase 2: US2 — Создание энкаунтера и добавление участников (P1)

- [x] T004 [P] Create `app/c/[slug]/encounters/page.tsx`
- [x] T005 [P] Create `components/encounter-list-page.tsx`
- [x] T006 Create encounter creation: inline form → INSERT → redirect
- [x] T007 Create `app/c/[slug]/encounters/[id]/page.tsx`
- [x] T008 Create `components/combat-tracker.tsx`
- [x] T009 Create `components/add-participant-dialog.tsx`
- [x] T010 [P] Create `components/participant-row.tsx`
- [x] T011 Update `app/c/[slug]/layout.tsx` — add navigation
- [x] T012 Manual test: user confirmed encounters page works

**Checkpoint**: ✅ Энкаунтер создаётся и наполняется.

---

## Phase 3: US1 — Ведение боя (P1) 🎯 MVP

- [x] T013 Create `components/initiative-input.tsx`
- [x] T014 Create `components/hp-control.tsx`
- [x] T015 Wire initiative-input and hp-control into participant-row
- [x] T016 Implement turn order logic in combat-tracker
- [x] T017 Visual states: current turn highlight, HP=0 greyed out, is_active=false dimmed
- [x] T018 Implement "Убрать из боя" / "Вернуть в бой" toggle
- [x] T019 Implement delete participant (with confirmation)
- [x] T020 Implement encounter status: "Завершить бой"
- [ ] T021 Manual test: full combat scenario — 6 participants, initiative, 3 rounds, KO, end combat

**Checkpoint**: Code deployed. Needs full manual test.

---

## Phase 4: US3 — Список энкаунтеров (P2)

- [x] T022 Encounter list: sort by updated_at DESC, status badge, participant count
- [x] T023 Empty state: "Нет энкаунтеров" + "Создать первый"
- [ ] T024 Manual test: create 2 encounters, complete one, verify list

**Checkpoint**: Code deployed. Needs manual test.

---

## Phase 5: Polish

- [x] T025 [P] Page titles and meta: generateMetadata in both pages
- [x] T026 [P] Inline edit display_name on participant-row (rename in menu)
- [ ] T027 [P] Responsive check: 375px viewport — combat table scrollable
- [ ] T028 Run full quickstart scenario on prod
- [ ] T029 Share with players

---

## Summary

- **29 tasks** across **5 phases**
- **24 done**, **5 remaining** (manual tests + responsive + share)
- All code deployed to production via Vercel

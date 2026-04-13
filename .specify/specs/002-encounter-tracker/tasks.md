# Tasks: Трекер энкаунтера — MVP

**Input**: spec-002, plan-002
**Updated**: 2026-04-13
**Tests**: Manual testing по quickstart-сценариям.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Database

- [x] T001 Write SQL migration `supabase/migrations/002_encounters.sql`
- [x] T002 Apply migration to Supabase
- [x] T003 TypeScript types — inline in components

**Checkpoint**: ✅ Таблицы в базе.

---

## Phase 2: US2 — Создание энкаунтера и добавление участников (P1)

- [x] T004 [P] Create `app/c/[slug]/encounters/page.tsx`
- [x] T005 [P] Create `components/encounter-list-page.tsx`
- [x] T006 Create encounter creation: inline form → INSERT → redirect
- [x] T007 Create `app/c/[slug]/encounters/[id]/page.tsx`
- [x] T008 Create `components/combat-tracker.tsx`
- [x] T009 ~~Create `components/add-participant-dialog.tsx`~~ → replaced by inline-add-row + catalog-panel
- [x] T010 [P] Create `components/participant-row.tsx`
- [x] T011 Update `app/c/[slug]/layout.tsx` — add navigation
- [x] T012 Manual test: user confirmed encounters page works

**Checkpoint**: ✅ Энкаунтер создаётся и наполняется.

---

## Phase 3: US1 — Ведение боя (P1) 🎯 MVP

- [x] T013 Create `components/initiative-input.tsx`
- [x] T014 Create `components/hp-control.tsx`
- [x] T015 Wire initiative-input and hp-control into participant-row
- [x] T016 ~~Implement turn order logic~~ → simplified to round counter (+/−)
- [x] T017 Visual states: HP=0 greyed out, is_active=false dimmed
- [x] T018 Implement "Убрать из боя" / "Вернуть в бой" toggle
- [x] T019 Implement delete participant (with confirmation)
- [x] T020 Implement encounter status: "Завершить бой"
- [ ] T021 Manual test: full combat scenario

**Checkpoint**: Code deployed. Needs manual test.

---

## Phase 4: US3 — Список энкаунтеров (P2)

- [x] T022 Encounter list: sort by updated_at DESC, status badge, participant count
- [x] T023 Empty state: "Нет энкаунтеров" + "Создать первый"
- [ ] T024 Manual test: create 2 encounters, complete one, verify list

---

## Phase 5: Refactor — убрать модалки, упростить (v2)

- [x] T025 [P] Page titles and meta: generateMetadata
- [x] T026 [P] Inline edit display_name on participant-row
- [x] T030 Remove turn tracking (current_turn_id, "Следующий ход", turn highlight)
- [x] T031 Replace round advance with simple +/− counter
- [x] T032 Delete add-participant-dialog.tsx modal
- [x] T033 Create inline-add-row.tsx (name + HP inline at bottom of table)
- [x] T034 Create catalog-panel.tsx (PC/NPC/creature list grouped by type, click to add)
- [x] T035 Remove bench/combat split — single sorted table
- [x] T036 Update encounter page to pass catalog nodes to CombatTracker
- [ ] T027 [P] Responsive check: 375px viewport
- [ ] T028 Run full quickstart scenario on prod
- [ ] T029 Share with players

---

## Summary

- **36 tasks** across **5 phases**
- **30 done**, **6 remaining** (manual tests + responsive + share)
- v2 refactor: no modals, no turn tracking, flat table + catalog panel

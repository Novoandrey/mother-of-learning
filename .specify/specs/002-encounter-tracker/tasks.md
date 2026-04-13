# Tasks: Трекер энкаунтера

**Input**: spec-002, plan-002
**Updated**: 2026-04-13 — feature complete, deployed to production
**Tests**: Manual testing, user confirmed all features work.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Database

- [x] T001 Write SQL migration `002_encounters.sql`
- [x] T002 Apply migration to Supabase
- [x] T003 TypeScript types — inline in components

**Checkpoint**: ✅

---

## Phase 2: US2 — Создание энкаунтера и добавление участников

- [x] T004 Create encounters page + list component
- [x] T005 Create encounter creation flow
- [x] T006 Create encounter detail page + combat-tracker
- [x] T007 Create add-participant (→ later replaced by inline + catalog panel)
- [x] T008 Create participant-row component
- [x] T009 Add navigation link "Энкаунтеры"
- [x] T010 Manual test: confirmed working

**Checkpoint**: ✅

---

## Phase 3: US1 — Ведение боя

- [x] T011 Initiative input (inline editable)
- [x] T012 HP control (damage/heal with amount input)
- [x] T013 Round counter (+/−)
- [x] T014 Visual states: HP=0 red bg, is_active=false dimmed
- [x] T015 "Убрать из боя" / "Вернуть в бой" toggle
- [x] T016 Delete participant with confirmation
- [x] T017 "Завершить бой" button
- [x] T018 Manual test: user confirmed full combat works

**Checkpoint**: ✅

---

## Phase 4: Refactor v2 — убрать модалки, упростить

- [x] T019 Remove turn tracking (current_turn_id, "Следующий ход")
- [x] T020 Delete add-participant-dialog modal
- [x] T021 Create inline-add-row (name + HP at bottom of table)
- [x] T022 Create catalog-panel (PC/NPC/creature list, click to add)
- [x] T023 Remove bench/combat split — single sorted table

**Checkpoint**: ✅

---

## Phase 5: Conditions & Effects

- [x] T024 Migration 003: node_type "condition", 15 SRD condition nodes, conditions text[] column
- [x] T025 ConditionPicker component (colored tags, SRD descriptions in tooltips)
- [x] T026 Gender-neutral condition names (существительные), Истощение split 1–6
- [x] T027 Migration 005: node_type "effect", effects text[] column
- [x] T028 EffectPicker component (search + auto-create new effects as catalog nodes)
- [x] T029 Manual test: user confirmed conditions and effects work

**Checkpoint**: ✅

---

## Phase 6: Role colors, Temp HP, Encounter details

- [x] T030 Migration 004: role text, temp_hp int columns
- [x] T031 RoleSelector component (pc/ally/neutral/enemy/object)
- [x] T032 Row background colored by role
- [x] T033 TempHpInput component (hidden when 0, cyan badge when set)
- [x] T034 Editable max_hp (click "/ max" to change)
- [x] T035 Migration 005: encounter details jsonb column
- [x] T036 EncounterDetailsCard (Location, Description, Map, Soundtracks + custom fields)
- [x] T037 Manual test: user confirmed all features work

**Checkpoint**: ✅

---

## Phase 7: Polish

- [x] T038 Page titles and meta: generateMetadata
- [x] T039 Table structure: column headers, borders, dividers
- [x] T040 Page bg gray-50, bigger fonts/padding for readability
- [x] T041 Fix: overflow-hidden clipping dropdowns
- [x] T042 Deploy + user tested on prod

**Checkpoint**: ✅ Production v2.0-enc.

---

## Summary

- **42 tasks** across **7 phases**
- **42 done, 0 remaining**
- Feature complete. Deployed to production.
- Migrations applied: 002, 003, 004, 005

# Tasks: Трекер энкаунтера — MVP

**Input**: spec-002, plan-002
**Updated**: 2026-04-13
**Tests**: Manual testing по quickstart-сценариям.
**Organization**: По user stories. US2 (создание) перед US1 (бой) — нечего трекать без участников.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Database

**Purpose**: Таблицы encounters + encounter_participants в Supabase

- [ ] T001 Write SQL migration `supabase/migrations/002_encounters.sql`:
  - Table `encounters` (id uuid PK, campaign_id FK, title, status DEFAULT 'active', current_round DEFAULT 0, current_turn_id uuid nullable, created_at, updated_at)
  - Table `encounter_participants` (id uuid PK, encounter_id FK CASCADE, node_id FK nodes nullable, display_name, initiative numeric nullable, max_hp int DEFAULT 0, current_hp int DEFAULT 0, sort_order int DEFAULT 0, is_active boolean DEFAULT true, created_at)
  - Indexes: encounter_id, node_id, (encounter_id, initiative DESC NULLS LAST, sort_order)
  - FK current_turn_id → encounter_participants (SET NULL on DELETE)
- [ ] T002 Apply migration to Supabase
- [ ] T003 Update TypeScript types (regenerate or add manually to `lib/supabase/types.ts`)

**Checkpoint**: Таблицы в базе, типы в коде.

---

## Phase 2: US2 — Создание энкаунтера и добавление участников (P1)

**Goal**: Создать энкаунтер, добавить PC/NPC из каталога (с клонированием) или вручную
**Independent Test**: Создать "Бой в таверне" → добавить 3 PC + 3 тролля ×1 → все видны в таблице

- [ ] T004 [P] Create `app/c/[slug]/encounters/page.tsx` — Server Component: fetch encounters list, render with "Создать" button
- [ ] T005 [P] Create `components/encounter-list-page.tsx` — encounter cards: title, status badge, participant count, link to detail
- [ ] T006 Create encounter creation: button → inline form or dialog → INSERT → redirect to `/c/[slug]/encounters/[id]`
- [ ] T007 Create `app/c/[slug]/encounters/[id]/page.tsx` — Server Component: fetch encounter + participants with node joins, render CombatTracker
- [ ] T008 Create `components/combat-tracker.tsx` — main layout: header (title, round, controls), combat table (has initiative), bench (no initiative), "Добавить" button
- [ ] T009 Create `components/add-participant-dialog.tsx` — two tabs: "Из каталога" (search nodes + quantity input) and "Вручную" (name + max_hp). Insert → refresh list
- [ ] T010 [P] Create `components/participant-row.tsx` — display_name (linked to node if node_id), initiative, HP bar, status badge. Skeleton for HP/initiative controls
- [ ] T011 Update `app/c/[slug]/layout.tsx` — add "Энкаунтеры" link to navigation
- [ ] T012 Manual test: create encounter → add from catalog (×1 and ×3) → add manually → all visible

**Checkpoint**: Энкаунтер создаётся и наполняется. Deploy v0.1-enc.

---

## Phase 3: US1 — Ведение боя (P1) 🎯 MVP

**Goal**: Инициатива = участие, трекинг ХП, порядок хода, раунды
**Independent Test**: Вписать инициативу → участник в бою → урон → следующий ход → новый раунд

- [ ] T013 Create `components/initiative-input.tsx` — inline editable: click → number input → Enter → save to Supabase → re-sort list. Clear → back to bench
- [ ] T014 Create `components/hp-control.tsx` — number input + "−" (damage) and "+" (heal) buttons. Clamp: 0 ≤ current_hp ≤ max_hp. Optimistic update to Supabase
- [ ] T015 Wire initiative-input and hp-control into participant-row
- [ ] T016 Implement turn order logic in combat-tracker: "Следующий ход" button → advance current_turn_id to next active participant with initiative. End of list → increment round, wrap to first
- [ ] T017 Visual states: current turn highlight, HP=0 greyed out / strikethrough, is_active=false dimmed and skipped
- [ ] T018 Implement "Убрать из боя" / "Вернуть в бой" toggle (is_active) on participant-row
- [ ] T019 Implement delete participant (with confirmation)
- [ ] T020 Implement encounter status: "Завершить бой" button → status='completed', disable editing
- [ ] T021 Manual test: full combat scenario — 6 participants, initiative, 3 rounds of damage/healing, KO, next turn skip, end combat

**Checkpoint**: Полноценный трекер боя. Deploy v0.2-enc. **Показать друзьям.**

---

## Phase 4: US3 — Список энкаунтеров (P2)

**Goal**: Навигация по энкаунтерам, статус
**Independent Test**: Список показывает 2+ энкаунтера, клик → переход, завершённый помечен

- [ ] T022 Polish encounter list: sort by updated_at DESC, status badge (active green / completed grey), participant count
- [ ] T023 Add empty state to encounters list: "Нет энкаунтеров" + "Создать первый"
- [ ] T024 Manual test: create 2 encounters, complete one, verify list

**Checkpoint**: Навигация работает. Deploy v0.3-enc.

---

## Phase 5: Polish

- [ ] T025 [P] Page titles and meta: "Энкаунтер: {title} — {campaign}"
- [ ] T026 [P] Inline edit display_name on participant-row (for renaming clones)
- [ ] T027 [P] Responsive check: 375px viewport — combat table scrollable
- [ ] T028 Deploy + run full quickstart scenario on prod
- [ ] T029 Share with players

**Checkpoint**: Production v1.0-enc.

---

## Dependencies

```
Phase 1 (DB) ─── BLOCKS ALL ───┐
                                 ├→ US2 (Create + Add) → US1 (Combat) 🎯
                                 └→ US3 (List) [parallel with US1]
All stories → Phase 5 (Polish)
```

## Implementation Strategy

### MVP (3-4 days)
DB → US2 → US1 → **deploy, show friends**

### Full (5-6 days)
DB (0.5d) → US2 (1.5d) → US1 (1.5d) → US3 (0.5d) → Polish (0.5d)

---

## Summary

- **29 tasks** across **5 phases**
- **3 deployable increments**
- Инициатива = участие (null = скамейка)
- Клонирование через quantity при добавлении из каталога
- Optimistic UI для ХП и инициативы

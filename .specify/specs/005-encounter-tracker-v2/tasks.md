# Tasks: Трекер энкаунтера v2 — Excel-first

**Input**: spec-005, plan-005
**Updated**: 2026-04-15
**Tests**: Manual testing по quickstart-сценариям из plan.md.
**Organization**: По user stories. Foundational → US2 (добавление) → US1 (бой) → US3 (условия).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational — новые примитивы

**Purpose**: Создать базовые компоненты editable grid, не трогая существующий UI.
Старый трекер работает параллельно, пока новый не готов.

- [x] T001 [P] Create `components/encounter/editable-cell.tsx` — display mode (text) → click → input → Enter/Tab/blur → commit. Props: value, onCommit, type (text|number), placeholder, disabled, className
- [x] T002 [P] Create `components/encounter/hp-cell.tsx` — display "current / max" + mini bar. Click on current → input with delta parsing ("-14", "+7", "45"). Click on "/max" → edit max. Reuse updateHp, updateMaxHp from encounter-actions
- [x] T003 [P] Create `components/encounter/tag-cell.tsx` — display badges, click → input with autocomplete dropdown, Enter → add tag, Backspace → remove last, click badge → remove. Props: tags[], suggestions[], onChange, placeholder
- [x] T004 [P] Create `components/encounter/encounter-header.tsx` — title, round counter (+/−), "Следующий ход", "Сохранить шаблон", "Завершить бой". Extract from combat-tracker state management

**Checkpoint**: 4 new primitives, testable in isolation.

---

## Phase 2: US2 — Добавление участников (P1)

**Goal**: Собрать grid layout и добавить участников из каталога / вручную
**Independent Test**: Создать энкаунтер → вписать "Тролль" → автокомплит → ×3 → видны в таблице

- [x] T005 Create `components/encounter/add-participant-row.tsx` — input with catalog autocomplete (search nodes where type in character/npc/creature). Quantity selector for clones. Enter without selection → manual add. Reuse addParticipantFromCatalog, addParticipantManual
- [x] T006 Create `components/encounter/encounter-grid.tsx` — main component. State: encounter + participants (optimistic). HTML table layout: thead (column headers) + tbody (sorted participants) + tfoot (add row). Import all cell components. Wire all handlers from encounter-actions
- [x] T007 Update `app/c/[slug]/encounters/[id]/page.tsx` — replace CombatTracker import with EncounterGrid. Keep same data fetching, same props shape
- [ ] T008 Manual test: open existing encounter → data renders → add from catalog ×3 → add manual → all visible in grid

**Checkpoint**: Новый grid рендерит данные и позволяет добавлять. Deploy v0.1.

---

## Phase 3: US1 — Ведение боя (P1) 🎯 MVP

**Goal**: Инициатива, HP (delta), ход, раунды — всё через Tab
**Independent Test**: Tab через инициативу 6 участников → урон через "-14" → следующий ход → новый раунд

- [ ] T009 Wire editable-cell for initiative column: onCommit → updateInitiative → re-sort. Tab → next cell
- [ ] T010 Wire hp-cell for HP column: delta parsing, clamp, optimistic update
- [ ] T011 Wire editable-cell for temp HP column: type=number, onCommit → updateTempHp
- [ ] T012 Wire encounter-header: round +/−, "Следующий ход" (advance current_turn_id, wrap → new round), "Завершить бой"
- [ ] T013 Visual states: current turn row highlight (bg-yellow-50 border-l-4 border-yellow-400), HP=0 (bg-red-50 opacity-60 line-through name), is_active=false (opacity-30)
- [ ] T014 Row actions: clone, toggle active, delete — icon buttons in last column, same handlers from encounter-actions
- [ ] T015 Name column: link to catalog node (if node_id), inline rename on double-click, statblock icon
- [ ] T016 Role column: color indicator dot + click to cycle (enemy → pc → ally → neutral → enemy). Row background tint by role
- [ ] T017 Manual test: quickstart scenario 1 — full 3-round combat

**Checkpoint**: Полноценный бой. Deploy v0.2. **Показать друзьям.**

---

## Phase 4: US3 — Условия и эффекты (P2)

**Goal**: Теги условий и эффектов через автокомплит
**Independent Test**: Кликнуть ячейку условий → "осл" → "Ослеплённый" → бейджик

- [ ] T018 Wire tag-cell for conditions: suggestions = DnD conditions from catalog (fetch condition nodes). onChange → updateConditions
- [ ] T019 Wire tag-cell for effects: suggestions = effect nodes from catalog + freetext. onChange → updateEffects
- [ ] T020 Manual test: quickstart scenario 2 — add/remove conditions and effects

**Checkpoint**: Условия и эффекты работают. Deploy v0.3.

---

## Phase 5: US4 — Список и навигация (P2)

**Goal**: Список энкаунтеров, создание, шаблоны
**Independent Test**: Список → создать → создать из шаблона → всё работает

- [ ] T021 [P] Update encounter-list-page.tsx — минимальные стилевые правки для единообразия с STYLE.md
- [ ] T022 [P] Verify encounter-details-card works in new layout
- [ ] T023 [P] Verify save-as-template-button works in encounter-header
- [ ] T024 Manual test: quickstart scenario 3 — backward compatibility

**Checkpoint**: Навигация + совместимость. Deploy v0.4.

---

## Phase 6: Cleanup & Polish

- [ ] T025 [P] Delete old v1 components: combat-tracker.tsx, participant-row.tsx, hp-control.tsx, initiative-input.tsx, condition-picker.tsx, effect-picker.tsx, role-selector.tsx, temp-hp-input.tsx, inline-add-row.tsx, catalog-panel.tsx
- [ ] T026 [P] Update STYLE.md: remove "Encounter tracker has its own style" note, document grid tokens
- [ ] T027 [P] Responsive: 375px → horizontal scroll with sticky name column
- [ ] T028 [P] Page title and meta
- [ ] T029 Push to GitHub, Vercel auto-deploys
- [ ] T030 Run all quickstart scenarios on prod

**Checkpoint**: Production v2.0.

---

## Dependencies

```
Phase 1 (Primitives) ─── BLOCKS ALL ───┐
                                         ├→ US2 (Add) → US1 (Combat) 🎯
                                         │                └→ US3 (Conditions)
                                         └→ US4 (List) [parallel]
All stories → Phase 6 (Cleanup)
```

## Implementation Strategy

### MVP (3 days)
Primitives (1d) → US2+US1 (2d) → **deploy, show friends**

### Full (5 days)
Primitives (1d) → US2 (0.5d) → US1 (1.5d) → US3 (0.5d) → US4 (0.5d) → Cleanup (1d)

---

## Summary

- **30 tasks** across **6 phases**
- **4 deployable increments** (v0.1 → v2.0)
- Новые примитивы: EditableCell, HpCell, TagCell
- Delta notation для HP: "-14" = урон, "+7" = лечение
- Tab-навигация между ячейками
- Старый код удаляется только в Phase 6 (после подтверждения)
- Никаких миграций БД

# Tasks: Петли и сессии как ноды графа

**Input**: spec.md, plan.md из specs/003-loops-sessions-as-nodes/
**Updated**: 2026-04-13
**Tests**: Ручное тестирование по сценариям из spec.md

**Organization**: По фазам. Phase 1 (миграция) блокирует всё остальное.
UI-адаптация сгруппирована по страницам. Фичи каталога (поиск, теги,
связи, markdown) работают автоматически после миграции — нужна только
верификация.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Database Migration

**Purpose**: Перенести данные из loops/sessions в nodes/edges, обновить search_vector

**⚠️ CRITICAL**: Весь код ломается после этой миграции — Phase 2 MUST deploy вместе

- [x] T001 Write SQL migration `012_loops_sessions_as_nodes.sql`:
  - INSERT node_types `loop` и `session` с default_fields
  - INSERT INTO nodes SELECT FROM loops (title, fields JSONB, content=notes)
  - INSERT INTO nodes SELECT FROM sessions (title, fields JSONB)
  - INSERT INTO edges: для каждой сессии с loop_number → ребро `contains` от петли к сессии
  - UPDATE search_vector trigger: индексировать title + content + ALL text values from fields JSONB
  - Re-trigger search_vector на всех существующих нодах
  - DROP TABLE sessions, DROP TABLE loops
- [ ] T002 Apply migration to Supabase (пользователь вручную)

**Checkpoint**: Данные в nodes, старые таблицы удалены.

---

## Phase 2: US3 — Страницы петель работают из nodes (P1) 🎯

**Goal**: /loops показывает те же данные, что раньше, но из nodes
**Independent Test**: Открыть /loops → увидеть 4 петли с сессиями, создать новую

- [x] T003 Update `lib/loops.ts`: все запросы из nodes вместо loops/sessions.
  - getLoops(): nodes WHERE type=loop, ORDER BY fields->>'number'
  - getSessionsForLoop(loopNumber): nodes WHERE type=session AND fields->>'loop_number' = N
  - Helper: getLoopNodeTypeId(), getSessionNodeTypeId()
- [x] T004 Update `app/c/[slug]/loops/page.tsx`: использовать новые запросы,
  маппинг fields → отображение (number, status, title, sessions count)
- [x] T005 Update `components/loop-form.tsx`: INSERT/UPDATE в nodes с type_id=loop,
  fields={number, status}, content=notes. Title = "Петля {N}" или custom.
- [x] T006 Update `app/c/[slug]/loops/new/page.tsx` и `loops/[id]/edit/page.tsx`:
  запросы из nodes, передача в LoopForm
- [ ] T007 Manual test: /loops показывает петли, создание/редактирование работает

**Checkpoint**: Петли работают. Deploy v0.1.

---

## Phase 3: US3 — Страницы сессий работают из nodes (P1)

**Goal**: /sessions и /sessions/[id] показывают данные из nodes
**Independent Test**: Список сессий, фильтр по петле, детальная страница с рекапом

- [x] T008 Update `app/c/[slug]/sessions/page.tsx`: запрос nodes WHERE type=session,
  фильтр по fields->>'loop_number', поиск по title и fields->>'recap'
- [x] T009 Update `app/c/[slug]/sessions/[id]/page.tsx`:
  - Запрос ноды + рёбра (для связей с НПС)
  - Показать NodeDetail ИЛИ специализированный layout с рекапом
  - prev/next навигация через fields->>'session_number'
  - Кнопка "Редактировать" → форма
- [x] T010 Update `components/session-form.tsx`: INSERT/UPDATE в nodes
  с type_id=session, fields={session_number, loop_number, recap, dm_notes, played_at, game_date}.
  При сохранении: создать/обновить ребро contains от петли (если loop_number задан)
- [x] T011 Update `app/c/[slug]/sessions/new/page.tsx`: запросы из nodes
- [ ] T012 Manual test: список сессий, фильтр по петле, создание, редактирование,
  prev/next навигация, рекап отображается

**Checkpoint**: Сессии работают. Deploy v0.2.

---

## Phase 4: US1 + US2 — Каталог и связи (P1)

**Goal**: Петли и сессии видны в каталоге, связываются с НПС
**Independent Test**: Поиск "Допрос" → находит сессию. Связь сессия→НПС работает.

- [ ] T013 Verify: петли и сессии появляются в каталоге (sidebar tree, search, type filter).
  Если node_types добавлены правильно — работает автоматически.
- [ ] T014 Verify: карточка сессии в каталоге показывает поля (session_number, recap и т.д.)
  через стандартный NodeDetail
- [ ] T015 Verify: поиск "Бенисек" возвращает и НПС, и сессию "Допрос Бенисека"
  (search_vector обновлён). Если нет — отладить триггер.
- [ ] T016 Verify: добавление связи сессия→НПС работает через стандартный CreateEdgeForm.
  Обратная ссылка на карточке НПС видна.
- [ ] T017 Manual test: полный сценарий US1 + US2 из spec.md

**Checkpoint**: Каталог полностью интегрирован. Deploy v0.3.

---

## Phase 5: Cleanup + Chronicles

**Purpose**: Убрать мёртвый код, адаптировать хроники

- [ ] T018 Update `app/api/chronicles/route.ts`: запросы loop_number
  теперь через nodes.fields->>'number' вместо loops.number
- [ ] T019 Update chronicles queries в `loops/page.tsx` (если ссылаются на loops table)
- [ ] T020 [P] Remove unused imports, dead code из lib/loops.ts (старые типы)
- [ ] T021 [P] Update NEXT.md и backlog.md
- [ ] T022 Push to GitHub, verify Vercel deploy, run all scenarios on prod

**Checkpoint**: Production v1.0. Чисто.

---

## Dependencies

```
Phase 1 (Migration SQL) ─── BLOCKS ALL ───┐
                                           ├→ Phase 2 (Loops UI)
                                           ├→ Phase 3 (Sessions UI)
                                           │      └→ Phase 4 (Verify catalog)
                                           └→ Phase 5 (Cleanup)
```

## Implementation Strategy

### MVP (2-3 days)
Migration → Loops UI → Sessions UI → Verify catalog → **deploy, test on real session**

### ⚠️ Deploy note
Phase 1 (migration) и Phase 2+3 (код) MUST деплоиться одним коммитом,
иначе сайт сломается (код ссылается на удалённые таблицы).

---

## Summary

- **22 задачи** across **5 phases**
- **3 deployable increments** (v0.1 loops → v0.2 sessions → v0.3 catalog)
- Ключевой риск: миграция данных. SQL должен быть тщательно проверен.
- Бонус: поиск, теги, связи, markdown — всё работает "бесплатно" после миграции.

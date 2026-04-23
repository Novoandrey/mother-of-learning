# Chat 36 — spec-010 Transactions Ledger: Specify + Clarify + Plan + Tasks, 2026-04-24

## Контекст (откуда пришли)

После spec-009 (chat 34-35) roadmap показывает spec-010
Transactions Ledger как следующий приоритет. Задача чата: пройти
полный spec-kit flow (specify → clarify → plan → tasks) и положить
артефакты в репо, чтобы implement можно было начать в новом чате
(попытка в новом чате без коммита контекст не видит).

## Что сделано

- **`specs/010-transactions-ledger/spec.md`** — 7 user stories (US1–US4
  P1, US5–US7 P2), 26+ FR, 4 ключевых entities, 6 measurable SC.
  Три раунда Clarify:
  - Q1: **день — primary temporal anchor**, не сессия. Auto-fill из
    character frontier (spec-009). Off-session — это default, не режим.
  - Q2: **closed DM-editable категории** (slug en + label ru),
    per-campaign, seed на создании, soft-delete, переиспользуется
    в spec-015 для предметов.
  - Q3: **smallest-first, whole coins only, no breaking** при
    spend. Display: `−5 GP (2 g, 20 s, 100 c)`. Gems/checks/luxury
    — out of scope для будущей "valuables" фичи.
- **`plan.md`** — архитектурный план с тремя ключевыми решениями:
  - **"Бухгалтерия" как top-level app** под `/c/[slug]/accounting/*`
    (ledger + settings/categories + будущие под-роуты spec-011..015),
    а не два одиночных роута.
  - **Одна таблица `categories` с `scope text`** (default 'transaction',
    CHECK IN ('transaction','item')) вместо `transaction_categories`.
    spec-015 добавит `scope='item'` без schema change.
  - **Денойминации через const map** `DENOMINATIONS + GP_WEIGHT` —
    resolver/formatter итерируют. Добавить homebrew-валюту = 1 entry
    + 1 колонка, не rewrite.
  - Отдельный раздел "Device & Mode Contract" (игрок mobile-first,
    ДМ PC-only с responsive-degradation; same components, media queries,
    no `useIsMobile()` hooks).
- **`tasks.md`** — 46 задач в 14 фазах. MVP shippable после phase 9
  (T001–T027 — US1/US2/US3/US4). P2 (transfer/item/settings) в том же
  PR или отдельно. Каждая задача — file path, priority, `[P]`-маркер
  параллельности, зависимости в Dependency Graph.

## Миграции

Нет — миграция `034_transactions_ledger.sql` будет в implement (T001).

## Коммиты

- будет один коммит с тремя артефактами spec-010

## Действия пользователю (после чата)

- [ ] Начать новый чат для Implement, стартовать с T001.
- [ ] После T001: применить миграцию 034 в Supabase (T002).

## Что помнить следующему чату

- Spec-kit flow строго: implement идёт по `tasks.md` **одна задача за
  раз**, mark `[x]` + stop + confirm между задачами (hard rule из
  project instructions).
- `categories` (а не `transaction_categories`) — важно для spec-015.
- `scope` prop на `<CategoryDropdown>` и `<CategorySettings>` —
  готовность к item-категориям. Не упустить при implement.
- `DENOMINATIONS` const map — единственный источник правды для
  порядка и весов монет. Никаких open-coded `cp/sp/gp/pp` в других
  файлах.
- Роуты под `/c/[slug]/accounting/*`, nav-линк в `layout.tsx`.
- MVP = P1 фазы 1–9 (T001–T027). P2 фазы 10–12 можно отдельным PR.
- vitest добавляется как новый dev-dep (T003) — ранее в проекте
  тестов не было. Пройти через `npm install --save-dev vitest`
  при implement.
- Character frontier helper (`getCharacterFrontier` в `lib/loops.ts`)
  уже существует из spec-009 — переиспользовать для auto-fill формы.

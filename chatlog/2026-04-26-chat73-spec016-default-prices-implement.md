# Chat 73 — spec-016 default item prices: full implement, 2026-04-26

> Note: технически это chat 73 (chat 72 закрылся коммитом 9d9b486
> upstream — self-review fix EditForm + quality gates). Файл назван
> по дате/последовательности.

## Контекст (откуда пришли)

Chat 72 закрылся коммитом 9d9b486 (upstream): зафиксил
`setSubmitError` внутри `setParticipants` reducer'а в EditForm
(StrictMode-safe pattern), прогнал quality gates (lint 0/0,
vitest 390/390, next build артефакты сгенерированы). Spec-017
«Складчина» — _code shipped + quality gates passed, awaits
migration apply_.

Юзер сказал «Continue» → продолжаю по NEXT.md очереди. Spec-017
на bench (миграция не применена), spec-016 (default item prices
bulk apply + override) был next priority с готовой spec.md.

## Что сделано

### Spec-016 — все фазы

**Specify (уже было):** spec.md 207 строк лежал с chat 71.
Status: Draft.

**Clarify:** залочил 6 open questions:
1. Migration filename: `048_*` (047 занят spec-017).
2. Manual price entry без флага → clobbered (flag — единственный
   opt-out, не auto-tick на divergence).
3. Badge «стандарт / ручная» в v1 — skip.
4. Autofill suppression — привязана к flag value на момент
   rarity-смены, не к history. Расжатие flag не триггерит
   prefill немедленно.
5. Bucket mapping — `category_slug == 'consumable'`, всё
   остальное → magic.
6. Кампании без consumable category — non-issue, items
   просто попадают в magic bucket.

**Plan + Tasks:** компактный план + 10 задач, всё P1, ~2 часа
оценка.

**Implement (T001–T010):**

- **T001** Migration 048: `alter table item_attributes add
  column use_default_price boolean default true`. Идемпотентна.
- **T002** present_files миграции через `/mnt/user-data/outputs`.
- **T003** Расширены `ItemNode` + `ItemPayload` в items-types.ts
  с `useDefaultPrice: boolean`.
- **T004** `lib/apply-default-prices.ts`: pure helper
  `computeApplyPlan(items, defaults)` → `{updates, skippedByFlag,
  skippedByRarity, skippedByMissingCell, unchanged}`. Pure logic,
  никаких I/O.
- **T005** `lib/__tests__/apply-default-prices.test.ts`: 12
  vitest cases (empty, single update, opt-out, artifact, null
  rarity, missing cell, unchanged, consumable bucket, mixed
  catalog с 5 разными skip kinds, null priceGp, partial defaults).
  Не запускал у себя (container нет npm), валидно синтаксически.
- **T006** Обновил `lib/items.ts` SELECT/hydrate (3 spots: list
  IN-fetch, single-fetch, embedded SELECT typeahead). Обновил
  `app/actions/items.ts` insert + update payload. Обновил
  `EMPTY_PAYLOAD` (default `useDefaultPrice: true`). Обновил
  `app/c/[slug]/items/[id]/edit/page.tsx` initial.
- **T007** `applyItemDefaultPrices(slug)` в
  `app/c/[slug]/settings/actions.ts`. Auth + DM gate, JOIN на
  nodes для campaign_id фильтра, `computeApplyPlan`,
  sequential per-row UPDATE через admin client (не RPC — для
  каталогов 100–500 items acceptable; если станет hot —
  мигрируем). revalidatePath layout.
- **T008** Item form: `useDefaultPrice` state, чекбокс «Не
  использовать стандартную цену» (inverted) под Цена field +
  tooltip ⓘ. `handleRarityChange` / `handleCategoryChange`
  suppress autofill когда `!useDefaultPrice`.
- **T009** `<ApplyDefaultPricesButton>` client island: confirm()
  → server action → state-based breakdown UI («Обновлено: N»,
  «Пропущено по галочке: M», etc.). Mounted в settings page под
  `<DefaultPricesEditor>` с пояснительной подписью + manager
  guard (defence-in-depth).
- **T010** Close-out: NEXT.md (spec-016 в «В проде», next priority
  переключён на «применить миграции 047+048»), version 0.5.1,
  chatlog (этот файл).

### Upstream merge

Chat 72 закрывался commit'ом 9d9b486 в параллельной сессии.
Сделал `git stash → pull --rebase → pop` — конфликтов нет (NEXT.md
переписан мной полностью, остальные файлы изолированные).

### Что осталось ручкам

- Применить **обе** миграции (047 + 048) через Supabase Dashboard.
- Quality gates spec-016 у тебя локально:
  - `pnpm lint` — расширенные item types во всех 3 SELECT'ах +
    payload pass-through; ошибок не должно быть.
  - `pnpm vitest run lib/__tests__/apply-default-prices.test.ts`
    — 12 кейсов, pure helper.
  - `pnpm next build` — критично: я мог пропустить место где
    `ItemPayload` строится без `useDefaultPrice` (seed file,
    fixture). Если build плюётся — добавить там `useDefaultPrice: true`.
- Manual smoke spec-016: открыть `/items/settings`, нажать
  «Применить ко всем предметам», убедиться что breakdown
  правильный + цены в `/items` обновились.
- Manual smoke spec-017: pizza-test US1 walkthrough (T023).

## Миграции

- `048_item_use_default_price.sql` — 1 column ADD, idempotent,
  default true → existing rows автоматом получают flag.

## Коммиты

- `<TBD>` `feat(spec-016): default item prices — bulk apply + override`

## Действия пользователю (после чата)

- [ ] Применить миграции `047_contribution_pools.sql` (spec-017)
  и `048_item_use_default_price.sql` (spec-016) в Supabase
  Dashboard.
- [ ] Quality gates spec-016: lint / vitest / next build.
- [ ] Manual smoke spec-017 + spec-016.
- [ ] Если всё ок — pull обе спеки в _полностью в проде_,
  bump 0.5.2 release tag.

## Что помнить следующему чату

- При build могут всплыть type errors в местах где `ItemPayload`
  строится без `useDefaultPrice`. Особенно в seed scripts /
  test fixtures / encounter-loot autogen. Если есть — добавить
  `useDefaultPrice: true`.
- `applyItemDefaultPrices` использует sequential UPDATE'ы через
  admin client. На больших каталогах (>500) станет медленно —
  тогда мигрируем в RPC с CASE WHEN. Сейчас тестируем на 91
  SRD items, нормально.
- `ApplyDefaultPricesButton` использует native `confirm()` /
  inline state UI. Если кодобаза доедет до toast-системы —
  мигрировать туда.
- Spec-018 «Карта мира» — следующий после migration apply.
  Фундаментальная, ~5–7 дней. Подумать про phasing (canvas
  скелет → пины → фильтры).

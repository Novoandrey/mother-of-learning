# Chat 76 — spec-018 dnd.su scraper full Implement, 2026-04-27

Длинный чат: T001 → T025 в одну сессию, с тремя bug-fix циклами в конце.

## Что в проде

- **spec-018 dnd.su magic items scraper** — _полностью_. 50 миграций
  056–105, 844 предмета из dnd.su (5e14) + 274 ранее существовавших
  SRD = 1118 в `mat-ucheniya`. Ссылка «Открыть на dnd.su» на странице
  предмета и поле в форме.

## Ключевые решения

- **Слаги**: голый kebab-case URL-slug (`adamantine-armor`,
  `bloodwell-vial-plus-1`). Префикс `dndsu-{id}-` отвергнут после
  ревью — некрасиво. Для umbrella items стрипается `-1-2-3` суффикс
  из URL-slug перед добавлением `-plus-N`.
- **41 collision dnd.su с hand-curated SRD**: SRD-entry'и побеждают
  (у них есть curated `priceGp`), dnd.su версии дропаются в codegen.
- **2 internal duplicate**: `staff-of-defense` и `spider-staff`
  встречаются в LMOP и PBSO (переиздания). Codegen теперь warn+drop
  вместо throw — оставляет первое вхождение.
- **FR-012 narrowed (T024)**: новые per-book source slugs не
  плодятся, всё в `srd-5e` bucket, имя книги в `nodes.fields.source_detail`.
  Q8 в `## Clarifications`.
- **Phase 2 backfill `transactions.item_node_id` намеренно
  пропущен** для dnd.su entries — русские названия слишком общие,
  обратная привязка налепит false positives. DM руками связывает
  через UI каталога.

## Bug-fix цикл после применения миграций

Три отдельных бага, обнаружены через user feedback:

1. **/items падает 500** — `getCatalogItems` шла в два шага
   (nodes → IN-query на attrs). С 1118 UUIDов в IN URL ~42KB,
   PostgREST давится. Переписал на embed `!inner` join — тот же
   паттерн, что в `searchItemsForTypeahead`.

2. **Сайдбар показывает 396/822 вместо 1118** — оказалось, у Supabase
   в проекте включён server-side `db-max-rows = 1000` клэмп,
   `.range(0, 9999)` его НЕ обходит. Добавил pagination loop в три
   места (`sidebar-cache`, `getCatalogItems`, `applyItemDefaultPrices`):
   крутимся по страницам 1000 rows, hard cap 10k.

3. **«Применить ко всем» Bad Request** — тот же URL-overflow от
   `.in('node_id', [1118 UUIDов])` в bulk-apply action. Чинится тем
   же embed + pagination переходом.

Заодно подчистил legacy текст про несуществующую галочку «Не
использовать стандарт» в settings page и confirm dialog —
`use_default_price` стало auto-managed ещё в chat 74, копия отстала.

## Затраты

- Чтение dnd.su: 934 URL × 1 req/s = ~16 минут (один раз, потом cache)
- 887 raw записей → 844 финальных (после dedup)
- 50 миграций (056–105)
- TypeScript build чистый
- 18/18 pytest для парсера, 8/8 RLS smoke (после двух итераций — wrong
  column names + approved_at constraint)

## Visual sanity (T020)

Visual проверка на проде ✓ — каталог открывается, рендерит ~1118
items, фильтр `?category=magic-item` работает, ссылка «Открыть на
dnd.su» ведёт на правильную страницу, форма редактирования
показывает поле «Ссылка на dnd.su».

## Что отложено

- DDHC source — `099_dndsu_unknown-dd-supplement-ddhc_items.sql`
  применилась, items сидят с `source_detail = 'Unknown D&D
  supplement (DDHC)'`. Когда узнаем что за DDHC — обновим строку
  в `SOURCE_BOOKS` и перегенерим миграцию (или пропатчим UPDATE'ом).

- Если кампания когда-нибудь перевалит за 10k нод — pagination
  loop'ы упрутся в hard cap. Тогда нужен count-only sidebar +
  on-demand title fetching per group.

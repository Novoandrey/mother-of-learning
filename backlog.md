# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Single source of truth — все баги, фичи, идеи живут здесь.

Updated: 2026-04-23 (chat 33 — Бухгалтерия roadmap)

---

## 📋 Активная серия: Бухгалтерия (specs 009-015)

Большая фича, разбита на 7 независимых спецификаций. Source of truth
для контекста, решений и ограничений:

→ **`.specify/memory/bookkeeping-roadmap.md`**

Каждая спека пишется в отдельном чате. Следующая на очереди —
**spec-009 Loop progress bar + session packs**.

---

## 🔜 NEXT — баги и мелочёвка (chat 29)

### BUG-017 [P1] ✅ DONE — Скролл пикера участников обрезается, когда выбрано 6+
- **Открыто и сделано**: chat 35 (после мёрджа spec-009 review-polish)
- Весь блок с selected rows + хедерами «Выбрано» / «Остальные» был
  обёрнут в `sticky top-0 z-10 bg-white`. Когда высота блока
  становилась больше `sm:max-h-80` (320px) — при 6+ выбранных —
  sticky прилипал к верху скролл-контейнера и выталкивал unselected
  rows за пределы видимой области. Пользователь не мог прокрутить
  до них.
- **Фикс**: убран внешний sticky-обёртка. Структура плоская,
  selected rows и заголовки идут обычным потоком. Scroll теперь
  работает при любом количестве выбранных.
- Ссылка: `commit c6f52e… — fix(spec-009): picker scroll truncated beyond 6 selected`
  (см. `mat-ucheniya/components/participants-picker.tsx`)

### UX-003 [P3] Дата игры (played_at) в американском формате
- **Открыто**: chat 34 (spec-009 testing)
- `<input type="date">` отображается по локали ОС/браузера, а не по
  HTML `lang`. Если ОС в English, показывается mm/dd/yyyy. Сохранение
  корректное (YYYY-MM-DD в БД), вью на `/sessions/[id]` уже в ru-RU
  формате («21 апреля 2026 г.») — фейл только в форме.
- Решения на выбор:
  - **Campaign settings**: вынести формат даты в настройки кампейна
    (`campaign_settings` таблица, ключ `date_format` ∈
    `{iso, eu, us}`). Форма рендерит text-input с соответствующим
    placeholder'ом, парсит сама. Теряем нативный date-picker, но
    гибко и по-русски.
  - **Локальный fix**: text-input с placeholder `ДД.ММ.ГГГГ` +
    ручной парс в ISO на save. Проще, без настройки. Тот же
    недостаток с нативным пикером.
  - **Caption-preview**: оставить `type="date"`, под ним маленькая
    подпись "Выбрано: 14 апреля 2026". Минимум кода, но формат
    ввода остаётся американским.
- **Приоритет**: низкий — данные сохраняются правильно, только
  display в форме корявый.

Все 4 пункта из прошлого NEXT (BUG-014, TECH-001, UX-001, UX-002)
по факту уже сделаны в chat 28 — backlog отстал. Синхронизировано.

### BUG-016 [P2] ✅ DONE — Каталог и сайдбар рассинхронизируются (stale cache)
- **Сделано**: chat 31
- Системный аудит: см. TECH-006 ниже. В рамках BUG-016 конкретно
  починен `createCustomType` (миссинг `invalidateSidebarAction`
  после инсерта в `node_types`).
- CLI-кейс (когда `seed-srd` показывает 34 в каталоге и 20 в сайдбаре)
  остался открытым — вынесен в TECH-007.

### TECH-006 [P2] ✅ DONE — Аудит инвалидаций кэша и stale-data
- **Сделано**: chat 31
- Прошёл systematic sweep по всем мутациям таргетных таблиц
  (nodes, node_types, node_pc_owners, chronicles, encounters,
  loops, sessions, edges).
- **Зафикшено** (2 миссинга):
  - `hooks/use-node-form.ts` `createCustomType` — добавлен
    `invalidateSidebarAction(campaignId)`.
  - `lib/campaign-actions.ts` `initializeCampaignFromTemplate` —
    добавлен `invalidateSidebar(campaignId)` после `seedCampaignSrd`.
- **Проверено OK** (не требует фиксов):
  - `api/nodes/[id]` DELETE — уже зовёт invalidate.
  - `api/nodes/[id]` PATCH/content — обновляет поля вне сайдбара.
  - `api/chronicles/*` — catalog/loops `force-dynamic`, UI оптимистичный.
  - `members/actions.ts` PC owners — сайдбар не фильтрует по owner-ам.
  - `electives/actions.ts`, `use-node-form.ts` handleSubmit/handleDelete
    — уже зовут invalidate.
  - `lib/encounter-actions.ts`, `use-encounter-turns.ts`,
    `encounter-grid.tsx`, `encounter-page-client.tsx` — encounters
    + encounter_participants не в сайдбаре.
  - `create-edge-form.tsx` — edges не в сайдбаре, `router.refresh()` ok.
- **Документация**: правило добавлено в `AGENTS.md` (sidebar cache
  invalidation by call site).
- **Не покрыто** (отдельные задачи):
  - CLI-скрипты — TECH-007 ниже.
  - Race conditions в encounter grid — нужен план (optimistic
    concurrency vs version column vs realtime). Заводится отдельно
    при появлении реальных жалоб.

### TECH-007 [P3] ✅ DONE — invalidate-from-CLI
- **Сделано**: chat 32
- **Контекст**: BUG-016 нашёл, что после `npm run seed-srd` каталог
  показывает 34, а сайдбар 20 до 60с TTL. Скрипты вне Next runtime,
  `revalidateTag` недоступен.
- **Решение**: defensive infra (вариант A из backlog).
  - `POST /api/admin/invalidate-sidebar?campaign=<slug-или-uuid>` —
    auth `Bearer SUPABASE_SERVICE_ROLE_KEY` (constant-time compare),
    резолвит slug в id, дёргает `invalidateSidebar(campaignId)`.
  - `scripts/lib/invalidate-sidebar-remote.ts` — fetch-хелпер,
    читает `APP_URL` (default `localhost:3000`) + service-role key.
    Non-fatal: при ошибке логирует warning, скрипт всё равно success.
  - Проводка: `seed-srd.ts`, `dedupe-srd.ts`, `import-electives.ts`.
  - `AGENTS.md` — секция про CLI обновлена.
- **Прод-настройка**: для запуска CLI против прода надо выставить
  `APP_URL=https://mother-of-learning.vercel.app`.
- **Замечание**: в момент работы триггер не сработал (BUG-016 уже
  закрыт, сайдбар корректен). Сделано как defensive infra по
  явному решению — при появлении массового workflow всё готово.


- **Сделано**: chat 29
- При удалении рекапа из его детальной страницы (куда пришёл с петли)
  пользователь оказывался в /catalog, а не возвращался на родительскую
  петлю. Плюс задержка перехода создавала впечатление что кнопка
  «Удаляю…» зависла.
- Фикс: `node-detail.tsx` `handleDelete` теперь делает `router.back()`
  если в истории есть откуда вернуться, иначе fallback на `/catalog`.

### BUG-014 [P1] ✅ DONE — `roundRef.current = turns.round` в render body
- **Сделано**: chat 28 (commit `330a290`)
- Удалена строка из `encounter-grid.tsx`, ref синхронизируется
  через `onRoundChange` callback в `useEncounterTurns`.

### TECH-001 [P2] ✅ DONE — Хардкод "Мать Учения" → env var
- **Сделано**: chat 28 (commit `496fcd9`)
- `lib/branding.ts` создан, `APP_NAME = process.env.NEXT_PUBLIC_APP_NAME
  || 'Мать Учения'`. `app/layout.tsx` и `app/login/page.tsx` используют его.

### TECH-002 [P2] ✅ DONE — 7 мест `react-hooks/set-state-in-effect`
- **Сделано**: chat 28 (commit `330a290`)
- `tag-cell`, `add-participant-row`, `action-resolve-dialog`,
  `electives-client`, `members-client` — везде паттерн заменён
  на реакцию в хендлере вместо `useEffect`.

### TECH-003 [P2] ✅ DONE — `any` в Supabase join ответах
- **Сделано**: chat 28
- Создана утилита `lib/supabase/joins.ts` с `Joined<T>`, `unwrapOne<T>`,
  `unwrapMany<T>`.
- Убрано 21 `any` из 9 файлов: `members/actions.ts` (×6),
  `encounters/page.tsx` (×2), `encounters/[id]/page.tsx` (×4),
  `loops/page.tsx`, `catalog/page.tsx`, `app/page.tsx`,
  `lib/loops.ts` (×2), `hooks/use-node-form.ts` (×2),
  `hooks/use-participant-actions.ts`.
- `tsc --noEmit` + `next build` проходят чисто.

### UX-001 [P2] ✅ DONE — Toast-менеджер вместо alert()
- **Сделано**: chat 28 (commit `496fcd9`)
- `components/toast-provider.tsx` + `useToast()` хук в `app/layout.tsx`.
  Используется в `node-detail.tsx`, `chronicles.tsx`, `create-edge-form.tsx`.

### UX-002 [P3] ✅ DONE — Индикаторы pending на inline-формах
- **Сделано**: chat 28 (commit `330a290` + другие)
- `electives-client.tsx` и `members-client.tsx` уже используют
  `useActionState` с `pending` → `disabled={pending}` на submit-кнопках.

### TECH-004 [P2] ✅ DONE — `unstable_cache` на sidebar query
- **Сделано**: chat 28 (commit `c12e248`)
- Layout sidebar query завёрнут в `unstable_cache`, плюс параллельные
  fetches через `Promise.all`.

### TECH-005 [P3] ✅ DONE — Middleware → Proxy (Next 16)
- **Сделано**: chat 29
- `mat-ucheniya/middleware.ts` → `proxy.ts`, функция `middleware` → `proxy`.
- Заодно `lib/supabase/middleware.ts` → `lib/supabase/proxy.ts`
  для консистентности (это просто имя файла, не file convention).
- Edge runtime в проекте не использовался → миграция тривиальна.
- Deprecation warning ушёл, проект готов к Next 17.

---

## 🔒 TECH DEBT от ultrareview — для отдельных фич, не в chat 28

### TECH-008 [P3] spec-010 ledger totals считаются в памяти
- **Feature**: spec-010 performance
- `getLedgerPage` тянет `(actor_pc_id, kind, amount_*)` без LIMIT
  для summary (`count / distinctPcs / netAggregateGp`) и агрегирует
  в JS. На текущем масштабе (~сотни транзакций) это ОК, но при
  ~тысячах станет заметно.
- **Фикс**: materialized view на `(campaign_id, loop_number,
  actor_pc_id)` + refresh triggers + view в `getWallet` и summary.
- Актуально когда одна из кампаний перевалит за 1000 транзакций.
- В плане spec-010 уже зафиксировано в разделе Performance.

### TECH-009 [P3] spec-010 session picker в форме транзакции не сделан
- **Feature**: spec-010 UX
- Сейчас `defaultSessionId` подставляется автоматически из PC
  frontier. Ручное переназначение (выбрать другую сессию) отложено
  — в caption-editor форма показывает note
  «Сессия подставляется автоматически по фронтиру; переназначение
  будет в отдельной итерации».
- **Фикс**: добавить session picker в expanded caption editor.
  Реюзнуть pattern из participants-picker или ограничиться
  session'ями текущей петли.
- Не срочно — в практике DM чаще создаёт транзакцию прямо во время
  сессии, когда фронтир совпадает.

### TECH-010 [P3] Rename `actor_pc_id` → `actor_node_id` на `transactions`
- **Feature**: spec-011 прямая подсветила — stash-нода пишется в эту
  колонку, но название misleading.
- **Источник**: chat 39 — spec-011 plan.md, Open Questions #1.
- FK уже корректно ссылается на `nodes(id)`, поэтому функционально
  всё работает. Это **косметический долг**, не блокер.
- Становится важнее когда появятся другие non-PC actors (локации в
  spec-015? gm/npc?).
- **Фикс**: одношотная миграция `ALTER TABLE transactions RENAME COLUMN
  actor_pc_id TO actor_node_id` + grep-and-replace по всему
  кодобазисe (`lib/transactions.ts`, `lib/stash.ts`, все actions,
  все queries). Порядка 20-30 мест.
- Откладываем до тех пор, пока цена "неправильного названия" не
  перевесит цену миграции.

### TECH-011 [P2] Категории (транзакций): keep or kill
- **Feature**: post-spec-015 cleanup; решение откладывается до
  spec-015.
- **Источник**: chat 39 — пользователь обратил внимание что в
  практике категории транзакций не настраиваются ДМом, все бросают
  в default. Это «легаси» из spec-010 которое никто не использует.
- Удалить сейчас нельзя, потому что таблица `categories` с
  `scope='transaction' | 'item'` была специально спроектирована под
  item-классификацию в spec-015 (раскрывающие списки по типам
  предметов в inventory grid).
- **Реальный вопрос**: как будем делать item-классификацию в
  spec-015?
  - Вариант A: через `categories(scope='item')` — инфраструктура
    готова. Тогда transaction-категории остаются как «младший брат»
    той же таблицы.
  - Вариант B: через tags на item-нодах (теги на `nodes.fields`).
    Тогда `categories` таблица избыточна — `scope='item'` не
    понадобится, и `scope='transaction'` можно будет выпилить
    отдельной мини-спецификой или TECH-таском.
- **Стоимость удаления** (если пойдём по варианту B): миграция DROP
  таблицы + DROP `category_slug` NOT NULL, удаление ~15 touch-points
  в коде (`app/actions/transactions.ts`, `components/category-*`,
  `lib/transactions.ts`, `lib/categories.ts`, `lib/seeds/categories.ts`,
  страница `/accounting/settings/categories`). Порядка 1 дня работы.
- Решение принимается в первом чате spec-015. Сейчас ничего не
  трогаем.

### IDEA-044 [P2] spec-010 timeline-вид по петле
- **Feature**: spec-010 UX / наблюдаемость (запрос из chat 37)
- Сейчас `/accounting?loop=3` это уже фактически лог петли — ledger
  feed с фильтром. Но это плоский список, агрегатов на временную
  шкалу нет.
- **Чего не хватает**:
  - Группировка по `day_in_loop`: `День 1` → транзакции этого дня,
    `День 5` → ... — timeline вместо feed'а.
  - Дневной агрегат: сумма доходов/расходов за день петли.
  - История баланса: «на конец дня N у PC было X GP» — таблица или
    sparkline на странице PC.
  - Саммари по петле сверху: `+145 / −89 = net +56 GP`, pie по
    категориям (лут 80% / кредит 20%).
- **Где жить**: скорее всего отдельная вкладка `/accounting/timeline`
  или toggle "feed / timeline" на основной странице. Или как часть
  spec-011 (общий стах) — там тот же view-паттерн нужен для
  «баланса стаха по петле».
- Приоритет: P2 — DM-запрос от пользователя.

### IDEA-049 [P3] Схемы (blueprints) и крафт магических предметов
- **Feature**: homebrew-правила матучения → spec-015 (items-as-nodes) + будущая спека крафта
- Источник: chat 37 DM-уточнение к roadmap'у.
- **Правила мира**:
  - У магического предмета может быть «Схема» — отдельная
    сущность, описывающая как его сделать.
  - Жёсткое правило редкости: `blueprint.rarity = item.rarity + 1`
    (схема common-предмета — uncommon, и т.д.).
  - Схема даёт возможность крафтить предмет — за определённое
    время и, вероятно, ресурсы/реагенты.
  - **Схемы общие для партии**: если один PC изучил схему —
    знание доступно всем игрокам кампании. Это следует из лора
    петли времени (PC — один и тот же человек с разными
    ветками, знание не теряется). На уровне модели: владение
    на campaign, не на PC.
- **Модель** (когда до неё дойдёт):
  - Новый `node_type='blueprint'` с полями
    `{ target_item_id: uuid, rarity: string, time_days: number,
       resource_requirements: [...], crafting_rules: markdown }`.
  - `target_item_id` — FK на item-ноду (spec-015). Проверка
    rarity'и на write.
  - «Схема изучена в кампании» — просто факт существования
    blueprint-ноды в кампании (добавили через UI/лут — значит
    изучена). Никакого per-PC `learned` ребра не нужно — все
    члены кампании видят и применяют.
  - Если захочется отследить «кто первый изучил» — опциональное
    поле `discovered_by_pc_id` для летописи, но на логику крафта
    не влияет.
- **Действие крафта** — частный случай IDEA-046 (шаблон транзакций):
  выбрать blueprint кампании + актёра → списать ресурсы (через
  transfer/money tx) → продвинуть день петли на `time_days`
  (триггер IDEA-045 о «текущий день») → добавить item-ноду в
  инвентарь.
- **Связи**:
  - **spec-015** items-as-nodes — предпосылка (`target_item_id`
    нужен item'ам в виде нод).
  - **IDEA-045** current-session/day — крафт двигает день петли.
  - **IDEA-046** transaction templates — механизм применения.
  - **IDEA-047** encounter loot — схемы могут выпадать как лут.
- Приоритет P3 — homebrew-расширение, не входит в базовую модель.
  Проектируется одновременно со spec-015, фактическая реализация
  отдельной спекой.

### IDEA-050 [P3] Категория транзакции как advanced-поле в форме
- **Feature**: spec-010 UX polish
- Источник: chat 37 — DM сказал, что 6-категорий-по-умолчанию
  избыточно, пока свободного комментария достаточно.
- Сейчас форма автоматически проставляет `category_slug` по
  kind'у (income/expense/transfer → одноимённый slug из seed'а).
  CategoryDropdown в форме скрыт, но сам компонент и
  `/accounting/settings/categories` остались работать — DM может
  создавать кастомные категории, а ledger-фильтры по категории
  тоже рабочие (просто пустые у большинства записей).
- Когда понадобится детализация — вернуть дропдаун как «advanced»
  раскрывашку под полем комментария: default скрыт, `+ выбрать
  категорию вручную` показывает его. CategoryDropdown компонент
  и action уже готовы.

### IDEA-051 [P2] Стартовый капитал персонажа из класса/бэкграунда
- **Feature**: spec-010 (ledger) + будущая спека PC creation
- Источник: chat 38 — при создании PC DM сейчас вручную первой
  транзакцией вбивает стартпак. Это рутина, которую знает D&D 5e
  SRD: каждый класс и бэкграунд даёт `starting_wealth: CoinSet`
  (например, Fighter — 5d4×10 gp, бэкграунд Noble — 25 gp + набор
  предметов).
- Реализация:
  - Поле `starting_wealth: CoinSet` на PC-ноде (или ссылка на
    шаблон класса/бэкграунда, если такие есть в SRD seed'е).
  - При создании PC — автогенерация income-транзакции «стартовый
    капитал» на day 1 первой петли.
  - Предметы из стартпака — отдельный flow через spec-015 (items
    as nodes).
- Связь:
  - **IDEA-046** (шаблоны транзакций) — стартпак это именно шаблон.
  - **Spec-015** (items as nodes) — предметная часть стартпака.
  - Будущая спека PC creation — там решается UX выбора класса.

### IDEA-053 [P2] 📝 спека готова — Spec-011 «Положить/Взять» кнопки + shortcut на нехватку
- **Feature**: spec-011 (Общак)
- **Статус (chat 39)**: spec / plan / tasks готовы, лежат в
  `.specify/specs/011-common-stash/`. Ждёт implement в
  следующем чате. Всё из этой заметки покрыто FR'ами в спеке
  + тасками в `tasks.md`.
- Источник: chat 38 — DM попросил зафиксировать до написания
  самой спеки.
- Термин «Общак» (не `stash` / «общий кошелёк» / «казна») —
  проектный сленг, использовать как UI-label.
- Две отдельные кнопки рядом с `+ Доход / − Расход / Перевод →`:
  `Положить в Общак` и `Взять из Общака`. Внутри — тот же
  transfer action, но sender/recipient предзаполнены нодой
  общака; recipient-picker не показывается.
- **Важнее кнопок**: при расходе, превышающем wallet PC, форма
  подсвечивает amount-input красным и даёт shortcut: «Недостаточно
  монет — взять из общака недостающую часть?». Согласие →
  автоматически создаётся transfer stash→PC на разницу + обычный
  expense. Отказ → стандартная серверная ошибка.
- Сравнение с балансом общака — `getWallet(stashId, loopNumber)`.
- Детали реализации уйдут в сам spec-011 документ. Здесь — только
  чтобы не потерять требование.
- Полная версия этой заметки — `.specify/memory/bookkeeping-roadmap.md`,
  секция spec-011.

### UX-004 [P3] Фильтр «День от / до» в ledger — под вопросом
- **Feature**: spec-010 ledger polish
- Источник: chat 38 — DM сомневается, нужны ли два поля day-range
  в фильтре ledger'а. В реальности фильтровать приходится по
  петле и PC, а день — редко.
- Варианты:
  - Убрать day-range вовсе, оставить только loop + PC + category.
  - Заменить на один `day` input с exact-match (равно дню).
  - Схлопнуть под advanced-раскрывашку (дефолт скрыт).
- Решение ждёт живого использования — если за пару сессий ни
  разу не понадобится, смело выкидываем.

### IDEA-048 [P3] Энкаунтеры: поле «идеальное прохождение» для автобоя
- **Feature**: spec-007 (encounter templates) + планируемый автобой
- Источник: chat 37 DM-запрос.
- Идея: у энкаунтера добавить текстовое/structured-поле «идеальное
  прохождение» — как примерно игроки должны пройти («отвлечь стражу
  → открыть сейф → уйти через окно»). При «автобое» (когда игроки
  отыгрывают без детального broadcast'а в чате) это поле даёт ДМу
  ориентир что считать успехом + служит основанием для распределения
  награды.
- Не требует новых таблиц — просто дополнительный `default_field` на
  `node_type=encounter` типа `ideal_walkthrough: string`.
- Связь с **IDEA-047**: когда автобой выполнен по «идеальному
  прохождению», лут применяется автоматически через тот же flow.

### IDEA-047 [P2] Lootable encounters → авто-пополнение общака/кошельков
- **Feature**: spec-007 (энкаунтеры) + spec-010 (ledger) + spec-011 (общак)
- Источник: chat 37 DM-запрос.
- Контекст: энкаунтеры — это не только бои. Делянки с редкими
  растениями, тайники которые легко забрать, заброшенные
  лаборатории, данженовые сундуки — тоже энкаунтеры со своим
  лутом, просто без initiative-грида.
- **Модель**:
  - У энкаунтера есть поле `loot: LootBundle` (JSON в `nodes.fields`):
    `{ items: [{name, qty}], coins: CoinSet }`.
  - Когда игроки проходят энкаунтер (в трекере жмут «Завершён» или
    через автобой по IDEA-048), появляется модалка «Распределение
    лута» со списком.
  - ДМ/игрок может отметить что что-то потеряно/уничтожено в ходе
    прохождения (чекбокс «вычеркнуть») — нужно прямо на модалке,
    до подтверждения.
  - По подтверждению: транзакции автоматически создаются (money
    transfer от NPC-pool в общак или в кошельки PC, item rows с
    указанием енкаунтера как источника).
- **Связи**:
  - IDEA-046 (шаблоны транзакций) — «применить лут энкаунтера» это
    частный случай шаблона.
  - IDEA-048 (идеальное прохождение) — триггер для автобоя.
  - Spec-011 (общак) — получатель.
  - Spec-015 (items as nodes) — когда появится, loot items будут
    ссылками на item-ноды, а не свободным текстом.
- Приоритет P2 — экономит минуты DM-работы на каждой сессии.

### IDEA-046 [P2] Шаблоны транзакций / автоматические действия
- **Feature**: spec-010+ (расширение / отдельная спека)
- Источник: chat 37, запрос DM'а. Повторяющиеся операции с
  предсказуемой структурой:
  - **Кредит**: «Джон берёт 50 GP у банка» → одна строка
    `kind='money', amountGp=+50, category='credit', comment='Кредит банка'`.
    Возврат кредита — обратная операция с тем же комментарием.
  - **Стартовый набор** (D&D class packs): Rogue → [50gp, stealth cloak,
    thieves' tools]. Один клик — сразу 3 строки (money income + 2 item)
    с соответствующими категориями.
  - **Быстрое прохождение квеста**: заранее записанный список наград
    («Quest: Зачистка гоблинов = 120 GP + зелье лечения + подсказка»)
    → в конце сессии ДМ «применяет» шаблон к живым участникам,
    каждому создаётся пачка одинаковых транзакций.
  - **Общак-пополнение** при сдаче лута: выбор PC-участников → сумма
    делится поровну → N transfer'ов от каждого PC в общак (spec-011).
- **Структура**: новая таблица `transaction_templates (campaign_id,
  slug, label, actions jsonb)` + UI editor («как категории»). `actions`
  = массив операций в одном применении.
- **Application flow**: DM открывает `/accounting`, жмёт «Применить
  шаблон», выбирает шаблон + целевой(ые) PC, форма предпросмотра
  показывает какие строки будут созданы, подтверждает → inserted
  в одной транзакции (атомарно для группы).
- **Зависимости**: spec-011 (общак как стах) нужен для
  общак-пополнений. Templates как таковые можно начать отдельно.
- Приоритет: P2 — ускоряет жизнь DM'у, но форма одной транзакции
  уже работает, так что не блокер.
- Связь с **spec-015** (items as nodes): когда появится, item-
  шаблоны будут ссылаться на item-ноды, а не свободным текстом.

### IDEA-045 [P2] «Текущая сессия» как DM-управляемый контекст → default day для форм
- **Feature**: cross-spec (spec-010 transactions + будущий session-runner)
- **Зависимость**: ждёт интерфейса «текущая сессия» для ДМа и игроков.
  Там будет runtime-состояние «сейчас играем сессию X, день N
  петли». ДМ двигает день в ходе сессии (partied 2 дня в городе →
  день+2).
- **Почему это важно для spec-010**: сейчас `defaultDayInLoop` в форме
  транзакции подставляется из **фронтира** PC (максимальный `day_to`
  по его `participated_in` сессиям). Это разумно для retro-ввода
  «после сессии», но в процессе игры DM может быть на дне 7, а
  фронтир PC — день 5. Игрок жмёт «+ Транзакция» — и получает 5
  вместо 7.
- **Когда «текущая сессия» появится**:
  - default для `dayInLoop` = текущий день ДМа, если он установлен.
  - default для `sessionId` = ID текущей сессии.
  - default для `loopNumber` = петля текущей сессии (и так уже
    почти всегда верно).
  - Player, открыв форму в процессе сессии, сразу попадает в
    правильный контекст без ручной правки caption-editor.
- **Упрощает TECH-009**: session picker в форме становится
  ненужным в 95% случаев, потому что default уже корректный.
- Источник: chat 37, обсуждение UX после smoke spec-010.

### IDEA-043 [P3] spec-010 bulk-edit и collapsed transfer row в ledger
- **Feature**: spec-010 UX polish
- Два follow-up улучшения для ledger page:
  - **Bulk-edit**: multi-select нескольких строк + массовая
    смена категории / удаление.
  - **Collapsed transfer row view**: toggle «показывать переводы
    одной строкой» — сейчас transfer отображается как две записи
    (sender leg + recipient leg). В одну строку с обоими PC'шниками
    читать быстрее, но теряется flexibility фильтрации.
- Низкий приоритет до жалоб от ДМ.

---

### DEBT-001 [P3] Chronicles не мигрированы в ноды графа
- **Feature**: spec-003 (граф как единая модель)
- Отдельная таблица `chronicles` с собственными `loop_number`, `node_id`,
  API routes `/api/chronicles/*`. Нарушает constitution I + II.
- Правильно: `chronicle_entry` как node type, `chronicle→node` и
  `chronicle→loop` как edges. Убирает отдельные API routes, отдельный
  компонент, дублирующийся `loop_number`.
- Не срочно. Отдельная фича на 0.5–1 день.

### DEBT-002 [P3] `008a_party.sql` — мёртвая таблица
- **Feature**: dx (cleanup)
- Таблица `party` и `party_members` созданы в миграции 008a_party, но
  ни одного `from('party')` в коде нет. Либо удалить миграцией 032,
  либо в комментарии задокументировать «reserved for IDEA-X».

### DEBT-003 [P2] ✅ DONE (chat 30) — SRD seed привязан к `slug='mat-ucheniya'`
- **Feature**: universality (constitution X) — open source blocker
- Миграции 003 (conditions), 005 (effects), 022 (exhaustion levels)
  инсертили в `WHERE c.slug='mat-ucheniya'`. Новая кампания, созданная
  через UI, получила бы пустой тип `condition`, ноль conditions,
  ноль effects → трекер энкаунтера сломан из коробки.
- **Решение**: `lib/seeds/dnd5e-srd.ts` — единый источник правды,
  идемпотентный сидер. `lib/campaign-actions.ts` — server action
  `initializeCampaignFromTemplate`. CLI `npm run seed-srd -- --campaign <slug>`
  для бэкфилла. Без новой SQL-миграции — чистая TS-логика.
- **Осталось**: когда появится UI «Создать кампанию», сразу после
  INSERT в `campaigns` вызывать `initializeCampaignFromTemplate`.

### DEBT-004 [P3] `to_tsvector('russian')` hardcoded
- **Feature**: i18n / universality
- Search trigger использует русский Snowball словарь. Англ/другие
  языки не получат stemming. Фикс: колонка `campaigns.language` +
  триггер читает её. Не срочно.

### DEBT-005 [P3] `loop` как node_type в каждой кампании
- **Feature**: universality
- Миграция 012 инсертит `loop` в каждую существующую кампанию. Новая
  кампания для обычной (без петли времени) игры получит лишний тип.
- Правильно: per-campaign feature flags (`campaign_features` table
  или `campaigns.features jsonb`).

### DEBT-006 [P3] `/api/chronicles`, `/api/nodes/*` — REST вместо actions
- **Feature**: dx (консистентность)
- Весь остальной проект — server actions. Только chronicles + nodes API
  остались на REST routes. Непоследовательно. При рефакторинге (например
  в DEBT-001) перенести на actions.

### DEBT-007 [P3] Zod схема для statblock
- **Feature**: dx (надёжность)
- `lib/statblock.ts` определяет тип Statblock (~40 полей в JSONB), но
  ни runtime validation, ни CHECK constraint. Один неверный write —
  и UI падает молча.
- Фикс: zod schema в `lib/statblock.ts`, использовать в
  `lib/encounter-actions.ts` на входе. 0.5 дня.

### DEBT-008 [P3] Глобальный error reporting
- **Feature**: dx / observability
- 18 мест с `console.error` в prod. Для open source нормально (юзер
  в консоль смотрит), но для серьёзного продакшна — надо Sentry или
  аналог. Обёртка `lib/log.ts` с `reportError()`.

### DEBT-009 [P3] `save-as-template-button.tsx` не подключён
- **Feature**: encounter templates (IDEA-001)
- Компонент + server action + миграция 007 существуют, но нигде не
  импортируется. Либо подключить в `encounter-grid.tsx` (IDEA-001
  как была помечена 🔜), либо удалить dead code.

### DEBT-010 [P3] Чистка legacy session-полей (`game_date`, `title`)
- **Feature**: spec-009 Loop progress bar — фоллоу-ап
- Миграция 033 убрала `game_date` и `title` из `default_fields` у типа
  `session`, но ДАННЫЕ в `nodes.fields` существующих сессий остаются
  до следующего сохранения формы — форма пишет только ключи из
  шаблона. Это ожидаемое поведение (коммент в 033), но через несколько
  месяцев legacy-данные станут шумом для грядущих аналитик.
- **Фикс**: follow-up миграция `UPDATE nodes SET fields = fields - 'game_date' - 'title' WHERE type_id IN (...)`
  когда spec-009 застабилизируется и появится уверенность, что старые
  значения никому не нужны.

---

## Новое (chat 25) — Spec-008 Факультативы ✅

Страница `/c/[slug]/electives` + CSV-импортёр + bulk-seed игроков.
См. NEXT.md секцию chat 25 для деталей.

### IDEA-037 [P2] Факультативы → бонусы к статам PC
- **Feature**: 008-electives (следующий этап)
- После заливки данных — трансформировать факультативы в мутации карточки PC:
  проверки (Навык «История»), черты (War Caster, Healer), способности
  («модификация Silent Image»), владения.
- Модель: поле `elective.effects jsonb` с массивом эффектов типа
  `{type:'skill_prof', skill:'history'}`, `{type:'feat', name:'War Caster'}`,
  `{type:'custom', text:'...'}`. Карточка PC агрегирует все has_elective
  → суммирует эффекты → показывает в секции «Бонусы от факультативов».
- Сначала ручное заполнение effects на каждой elective-ноде, потом
  авто-применение к PC (без ручного копирования статов).

### IDEA-038 [P3] Множественный выбор PC за раз на факультативе
- **Feature**: 008-electives
- Сейчас в таблице факультативов dropdown «+ добавить» открывает список
  PC и принимает клик по одному. Было бы удобнее чекбоксы + «Применить».
- Особенно актуально для факультативов типа «Метамагическая модификация»,
  где 8 PC разом.

### IDEA-039 [P3] История изменений факультативов
- **Feature**: 008-electives
- «Кто когда взял/снял какой факультатив». События через существующий
  event-sourcing (миграция 017) или отдельная `elective_events`.
- Для петли времени это критично в перспективе: «в петле 3 Янка взяла
  риторику, в петле 4 — нет».

### IDEA-040 [P2] node_types.slug фильтр в правой панели статблока
- **Feature**: 007-statblocks
- Сейчас при открытии статблока с правой панели он ищет все ноды
  в кампании. Логично фильтровать по type_slug='creature'|'npc'|'character'.
- Замечено при работе с факультативами: elective-ноды тоже попадают
  в пикер (неприятно).

### IDEA-041 [P2] Система фидбека внутри приложения
- **Feature**: ux / коммуникация в команде
- На каждом экране — большая кнопка «Фидбек» (FAB снизу-справа или
  в шапке). Клик → форма (textarea + опционально категория). Юзер
  пишет что не так / что хочется → отправляется.
- Каждая запись хранит `user_id`, `page_url`, `body`, `created_at`,
  опционально `category` ('bug' | 'idea' | 'other').
- В блоке с табами справа (сейчас табы есть только в энкаунтере —
  при реализации решить: глобальный rail или per-page; скорее
  глобальный slide-out со значком «фидбек»). Все участники кампании
  видят ленту: «кто что когда написал». Лайки/обсуждение — позже,
  для MVP просто список.
- Зачем: тестим всей группой, проще ловить баги/идеи прямо в момент
  использования, чем потом писать в чат. Также — исторический след
  как продукт развивался.
- Модель: миграция `032_feedback.sql` — таблица `feedback`
  (id, campaign_id, user_id, page_url, body, category, created_at),
  RLS — все участники кампании читают, любой авторизованный пишет.
- ~0.5–1 день: миграция + FAB + dialog + лента.

---

## Новое (chat 24)

### IDEA-034 [P2] Visibility='dm_only' для секретных нод
- **Feature**: 006-auth-and-roles (расширение после закрытия spec-006)
- Колонка `nodes.visibility enum('public','dm_only') DEFAULT 'public'`.
- RLS: `nodes_select` добавляет условие `visibility='public' OR
  is_dm_or_owner(campaign_id)`.
- UI: на карточке ноды чекбокс «Скрыть от игроков» (только для ДМа).
- Когда: когда появятся сюрпризные статблоки, закрытые NPC, планы
  следующей петли — т.е. появится что скрывать.

### IDEA-036 [P3] Единый canEdit для loops/sessions edit-страниц
- **Feature**: dx
- Сейчас `/loops/[id]/edit` и аналоги не обёрнуты в `canEdit`-паттерн.
  Игрок получит ошибку от RLS при попытке сохранить, но UI это не
  прячет. Привести к тому же паттерну что и `catalog/[id]/edit`.
- Низкий приоритет: loops/sessions редко правятся, а RLS защищает.

---

## Старое (chat 22 и ранее)

Updated-before: 2026-04-19 (chat 22)

---

## Новое (chat 22)

### Инкремент 2 spec-006 готов: /members для owner
- **Feature**: 006-auth-and-roles
- Страница `/c/[slug]/members` доступна только owner'у.
- Create/reset-password/remove через Server Actions за `requireOwner` гейтом.
- Создание ДМа ставит `must_change_password=true` → юзер сменит пароль при
  первом входе (работает единая онбординг-воронка из инкремента 1).
- `updateMemberRoleAction` написан, но UI не подключён — ждёт инкремента 3
  (превращение dm↔player).

### IDEA-035 [P3] Owner transfer
- **Feature**: 006-auth-and-roles
- Сейчас unique-индекс в БД гарантирует exactly-one-owner. Чтобы передать
  владение, нужна атомарная операция: старый owner → dm, новый dm → owner.
- Делать **не** через updateMemberRoleAction (она запрещает `role='owner'`
  осознанно), а через отдельную `transferOwnershipAction` с транзакцией.
- Когда: после инкремента 4. Реальная потребность — когда у пользователя
  появится вторая кампания, где он не владелец.

---

## Старое (chat 20 и ранее)

Updated-before: 2026-04-19 (chat 20)

---

## Новое (chat 20)

### Stage 3 готов: PillEditor
- **Feature**: 002-encounter-tracker / spec-007 stage 3
- `components/encounter/pill-editor.tsx` — ClickUp-style контекст-попап.
- Клик по пилюле больше не удаляет, а открывает меню с метой
  («с раунда N») и кнопкой «Убрать».
- API расширяемый: `actions: PillAction[]` — stage 5 может накинуть
  «Переименовать», «Сменить цвет» без ломания контракта.
- Осталось в этапе 4: stage 4 (трекер трат action/bonus/movement),
  stage 5 (rename/color в PillEditor).

### IDEA-034 [P3] Расширение PillEditor: rename, color, round override
- **Feature**: 002-encounter-tracker / spec-007 stage 5
- Фундамент в `pill-editor.tsx` готов — принимает массив actions
  с полем tone. Нужна реализация конкретных действий:
- **Rename**: инлайн-редактирование имени условия на одной пилюле.
  Решить: переименовываем только локально на этом participant или
  глобально в suggestions (тогда у всех)? Скорее всего — локально,
  с опциональным чекбоксом «применить ко всем».
- **Color**: требует `fields.color` на condition-нодах каталога.
  Сейчас все пилюли серые. Добавить 6-8 цветов из палитры токенов
  (amber/red/blue/green/purple…) как пресет.
- **Round override**: ручная правка `round` (если ДМ накладывал
  условие задним числом или забыл вовремя убрать).
- **Когда делать**: после stage 4 (трекер трат) и перед общей
  панелью реакций. Реальная потребность появится когда ДМ начнёт
  ловить «мне нужно быстро вернуть это условие на раунд раньше»
  или «у меня 3 разных Отравлен, хочу их визуально отличать».

---

## Новое (chat 19)

### Stage 2 готов: AC + death saves + # column + role dot возле имени
- **Feature**: 002-encounter-tracker / spec-007 stage 2
- Миграция 023 добавила `encounter_participants.ac int` + `death_saves jsonb`.
- Новые колонки в гриде; role dot переехал к имени; `#` теперь номер строки
  с индикатором bulk-select.
- Осталось в этапе 4: PillEditor (stage 3) и трекер трат action/bonus/movement (stage 4).

---

## Новое (chat 13)

### ~~BUG-013~~ ✅ FIXED SRD-монстры добавлялись с HP=0
- **Feature**: 002-encounter-tracker
- Fixed: `max_hp ?? hp` fallback в add-participant-row, encounter-catalog-panel, parseStatblock.
- Причина: SRD seed (миграция 019) пишет HP в `fields.hp`, homebrew — в `fields.max_hp`. Код читал только max_hp.

### IDEA-033 [P2] Homebrew / canon статус на карточках
- **Feature**: catalog / statblock
- Визуально отличать SRD-монстров от homebrew. Тэги `srd`/`canon` уже есть в seed.
- В хедере статблока и в карточке каталога — маленький бэйдж "SRD" (серый) или "Homebrew" (синий).
- Фильтр в каталоге: "только homebrew", "только SRD".
- Позже: система "оверрайдов" (IDEA-024) — взять SRD-ноду как основу, сделать копию с префиксом "Homebrew: ...".

---

## Roadmap энкаунтера (legacy — работа без папки спеки)

Работа шла под названием «Spec-007», но папка `.specify/specs/007-*/`
так и не создалась. Сделанное уже в проде, отложенное — получает
отдельную нормальную спеку при старте.

Цель была: убрать когнитивную нагрузку ДМа — все доступные действия
видны без переключения вкладок. Правая панель с actions/bonus/reactions/legendary
+ общий блок реакций и легендарок. Mobile-first для игрока.

**Сделано и в проде:**
- Этап 1 (фундамент статблоков) — миграции `018`+`019`, парсер SRD, 10 монстров.
- Этап 2 (правая панель) — actions как кнопки, мульти-таргет пикер, счётчики.
- Этап 4 stage 1-3 (Excel-like grid) — рестайл на токены, AC+death saves, PillEditor.

**Отложено (каждое — своя спека при старте):**
- Этап 3 (общая панель реакций/легендарок) — агрегат реакций всех живых.
- Этап 4 stage 4 (трекер трат на ход) — action/bonus/reaction счётчики.
- Этап 4 stage 5 (PillEditor v2) — rename pill, выбор цвета.
- Этап 5 (мобилка игрока) — режим игрока, после полного auth.

Паттерн Prototype: participant = deep clone базовой ноды монстра + оверрайды.
Предметы/эффекты добавляют записи в actions/passives с `source: item_id`.

---

## Bugs

### ~~BUG-001~~ ✅ FIXED
New entity didn't appear in catalog without page reload.
Fixed: `router.refresh()` after `router.push()` in `create-node-form.tsx`.

### ~~BUG-002~~ ✅ FIXED HP нельзя редактировать напрямую
- **Feature**: 002-encounter-tracker
- Fixed: currentHp теперь кликабельный — клик → inline input → Enter/blur → сохранение
- Найдено: 2026-04-15, исправлено: 2026-04-15

### ~~BUG-003~~ ✅ FIXED Клонирование участников — сбой нумерации
- **Feature**: 002-encounter-tracker
- Fixed: клон теперь ищет все существующие номера и берёт следующий свободный
- Найдено: 2026-04-15, исправлено: 2026-04-15

---

## Features

### ~~FEAT-002~~ ✅ DONE
Incoming edge creation from target node card.
Done: direction toggle in `create-edge-form.tsx`, flips source/target on save.

### FEAT-001 [P3] Edge type constraints (allowed source/target types)
- **Feature**: 001-entity-graph
- `edge_types` gets `allowed_source_types` / `allowed_target_types` arrays
- CreateEdgeForm filters target nodes by constraint

### ~~FEAT-004~~ ✅ DONE
UI consistency: unified design tokens across all non-encounter components.
16 files, single token system: inputs, buttons, cards, headers, empty states, errors.

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships

### ~~FEAT-005~~ ✅ DONE
НПС/Монстры: max_hp + ссылка на статблок → авто-HP в энкаунтере.
Migration 013. creature → "Монстр". URL fields render as links in node-detail.
Statblock icon in participant-row and catalog-panel.

---

## Ideas

### IDEA-042 [P3] PC session history — full list with expand/collapse
- Сейчас на карточке PC в рамках spec-009 показывается только
  character frontier текущей петли + до 3 последних сессий.
- Когда у PC накопится много сессий (например, 40+ за несколько
  петель), нужен полный список с «Раскрыть все» / пагинацией.
- Минор, не блокирует spec-009/010.
- Источник: chat 34, обсуждение plan-009.

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.

### IDEA-002 Git-style constitution versioning
- **Feature**: dx

### ~~IDEA-003~~ ✅ DONE → ПЕРЕОСМЫСЛЕНО
- Было: дерево в сайдбаре (Chronicler-style вложенность)
- Стало: плоский список + конфигурируемая группировка (принцип III-b)
- Вложенность через `contains` остаётся как связь, но НЕ как навигация
- Сайдбар = универсальный компонент с пропсами visibleTypes + columns + groupBy

### IDEA-004 Per-file .md documentation with cross-references
- **Feature**: dx
- Status: on hold

### IDEA-005 Responsive mobile layout
- **Feature**: ui
- 375px viewport support for encounter tracker (horizontal scroll on table)
- Mobile-friendly catalog navigation

### ~~IDEA-006~~ ✅ DONE Карточка персонажа с Markdown-контентом
- Миграция 011: колонка `content` в nodes
- MarkdownContent компонент: view/edit с превью
- react-markdown + remark-gfm + @tailwindcss/typography

### ~~IDEA-007~~ ✅ DONE Летопись персонажа
- Chronicles компонент: CRUD записей с привязкой к петле и дате
- API routes: POST/PUT/DELETE /api/chronicles

### IDEA-008 Граф-визуализация / майндмапа сущностей
- **Feature**: 008-graph-view
- Интерактивная визуализация графа нод и рёбер
- Варианты: полный граф / вокруг одной ноды / по типу рёбер
- Исследовать: react-flow, cytoscape.js, d3-force, sigma.js
- Не делать раньше времени — сначала наполнить данными

### IDEA-009 Realtime-синхронизация энкаунтера (мультиплеер)
- **Feature**: encounter
- Несколько юзеров на странице энкаунтера → все видят изменения HP, инициативы, хода в реальном времени
- Supabase Realtime: подписка на `encounters` и `encounter_participants` через `.on('postgres_changes', ...)`
- Ключевые сценарии: ДМ меняет HP → игроки видят мгновенно; ДМ жмёт "Следующий ход" → у всех обновляется
- Конфликты: optimistic UI + realtime = нужна стратегия (last-write-wins достаточно для MVP)
- Конституция VI: мульти-ДМ и мультиплеер — первый шаг к realtime

### ~~IDEA-010~~ ✅ DONE Энкаунтер-трекер: Excel-first редизайн
- v2: spec-005. v3: полная пересборка с нуля, −2361 строк мёртвого кода.

### ~~IDEA-019~~ ✅ DONE Массовое выделение строк в трекере
- **Feature**: 005-encounter-tracker-v2
- Click/Ctrl+Click/Shift+Click для выделения строк
- Редактирование HP/инициативы/роли/tempHP → применяется ко всем выделенным
- HP парсит raw input (−10 = дельта к каждому)
- Массовое удаление, toggle active
- Escape = снять выделение

### ~~IDEA-020~~ ✅ DONE Широкий интерфейс ДМа (full-width layout)
- max-w-5xl убран из layout, перенесён в отдельные страницы
- Энкаунтер занимает всю ширину экрана

### IDEA-011 [P1] Temporal State Viewer — персонажи во времени и пространстве
- **Feature**: 005-temporal-viewer (новый спек)
- Экран: внизу — слайдер времени (петля → день → час, не дробнее)
- Вверху — карта локаций (прямоугольники) с токенами игроков внутри
- Скроллинг слайдера → видно как персонажи перемещаются между локациями
- Клик на персонажа → его стейт в этот момент времени (статы, инвентарь, HP)
- Ключевое: есть фронтир "сейчас" — дальше мотать нельзя
- "Сейчас" продвигается во время игр или между сессиями
- Это визуализация принципа I конституции v3 (петля как ядро)
- Требует: модель состояний персонажей привязанных к (петля, день, час)
- Найдено: обсуждение 2026-04-15

### IDEA-012 Конституция кампании (world rules as data)
- **Feature**: 006-campaign-constitution
- Человекочитаемый документ с правилами мира: сеттинг, тон, homebrew, домашние механики
- Примеры: "высокомагический мир", "power fantasy", "крит = макс кубик + бросок"
- Два уровня: для ДМа (полный) и для игроков (упрощённый, без спойлеров)
- Хранится как нода типа `campaign-doc` или как поля кампании
- Машиночитаемый формат → можно выгрузить как LLM-контекст
- Связь: IDEA-013 (AI-генерация использует это как system prompt)

### IDEA-013 LLM-контекст и AI-генерация
- **Feature**: 007-ai-generation
- Выгрузка контекста кампании для LLM: конституция мира + граф сущностей + текущий момент
- Юзкейсы: сгенерировать НПС, энкаунтер, лут, диалог — всё в стиле кампании
- "На основе старых" = RAG по существующим нодам
- Требует: IDEA-012 (конституция кампании), наполненный граф
- Долгосрочная цель: приложение не только записывает, но и генерирует

### IDEA-014 Авто-бой и авто-лут (тривиальные энкаунтеры)
- **Feature**: 002-encounter-tracker (расширение)
- ДМ помечает пройденный энкаунтер как "тривиальный"
- При похожем энкаунтере в будущем → предложение авто-резолва
- Рогалик-механика: прогрессия = старые проблемы автоматизируются
- Требует: шаблоны энкаунтеров (IDEA-001 ✅), difficulty rating

### IDEA-015 Модель "Игрок заявляет → ДМ подтверждает" + ЛОГ ДЕЙСТВИЙ
- **Feature**: 002-encounter-tracker (переосмысление)
- **UI**: Excel-таблица сверху (состояние) + ЛОГ ДЕЙСТВИЙ снизу (хронология) — центр экрана
- Энкаунтер как поток событий: игрок отправляет заявку (абилка + цель), ДМ подтверждает/отклоняет/модифицирует
- Лог фиксирует только подтверждённые действия: "Маркус → Удар → Лиловый червь → ✓ 14 урона"
- Игроки готовят действия между ходами: открывают телефон, выбирают абилку, выбирают цель
- ДМ видит очередь заявок, одним тапом подтверждает или отклоняет
- Любое решение можно откатить (undo)
- Импровизация: игрок может написать произвольный текст, ДМ дописывает результат
- Связь: event sourcing (конституция v3 принцип V), IDEA-009 (realtime), IDEA-014 (авто-бой)
- Требует: realtime, роли (ДМ/игрок), модель событий
- **MVP лога**: простой текстовый лог на странице энкаунтера (ДМ пишет вручную), без модели событий

### IDEA-016 Авто-рекапы из событий боя
- **Feature**: 002-encounter-tracker + 007-ai-generation
- Если бой ведётся через события → механический лог пишется автоматически
- "Раунд 1: Дрипли атаковал Тролля-2, попал, 14 урона. Тролль-2 убит."
- LLM превращает механический лог в нарративный рекап
- История боёв хранится, доступна для просмотра
- Облегчает вкат новых игроков: можно прочитать что было
- Требует: IDEA-015 (модель событий), IDEA-013 (LLM-контекст)

### IDEA-017 Конструктор персонажа слоями (progression builder)
- **Feature**: 004-character-sheet
- Персонаж = базовая нода + стек эффектов (раса, класс, предметы, баффы, уровни)
- Каждый эффект = событие, итоговый стейт = replay всех эффектов
- Режим "создаём персонажа": пошагово накидываем слои, видим результат
- Не нужно заполнять огромную таблицу — конструктор ведёт за руку
- Снижает порог входа: 30 человек в чате, 15 играет, 15 смотрит — сложно изучать рулбуки
- Связь: event sourcing (принцип V), лист персонажа (приоритет №3)

### IDEA-018 Гайд по кампейну (onboarding pack)
- **Feature**: 006-campaign-constitution (расширение)
- Набор markdown-нод типа `campaign-doc`: суть игры, правила, рекап мира, пересказ книги, ссылки
- "Почему во главу угла ставится веселье и истории" — философия кампейна
- Краткий рекап: что произошло, где мы сейчас
- Версия для ДМа (полная) и для игрока (без спойлеров)
- Решает реальную проблему: людям интересно, но сложно вкатиться
- Связь: IDEA-012 (конституция кампании)

### IDEA-021 [P4] Cell-as-tile: ECS для UI-ячеек (SS13-подход)
- **Feature**: ui-architecture
- Каждая ячейка грида = атомарный "тайл" с набором свойств (тип данных, рендерер, валидация, хоткеи, состояние выделения)
- По сути ECS (Entity Component System) на уровне UI
- Аналогия: SS13 tile system, AG Grid cell renderer, Google Sheets cell
- Сейчас 3 типа ячеек (EditableCell, HpCell, TagCell) — мало данных для абстракции
- **Триггер**: когда типов ячеек будет 8+ и паттерн копипасты начнёт бесить
- **Не делать раньше**: нужен опыт из лога действий, листа персонажа, character builder
- Связь: IDEA-019 (горячие клавиши), IDEA-020 (full-width layout)

### IDEA-022 [P3] Генеалогическое древо персонажей (app-визуализация)
- **Feature**: graph-apps
- Визуализация семейных и родственных связей между персонажами
- По сути — один из "аппов" поверх графа: фильтр по рёбрам типа `parent_of`, `sibling`, `married_to` → визуальное дерево
- Идея от игрока (Катя?): хочет строить родословные персонажей
- Реализация: плоские ноды + рёбра родства → рендер как дерево (d3-hierarchy / react-flow)
- Не требует вложенности в данных — структура дерева = результат запроса по рёбрам
- Хороший тест принципа III-b: плоские данные → визуализация как иерархия
- Новые edge_types: `parent_of`, `sibling`, `married_to`, `adopted_by`
- Связь: IDEA-008 (граф-визуализация), принцип III-b (плоская навигация)

### ~~IDEA-023~~ ✅ DONE Сайдбар-каталог для энкаунтера
- **Feature**: 005-encounter-tracker-v2 (расширение)
- EncounterCatalogPanel: группировка по типу, поиск, max_hp, статблок
- Один клик → добавить в энкаунтер
- Grid: forwardRef + useImperativeHandle для внешних вызовов
- Flex-layout: grid+log | catalog panel

### IDEA-024 [P2] Сеттинг как пакет: канон + кампейн-оверрайды
- **Feature**: campaign-settings / distributable-worlds
- Два слоя данных: **сеттинг** (канон из книги/системы) и **кампейн** (что родилось в игре)
- Тег `canon` на нодах + раздел "Канон" в markdown-контенте (MVP)
- Полная версия: сеттинг = базовый пакет нод (НПС, локации, события, сюжет, связи)
- Кампейн = форк сеттинга с оверрайдами: каноничные ноды наследуются, кастомные добавляются
- Карточка НПС: секция "Канон" (из книги, read-only) + секция "Кампейн" (ваша версия, editable)
- Конечная цель: собрать "Mother of Learning" как готовый кампейн-сеттинг под ключ
  → новый ДМ скачивает → добавляет своих PC → играет
- Это и продукт (готовые сеттинги), и killer feature (community-driven пакеты миров)
- Связь: принцип IX (универсальность), IDEA-012 (конституция кампании), IDEA-018 (onboarding pack)
- Новые edge_types для канона: `canon_version_of` (кампейн-нода → канон-нода)

### IDEA-025 [P2] Статистика петли: "что изменилось"
- **Feature**: temporal / loop-analytics
- Экран сравнения двух петель: что изменилось в мире, у персонажей, в связях
- "Петля 3 vs Петля 4, день 15" → diff по нодам, рёбрам, событиям
- Связь: принцип I (петля как ядро), принцип V (event sourcing)
- **Тайминг**: разработка ≈ через месяц, когда доиграем текущую петлю — будут реальные данные для сравнения
- Требует: наполненные данные по минимум 2 петлям

### IDEA-026 [P1] Единый лог событий — дорожная карта инкрементов
- **Feature**: event-log / core-architecture
- Каждое действие (бой, социалка, исследование) = запись в логе
- Стейт = replay всех подтверждённых событий (принцип V конституции)
- Нет разницы бой/социалка — в бою есть раунды, в социалке нет

**Инкременты (каждый — самостоятельная ценность):**

1. ✅ **Текстовый лог** — уже есть (encounter_log, миграция 015). ДМ пишет вручную.

2. ✅ **Временная привязка событий** — условия/эффекты записываются с координатой `{round}`.
   Миграция 016: text[] → jsonb. TagCell показывает номер раунда. Автолог при добавлении/снятии.

3. ✅ **Структурированные события** — таблица `encounter_events` с jsonb result.
   Типы: hp_damage/heal, condition/effect add/remove, round/turn_start, custom.
   Merged timeline рендерит события + текст ДМа вместе. Миграция 017.

4. **Лог вне боя** — те же события, но без раунда: социалка, исследование,
   торговля. Энкаунтер = любая сцена, не обязательно бой.
   Поле `encounter.mode`: `combat` (инициатива, раунды) / `scene` (свободный порядок).

5. **Игрок → ДМ поток** (IDEA-015) — игрок отправляет заявку (абилка + цель),
   ДМ подтверждает/отклоняет/модифицирует. Требует: realtime (IDEA-009), роли.
   Каждое подтверждённое действие = запись в лог.

6. **Авто-рекапы** (IDEA-016) — механический лог → LLM → нарративный рекап.
   Требует: инкремент 3 (структурированные события), IDEA-013 (LLM-контекст).

- Связь: принцип V (event sourcing), IDEA-009 (realtime), IDEA-015, IDEA-016
- Каждый инкремент самостоятелен: можно остановиться на любом и иметь пользу

### IDEA-027 [P3] Гендер и свойства сущностей → склонение в логе
- **Feature**: data-model / encounter-log
- Гендер (м/ж/ср) = поле в fields ноды → используется для склонения глаголов в авто-логе
- "Аранеа потеряла 17 хп" vs "Дрипли потерял 17 хп"
- Общая мысль: каждая сущность = своя мини-таблица свойств (как тайлы в SS13)
- Свойства типизированы, рендерятся на карточке, влияют на поведение (лог, формы, фильтры)
- Связь: IDEA-021 (cell-as-tile ECS), принцип I (атомарность данных)

### IDEA-028 [P2] Клонирование ноды как homebrew-вариант
- **Feature**: 001-entity-graph
- Кнопка «Создать копию» на карточке ноды → форма создания pre-filled
  всеми fields исходной ноды, title = "Копия {original}". Сохранить →
  новая нода с теми же type_id и tags, independent от оригинала.
- Опционально: ребро `variant_of` (parent → child) между оригиналом
  и копией, чтобы видеть генеалогию.
- Use case:
  - SRD-монстр → homebrew-версия (Goblin → Goblin Shaman со spellcasting)
  - Магические предметы с upgrade-путями (+1 / +2 / +3 версии)
  - NPC-симулякры и двойники
  - НЕ для истории PC — у PC это линейное развитие одной ноды, не вариант
- Отличие от spec-007 Prototype: тот клон живёт в participant энкаунтера,
  этот — в каталоге как самостоятельная нода.
- **Когда делать**: после spec-007 этап 4 (Excel-like grid), перед логинами.
  Причины:
  1. К этому моменту SRD-монстры активно используются на сессиях — давление
     на homebrew-варианты максимально, фича будет закрывать реальную боль.
  2. Модель данных после всех этапов трекера стабилизируется — клонирование
     нужно продумывать с учётом: что делать с рёбрами (located_in, owns),
     с тегами (`srd`/`canon` копировать или нет), с содержимым поля `source_doc`.
  3. Этап 2 трекера (participant = deep clone ноды) даст опыт клонирования —
     перенос паттерна в каталог станет естественным рефакторингом, а не
     новой конструкцией с нуля.
  4. Не конфликтует с RLS/ролями (они появляются на логинах) — копия
     наследует campaign_id от оригинала, разрешения применяются автоматически.

### IDEA-029 [P2] Заклинания как структурированный JSON + расходники
- **Feature**: spells (spec TBD, после 007)
- Заклинания сейчас живут как текст в action.desc. Нужна отдельная структура:
  - `{ name, level, school, casting_time, range, components: {v,s,m,material?}, duration, desc, at_higher_levels? }`
  - Slots trackery: `spell_slots: {1: {max, used}, 2: {max, used}, ...}` на participant или node
  - Material components как расходники (e.g. "diamond worth 300gp" для Revivify)
  - Concentration — один эффект на существо, автоматически снимается при касте нового concentration-заклинания
- Магические предметы на НПС: свой slot пула (charges), свой список spells
- Интеграция со StatblockPanel — отдельная секция "Заклинания" с уровнями и слотами
- Парсинг из SRD open5e (spells API) — аналог parse_srd.py
- **Когда делать**: после логинов + мобилки. Боль высокая у кастеров, но
  не блокирует основной флоу боя. Требует UI для каста (выбор уровня слота,
  затраты материала).

### IDEA-030 [P3] Базовые реакции для существ (Attack of Opportunity)
- **Feature**: 007 (или постскриптум)
- По D&D 5e почти у каждого существа есть Opportunity Attack — если
  противник уходит из досягаемости без Disengage, можно атаковать.
  Сейчас это надо вручную добавлять в каждый statblock.
- Идея: в parse_srd.py / в seed-миграции добавить default reaction
  "Attack of Opportunity" всем существам с melee-атакой, если её нет
  явно в reactions.
- Альтернатива: хранить "default_reactions" в node_type.default_fields
  и мёрджить на рендере, чтобы не плодить данные.
- Расширяется: у драконов — Wing Flank, у спелкастеров — Counterspell,
  и т.д. Но это уже per-creature, в seed.

### IDEA-031 [P3] Фиты (feats) у НПС и монстров
- **Feature**: 007
- Сейчас fields поддерживают actions / passives / legendary / reactions,
  но не `feats`. Фиты (Great Weapon Master, Sentinel, Lucky, Spell Sniper…)
  — отдельная категория с собственным эффектом на игру.
- Shape: `feats: [{ name, desc, source?, tags?: ['combat'|'utility'] }]`
- В StatblockPanel — отдельная секция "Фиты" (между Passives и Legendary).
- Большинство фитов = passive modifiers, но некоторые дают новые actions
  (Polearm Master bonus attack). Такие — дублировать в bonus_actions,
  либо ссылкой `source: 'feat:polearm-master'`.
- SRD фиты доступны в open5e — расширить parse_srd.py.

### IDEA-032 [P2] Схлопывание группы одинаковых существ (20 гоблинов)
- **Feature**: 007 (вероятно этап 4 или 6)
- Боль: 20 кобольдов с одной инициативой забивают грид и выматывают ДМ.
- Идея: если в бою N участников с одним `node_id` и одной `initiative`
  (и одинаковой ролью/активностью) — схлопывать их в один ряд "Кобольд ×20".
- Раскрытие: клик по ряду → показать отдельные строки (как сейчас).
- Агрегатное состояние:
  - Суммарное HP: `Σ current_hp / Σ max_hp` (например `112 / 140`)
  - Счётчик живых: `осталось 13 из 20`
- ДМ записывает урон суммой: "−35 урона" → система применяет к группе:
  - умирает N существ с наименьшим HP сначала, остаток идёт в одно раненное
  - альтернатива: ДМ выбирает, кого именно «добить» (для правила Cleave)
- Условия/эффекты: применяются либо ко всей группе, либо к выбранным
  (нужен пикер при добавлении условия на группу).
- Реализация: вероятно отдельная таблица `encounter_group` или флаг
  `group_key` на participant, но данные остаются атомарными (каждое
  существо — отдельный participant), просто представление агрегировано.
- **Связано с IDEA-027** (совместный ход в инициативе) и IDEA-028
  (клонирование ноды).

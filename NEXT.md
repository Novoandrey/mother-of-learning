# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-24 (chat 45 — BUG-018 encounter role gate)

## В проде сейчас

- **spec-001 Каталог сущностей**: граф нод+рёбер, поиск, фильтры, создание
- **spec-002/005 Трекер энкаунтера v3**: инициатива, HP, условия, эффекты, лог
- **spec-003 Петли и сессии как ноды**: миграции `008a`-`012`
- **spec-006 Auth + роли**: миграции `024`, `027`-`028`, `031`
- **spec-009 Loop progress bar + session packs**: миграции `032`-`033`
- **spec-010 Transactions ledger (chat 37-38)**: миграция `034`. Новая
  top-level app `/c/[slug]/accounting` (ledger + /settings/categories).
  Single-file UI: `transaction-form.tsx` поддерживает все три kind'а
  (money/item/transfer). Wallet block на странице PC (balance +
  recent 10 + «+ Транзакция»). Transfer — две связанные записи
  через `transfer_group_id`. Категории сидятся per-campaign
  (6 дефолтных: income/expense/credit/loot/transfer/other), scope-
  based таблица готова к spec-015 (item). Vitest подключён
  (47 pure-unit tests). Nav tab «Бухгалтерия» для всех member'ов.
  На session page секция «Транзакции» (stretch).
  **Chat 38 polish**: дефолтный день транзакции подставляется
  data-driven helper'ом `computeDefaultDayForTx` (latest tx →
  frontier → 1) — день «липнет», не откатывается при повторном
  открытии формы. В форме `loop` read-only, `day` — inline input
  без expand. `amount-input` per-denom panel без синего wrapper'а.
  Accounting page prefetchит `defaultDayByPcId` для всех
  доступных PC параллельно.
- **spec-011 Common stash / Общак (chat 40)**: миграции `035`+`036`.
  Новая нода type='stash' на кампанию, page `/c/[slug]/accounting/stash`
  (wallet + items grid + recent). `<StashButtons>` на PC-странице и
  в ledger actor bar — put/take одним тапом. Shortfall prompt в форме
  расхода (rich/poor/empty modes), lazy `getStashAggregate`. Item-
  трансферы через `createItemTransfer` с подписанным `item_qty`
  (sender=−qty, recipient=+qty) — миграция 036 релаксит CHECK до `<> 0`.
  `aggregateStashLegs` (pure, 9 тестов), `computeShortfall` (pure, 7
  тестов). Wallet-block переименован `pcId`→`actorNodeId` — тот же
  компонент рендерится и для PC, и для stash. Forward-compat с
  spec-015: `InventoryGrid` параметризуется `keyFn` для будущего
  `itemNodeId`. Catalog роут stash-ноды редиректит на `/accounting/stash`.
- **spec-011 polish Slice A (chat 42)**: универсальный
  `<TransactionRow>` — one-line layout, цвета `emerald-700 / red-700 /
  gray-700`, prefix `+/−/×`, WCAG AAA контрасты, day chip `д.N·с.M`,
  actor → counterparty для переводов. Заменяет старые inline-вёрстки
  в `wallet-block-client` и `ledger-list-client`. `ledger-row.tsx`
  удалён. Data-layer: добавлено поле `counterparty: { nodeId, title } |
  null` в `TransactionWithRelations`, новый `hydrateCounterparties`
  (один доп. запрос по `transfer_group_id`). Схема БД не меняется.
- **spec-011 polish Slice B (chat 42→43)**: stash page как табы над
  ledger. Новый `<BalanceHero>` + `<BalanceHeroClient>` — только hero
  card (без inline recent list). Новый `<StashPageTabs>` — «Предметы»
  (`<InventoryGrid>`) / «Лента транзакций» (`<LedgerList>` с новым
  prop `fixedActorNodeId` — override filter, hide actor chip, скрыть
  «N персонажей» stat). Оба таба всегда смонтированы, переключение
  CSS-only (сохраняет filter/scroll state). Stash page теперь:
  Header → BalanceHero → StashPageTabs. Устраняет дубляж UX между
  `/accounting` и `/accounting/stash` — внутри таба сразу красивые
  ряды из Slice A. `<WalletBlock>` для PC-страниц не трогался.
- **Ledger filter bar collapsible (chat 43)**: `components/ledger-filters.tsx`
  переписан. Свёрнут по умолчанию — показывает только кнопку
  «Фильтры (N)» + активные фильтры как removable chips + «Сбросить
  всё». Клик по кнопке разворачивает полную multi-group панель.
  URL по-прежнему single source of truth; `expanded` — local UI
  state. Дополнительно: новый prop `currentLoopNumber` — маркер «●»
  рядом с номером текущей петли в развёрнутом виде, подпись
  «Петля №3 · текущая» в active-chip.
- **Item ownership guard (chat 43, BUG-fix)**: `createItemTransfer`
  теперь агрегирует `item_qty` по (sender, item_name, loop_number)
  перед insert'ом и отклоняет перевод если `owned < qty`. Фиксит
  случай когда PC «кладёт в общак» предмет, которого у него нет —
  ранее создавалась пара легов (sender=−qty, recipient=+qty),
  оставляя у PC «отрицательный инвентарь», невидимый в UI.
  Ошибка: «У персонажа недостаточно «X» — есть N, нужно M. Сначала
  запишите получение предмета отдельной транзакцией.»
- **Transfer-pair collapse — IDEA-043 (chat 44)**: в `/accounting`
  каждый перевод рендерился двумя зеркальными рядами (sender leg +
  recipient leg). Новый pure-хелпер `lib/transaction-dedup.ts`
  (17 unit-тестов) — `dedupTransferPairs` оставляет канонический
  sender leg (с отрицательным знаком), `countDistinctEvents` считает
  пары как одно событие. Применён в `getLedgerPage` per-page +
  в `ledger-list-client` при merge пагинации (для сглаживания
  boundary-случаев). Totals `count` теперь «события», не «legs».
  Per-actor views (PC wallet, stash tab, любой `pc=…` filter) не
  затронуты — sibling leg там и так отсекался фильтром.
- **BUG-018 encounter role gate (chat 45)**: до фикса игрок
  кликал «Удар скимитаром», RLS режил write, но локальный
  `participantsSnap` на page-client обновлялся. Grid рендерил свой
  независимый `participants` state — asymmetry: в target-пикере
  damage виден, в гриде нет, F5 сбрасывал. Фикс в 4 файлах:
  страница энкаунтера читает membership, считает `canEdit` и
  прокидывает в клиент. `handleActionResolved` делает ранний exit
  с одним alert'ом для игрока, write-first/state-after для DM,
  sync grid через новый imperative handle `setParticipantHp`. Хук
  `useParticipantActions` для игрока возвращает noop-ы с
  warn-once alert'ом — все 18 mutation-колбэков сразу disabled.
- **Статблоки монстров** (без папки спеки): миграции `013`-`014`, `018`-`020`, `023`
- **Excel-like grid энкаунтера**: рестайл на design tokens, AC+death saves, PillEditor
- **Markdown + Летопись**: миграции `011`, `015`-`017`
- **Факультативы**: миграция `029`
- **PC roster v2**: миграция `030`
- **Shared world editing + perf**: миграция `031`, React `cache()`, `Promise.all`
- **TECH-003**: убрано 21 `any` из join-ответов, утилита `lib/supabase/joins.ts`
- **Ultrareview-полишинг (chat 28)**: BUG-014, TECH-001, TECH-002,
  TECH-004, UX-001, UX-002
- **BUG-015 (chat 29)**: удаление ноды → router.back() с fallback
- **TECH-005 (chat 29)**: `middleware.ts` → `proxy.ts` (Next 16)
- **DEBT-003 (chat 30)**: SRD seed в `lib/seeds/dnd5e-srd.ts` +
  server action + CLI
- **BUG-016 + TECH-006 (chat 31)**: аудит invalidate сайдбара
- **TECH-007 (chat 32)**: invalidate-from-CLI endpoint

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `036_item_qty_signed.sql`

## Следующий приоритет

**Spec-011 закрыта**. T034 hand-walkthrough пользователь прогнал
(chat 45, «всё ок, буду делать доработки после spec-015»). Весь
Slice A+B, filter collapse, ownership guard, transfer-pair collapse
(IDEA-043) и BUG-018 encounter gate — в проде.

**Следующее — Spec-012** из `.specify/memory/bookkeeping-roadmap.md`
(следующая в серии 009-015). В новом чате: Specify → Clarify → Plan
→ Tasks → Implement.

**Параллельно** — spec-016 Сборы (Clarify → …) записан только
spec.md. Пользователь выберет в новом чате spec-012 vs spec-016.

### Последняя строка хвостов

- IDEA-043 ✅ (chat 44) — collapsed-transfer-row в /accounting.
- Bulk-edit ещё нет (часть старого IDEA-043) — может всплыть
  отдельно если будет запрос.

### Параллельные кандидаты

- **IDEA-037** [P2] — факультативы → бонусы к статам PC
- **IDEA-041** [P2] — система фидбека внутри приложения
- **Spec-007 этап 4 stage 4** — трекер трат на ход (action/bonus/movement)
- **Encounter race conditions** [P3] — одновременные правки grid'а
- **Мобилка игрока** (Spec-007 этап 5) — большая фича, ждёт решения

### Хвосты spec-010 (не блокеры)

- Session binding в форме: сейчас session подставляется только из
  фронтира, ручное переназначение отложено (см. TECH-009 /
  IDEA-045).
- Ledger totals считаются в памяти (`getLedgerPage` тянет агрегат
  без LIMIT). В плане есть follow-up про materialized view на
  (campaign, loop, pc) — актуально когда mat-ucheniya перевалит
  за ~тысячу транзакций (TECH-008).
- Bulk-edit и collapsed-transfer-row view — отложены (IDEA-043).
- Стартовый капитал из класса/бэкграунда — IDEA-051.
- UI/UX skill для Claude — IDEA-052 (meta).

## Приоритеты текущего этапа

`mat-ucheniya/AGENTS.md` теперь фиксирует порядок: **данные →
десктоп-UX → мобилка**. Мобильная спека придёт отдельно; точечные
мобильные фиксы — только если контрол вообще не кликабелен на
телефоне.

## Отложенные фичи

1. Трансформация факультативов в бонусы к статам PC
2. **Мобилка игрока** — режим игрока (читалка, mobile-first)
3. **Трекер трат на ход в энкаунтере** — action/bonus/reaction
4. **Общая панель реакций/легендарок** — агрегат реакций всех живых
5. **PillEditor v2** — rename pill, выбор цвета
6. IDEA-029 Spells + slots (ждёт auth, большая фича)
7. Импорт из Google Sheets (таблицы персонажей)
8. Лог вне боя (IDEA-026 инкремент 4)

## Стек и окружение

- Next.js 16 (App Router) + Supabase + Tailwind v4
- Рабочая директория в репо: `mat-ucheniya/`
- Тестовая кампания: slug `mat-ucheniya`
- Ключевые зависимости: `lucide-react`, `@fontsource-variable/manrope`,
  `@fontsource-variable/jetbrains-mono`, `vitest` (dev)

## Файлы памяти

- `.specify/memory/constitution.md` — конституция v3.0.0
- `.specify/memory/encounter-tracker-v1-retrospective.md` — ретро v1 трекера
- `.specify/memory/character-sheet-excel-system.md` — система листа персонажа
- `.specify/memory/bookkeeping-roadmap.md` — roadmap 009-015
- `.specify/memory/assets/character-sheet-examples.xlsx` — Excel примеры
- `mat-ucheniya/STYLE.md` — design tokens
- `mat-ucheniya/AGENTS.md` — предупреждение про Next.js 16
- `mat-ucheniya/scripts/README.md` — парсер SRD

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать.
- СДВГ: одна задача за раз, выбирай лучший вариант сам.
- Файлы миграций: отдавать пользователю через `present_files`.
- Правило переноса: сначала перенеси как есть, потом улучшай.
- Хардкод-аудит: при новом компоненте проверять на строковые константы
  под конкретную кампанию; выносить в функции с TODO-ссылкой на backlog.

## В конце сессии

1. Создать `chatlog/YYYY-MM-DD-chatNN-короткое-название.md` по шаблону из `chatlog/README.md`.
2. Обновить `NEXT.md`: секции «В проде» и «Следующий приоритет».
3. Обновить `backlog.md` если появились новые баги/идеи.
4. Закоммитить и запушить.

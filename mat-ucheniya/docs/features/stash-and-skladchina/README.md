# Общак и складчина

> Два слоя совместных финансов кампании: **общак** — общий кошелёк и
> инвентарь на уровне кампании; **складчина** — реал-мани пул для
> групповых трат вне игры. Спеки 011 и 017.

---

## Общак

**Общак** — единственная нода с `node_type='stash'` на кампанию. Создаётся
автоматически при инициализации кампании (миграция
`035_stash_and_item_qty.sql`). Хранит свои монеты и предметы в той же
таблице `transactions`, что и PC-кошельки: разница лишь в том, чья нода
стоит в `actor_pc_id`. Баланс — тот же `SUM()`.

Стартовый сид монет и предметов в общак задаётся на странице
[`../accounting/starter-setup.md`](../accounting/starter-setup.md) и
применяется при старте каждой петли.

### Put / Take

В `<LedgerActorBar>` при выбранном PC появляются две кнопки:
**«Положить в Общак»** и **«Взять из Общака»** (`<StashButtons>` в
`components/stash-buttons.tsx`). Под капотом — обычный transfer:
две строки с общим `transfer_group_id`. Put: PC — sender, stash —
receiver. Take: stash — sender, PC — receiver.

Операции с общаком для `player` автоматически получают `status='approved'`
(флаг `autoApprove=true` в `lib/approval-policy.ts`) — общак считается
«свободным», без очереди.

### Shortfall prompt

`<ShortfallPrompt>` (`components/shortfall-prompt.tsx`) — inline-баннер
внутри формы расхода. Появляется когда сумма расхода превышает баланс PC.
Три режима:

| Режим | Условие | UI |
|---|---|---|
| `rich` | `stashGp ≥ shortfall` | «Не хватает N gp; добрать из общака?» + кнопки Да/Нет |
| `poor` | `0 < stashGp < shortfall` | «В общаке только M gp; добрать M + (N−M) в минус?» |
| `empty` | `stashGp = 0` | «Общак пуст. Сохранить (персонаж уйдёт в минус)?» |

При согласии форма создаёт transfer-пару stash→PC на сумму `toBorrow`, плюс
основной расход с actor=PC.

### Инвентарь общака

Страница `/c/[slug]/складчина/` (stash tab «Предметы») использует тот же
`<InventoryTab>` (`components/inventory-tab.tsx`), что и страница PC.
Агрегацию item-ног выполняет `lib/stash-aggregation.ts`
(`aggregateStashLegs()`): суммирует qty по направлению `in`/`out`,
отбрасывает нулевые позиции, оставляет отрицательные с флагом `warning`.
Метаданные загружает `lib/stash.ts` (`getStashContents()`) через
`Promise.all` трёх параллельных sub-query.

---

## Складчина

**Складчина** — реал-мани пул для совместной покупки вне игры (например,
книга правил, краски для миниатюр). Это отдельный слой, не связанный с
`transactions` — у складчины своя схема в `contribution_pools` и
`contribution_participants` (миграция `047_contribution_pools.sql`).

Страница: `/c/[slug]/складчина/` (роут `app/c/[slug]/skladchina/`).

### Структура pool'а

- **`contribution_pools`** — header: кампания, автор, название, реквизиты
  (`payment_hint`), общая сумма `total (numeric 12,2)`.
- **`contribution_participants`** — строки участников: `user_id` (nullable —
  `NULL` для ad-hoc участника без аккаунта), `display_name`, `share`,
  `paid_at` (null = не сдал ещё).

**Архивность** — derived, не хранится: pool архивный когда
`(deleted_at IS NOT NULL) OR (каждый участник имеет paid_at IS NOT NULL)`.
Никаких `status`-перечислений, никаких триггеров архивации — list view
фильтрует на SQL-стороне через подзапрос `NOT EXISTS unpaid`.

### Разделение долей

`lib/contribution-split.ts` — чистый хелпер без I/O:

- `splitEqual(total, n)` — делит сумму на n равных частей целочисленной
  арифметикой (работает в cents, чтобы избежать float-drift). Остаток
  одного цента уходит в первую долю.
- `sumShares(shares)` — cent-precision сумма.
- `sharesMatchTotal(shares, total)` — проверка корректности разбивки.
- `canReduceTotal(newTotal, participants)` — guard: нельзя уменьшить total
  ниже уже оплаченной суммы.

DM или автор pool'а могут вручную скорректировать долю любого участника
после авто-разбивки.

### Paid tracking

Чекбокс «сдал» выставляет `paid_at = now()` на строке участника. Триггер
`bump_contribution_pool_updated_at` (AFTER UPDATE на `contribution_participants`)
поднимает `pools.updated_at` — list view сортируется по «последней
активности», а не по дате создания.

RLS: просматривать pool — любой member кампании. Создавать pool — любой
member при условии `created_by = auth.uid()`. Редактировать/удалять (soft-delete
через `deleted_at`) — автор или DM/owner. Participants — тот же паттерн.

---

> См. также: [`../accounting/README.md`](../accounting/README.md) — бухгалтерия кампании;
> [`../accounting/starter-setup.md`](../accounting/starter-setup.md) — сид общака при старте петли;
> [`../../concepts/node-graph.md`](../../concepts/node-graph.md) — stash как нода в графе.

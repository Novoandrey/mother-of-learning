# Бухгалтерия

> Учёт денег и предметов кампании: кошелёк PC, общак, лента транзакций,
> категории. Фундамент для [`approval-queue.md`](approval-queue.md),
> [`starter-setup.md`](starter-setup.md) и [`../stash-and-skladchina/README.md`](../stash-and-skladchina/README.md).

Раздел `/accounting/` — главная страница бухгалтерии кампании. Всё, что
происходит с деньгами и предметами, оседает здесь в виде **append-only
ленты транзакций**. Баланс нигде не хранится — он всегда вычисляется через
`SUM()` по таблице `transactions`. Это прямое воплощение
[`../../concepts/event-sourcing.md`](../../concepts/event-sourcing.md) для
финансового слоя.

---

## Виды транзакций

Таблица `transactions` (миграция `034_transactions_ledger.sql`) поддерживает
три вида:

| `kind` | Что это | Ключевые поля |
|---|---|---|
| `money` | Доход или расход в монетах | `amount_cp / sp / gp / pp` (signed); хотя бы один ≠ 0 |
| `item` | Получение или списание предмета | `item_name` обязателен; монеты = 0; `item_qty ≥ 1` |
| `transfer` | Перевод между двумя акторами | две строки с общим `transfer_group_id` |

Денежные суммы хранятся четырьмя `int`-колонками (`cp`/`sp`/`gp`/`pp`) со
знаком — расходы в минус, доходы в плюс. CHECK-констрейнты следят за
согласованностью: у `item`-строки монеты должны быть нулевыми; у
`money`-строки не может быть `item_name`; у `transfer` обязан быть
`transfer_group_id`. Нарушение любого правила — ошибка на уровне Postgres.

Начиная с миграции `043_item_catalog.sql`, предметные транзакции могут
ссылаться на Образец из каталога через `item_node_id` (FK на `nodes(id)`,
`ON DELETE SET NULL`). При `item_node_id IS NOT NULL` UI показывает живое
название из каталога; при `NULL` — старый free-text путь через `item_name`.
Подробнее: [`../inventory-and-items/README.md`](../inventory-and-items/README.md).

---

## Кошелёк PC

Каждый PC — нода с `node_type='pc'`. Транзакции ссылаются на него через
`actor_pc_id`. Баланс за текущую петлю — агрегат по
`(actor_pc_id, loop_number, status='approved')`. Индекс `idx_tx_pc_loop`
на `(actor_pc_id, loop_number, status)` делает этот запрос дешёвым.

Общак (`node_type='stash'`) работает точно так же — та же таблица, тот же
агрегат, другой `actor_pc_id`. Подробнее о сташе и складчине:
[`../stash-and-skladchina/README.md`](../stash-and-skladchina/README.md).

---

## Actor bar

`<LedgerActorBar>` (`components/ledger-actor-bar.tsx`) — панель в верхней
части `/accounting/`. Выбор «действующего» актора сохраняется в
`localStorage` по `campaign_id`.

- **PC выбран** — четыре кнопки: `+ Доход`, `− Расход`, `→ Перевод`,
  плюс `Положить в Общак` / `Взять из Общака` (`<StashButtons>`).
- **Общак выбран** — только три основных кнопки (перевод «сташ→сташ»
  бессмыслен).

Для `role=player` в баре дополнительно появляется кнопка «Подать пачку»
(multi-row batch submit) — транзакции уходят со статусом `pending` в очередь
на рассмотрение DM. Для DM/owner транзакции сразу получают статус `approved`.
Это правило инкапсулировано в `lib/approval-policy.ts`
(`isAutoApproved(role, autoApprove?)`). Исключение — операции с общаком
(`put`/`take`): они всегда `autoApprove=true`, даже для `player`.

---

## Лента и фильтры

`<LedgerList>` (`components/ledger-list.tsx`) — постраничная лента
транзакций. Фильтры живут в URL: `?actor=…&loop=…&day=…&kind=…&category=…`.
URL — единственный источник истины; никакого React-state для фильтрации нет.

Переводы (`kind='transfer'`) на глобальной ленте схлопываются до одной
строки (sender leg) с помощью `dedupTransferPairs()` из
`lib/transaction-dedup.ts` — это UI-преобразование; в БД обе ноги хранятся.
На per-actor ленте (фильтр по `actor_pc_id`) схлопывание не нужно — фильтр
уже оставляет только одну ногу.

---

## Категории

Таблица `categories` (миграция 034) охватывает несколько `scope`-ов. Для
бухгалтерии важен `scope='transaction'`. Из коробки сидятся 6 категорий:
`income`, `expense`, `credit`, `loot`, `transfer`, `other`. DM редактирует
их через настройки кампании. Новые кампании получают те же категории через
`seedCampaignCategories` из `initializeCampaignFromTemplate`.

---

> Технические детали — в [`technical.md`](technical.md).
> Очередь заявок — в [`approval-queue.md`](approval-queue.md).
> Стартовый сетап петли — в [`starter-setup.md`](starter-setup.md).

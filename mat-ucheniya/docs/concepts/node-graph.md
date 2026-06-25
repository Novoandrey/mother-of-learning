# Граф нод и рёбер

> Универсальная схема данных: всё в БД — это либо `nodes` (сущность
> любого типа), либо `edges` (типизированная связь). Объясняет реальные
> типы в проде, когда добавляется scoped-таблица, и тяжёлые случаи.

Ключевое архитектурное решение: новые типы сущностей появляются без миграций
схемы. DM создаёт `node_type` с `slug` и `label` — и сразу может создавать
ноды этого типа. Поля per-тип живут в JSONB-колонке `fields`, а scoped
attrs-таблицы (`item_attributes`) добавляются только когда нужны типизированные
индексы или CHECK-ограничения.

---

## Схема nodes / edges (миграция 001)

```
nodes: id, campaign_id, type_id, title, fields jsonb, content text,
       search_vector tsvector, owner_user_id, created_at, updated_at

edges: id, campaign_id, source_id, target_id, type_id, label, meta jsonb,
       created_at
```

`search_vector` — GIN-индекс по тексту из `title` + `content` + всех
текстовых значений `fields`. Поддерживается триггером, обновляется
автоматически.

## Node types в проде

Типы нод — per-campaign (каждая кампания может иметь свои). Базовые
создаются при инициализации кампании через миграции:

| `node_type.slug` | Русское имя | Поля в `fields` |
|---|---|---|
| `character` | Персонаж (PC) | статблок, уровни, класс, раса, и др. |
| `npc` | НПС | статблок (миграции 013/018) |
| `loop` | Петля | `number`, `status`, `length_days` |
| `session` | Сессия | `session_number`, `loop_number`, `day_from`, `day_to`, `recap`, `played_at` |
| `encounter` | Энкаунтер | mirror-нода; `title` синхронизируется с `encounters` (триггер 039) |
| `stash` | Общак | пустые fields; сигнальная нода для бухгалтерии (миграция 035) |
| `item` | Предмет | hot-поля вынесены в `item_attributes`; cold: `srd_slug`, `description` |
| `elective` | Факультатив | `kind`, `link`, `comment` (миграция 029) |
| Пользовательские | любые | DM создаёт через UI |

`npc` и `character` — типы, которые знают статблок. Все остальные типы —
DM создаёт вручную (локации, фракции, квесты, лор). Система не ограничивает.

## Edge types в проде

Базовые рёбра (`is_base=true`, без `campaign_id`):

| `edge_type.slug` | Направление | Смысл |
|---|---|---|
| `contains` | loop → session | сессия принадлежит петле |
| `participated_in` | session → character | PC участвовал в сессии (миграция 032) |
| `appeared_in` | session → npc | NPC появился в сессии (миграция 114) |

Кампанейские рёбра (`is_base=false`, с `campaign_id`):

| `edge_type.slug` | Смысл |
|---|---|
| `has_elective` | PC взял факультатив (миграция 029) |
| Пользовательские | DM создаёт любые |

## Когда добавляется scoped attrs-таблица

Правило: JSONB достаточно, если поле только читается и отображается.
Отдельная таблица нужна, когда:

1. **Нужен типизированный индекс** для фильтрации / сортировки.
   Пример: `item_attributes.rarity`, `item_attributes.price_gp` — в каталоге
   фильтрация по редкости и цене критична для performance.
2. **Нужен CHECK-констрейнт** — `rarity IN ('common','uncommon',...)` нельзя
   выразить на JSONB поле.
3. **Нужен FK** — `item_attributes.node_id references nodes(id)` ON DELETE
   CASCADE гарантирует очистку.

Примеры в проде: `item_attributes` (миграция 043), `encounter_loot_drafts`
(миграция 039).

## Тяжёлые случаи

### Mirror-нода энкаунтера

`encounters` — отдельная таблица (не `nodes`), унаследованная от раннего
дизайна. Миграция 039 связала каждый энкаунтер с mirror-нодой типа
`encounter`: триггер `create_encounter_mirror_node` создаёт ноду при вставке
в `encounters`; `sync_encounter_title_to_mirror` синхронизирует title.

В каталоге/сайдбаре mirror-ноды фильтруются через `node_types.slug != 'encounter'`
в SQL-запросах — они технические, не контентные.

### Stash-нода

Один `stash`-узел на кампанию (`title='Общак'`). Не просматривается в обычном
каталоге — это «виртуальный кошелёк» кампании. `actor_pc_id = null`
в транзакциях означает «эта операция идёт в/из общака».

### Elective — кампанейский тип

`elective` создан только для кампании `mat-ucheniya` (не глобальный базовый
тип). Связь PC → elective — ребром `has_elective`.

## Поиск по графу

`search_vector` на `nodes` — полнотекстовый поиск на русском (`tsvector`
с конфигурацией `russian`). Индексируется: `title` + `content` + все строковые
значения `fields`. Поиск работает в каталоге и сайдбаре.

Сайдбар (`lib/sidebar-cache.ts`) кэширует node_types + все ноды кампании на
60 секунд с тегом `sidebar:<campaignId>`. Мутация ноды → `invalidateSidebar(campaignId)`.

---

> → [`features/catalog/README.md`](../features/catalog/README.md) — как граф
> используется в каталоге.
> → [`engine-vs-content.md`](engine-vs-content.md) — почему D&D-поля
> в `item_attributes` должны уехать в content-pack.

# Каталог сущностей

> Главная вкладка приложения. Здесь живут все ноды кампании — PC, NPC, локации,
> петли, сессии, предметы и прочее. Никакой жёсткой иерархии папок: всё связано
> рёбрами, навигация — плоская.

---

## Граф нод

В основе каталога — три таблицы: `node_types`, `nodes`, `edges` (миграция `001_initial_schema.sql`).

**`node_types`** — типы нод кампании. Каждый тип имеет `slug`, `label`, `icon`,
`default_fields` (jsonb-шаблон формы) и `sort_order`. Типы не глобальные —
у каждой кампании своё множество. Стандартные типы, сидируемые при создании
кампании: `pc`, `npc`, `location`, `creature`, `item`, `loop`, `session`,
`elective`, `encounter`. Тип `encounter` — особый: его ноды являются зеркалами
энкаунтеров и в каталоге не отображаются (фильтруются в `lib/sidebar-cache.ts`
и в запросах каталога).

**`nodes`** — сами сущности. Поля: `title`, `fields jsonb` (значения по шаблону
`default_fields`), `content text` (markdown-блок, добавлен миграцией
`011_node_content.sql`), `search_vector tsvector` (поддерживается триггером
`trg_nodes_search_vector`).

**`edges`** — связи между нодами через `edge_types`. Направленные: `source_id →
target_id`. Базовые типы рёбер (`is_base=true`): `contains` (петля→сессия),
`participated_in` (сессия→PC). Кампанийный тип: `has_elective` (PC→факультатив).
Подробнее — [`concepts/node-graph.md`](../../concepts/node-graph.md).

---

## Сайдбар

Сайдбар отображает все типы нод и ноды кампании, сгруппированные по типу.
Данные кэшируются через `unstable_cache` с тегом `sidebar:<campaignId>` и
реинвалидируются при любой мутации нод или типов — контракт описан в
`AGENTS.md` и реализован в `lib/sidebar-cache.ts`.

`app/c/[slug]/catalog/` — основной маршрут каталога.
Ключевые компоненты: `components/catalog-sidebar-wrapper.tsx`,
`components/node-list.tsx`, `components/node-card.tsx`.

---

## Поиск, фильтры, сортировка

- **Полнотекстовый поиск** — `tsvector` по `title + content + fields.*`. Язык
  — `russian`. Индекс: `idx_nodes_search (GIN)`. Поиск работает через
  `to_tsquery('russian', ...)` на стороне сервера.
- **Фильтр по типу** — выбор одного или нескольких `node_type.slug`.
- **Фильтр по статусу** — для типов, у которых в `fields` есть поле `status`
  (петли: `past`/`current`/`future`).
- **Сортировки** — по `title` (алфавит) или `created_at` (хронология). По
  умолчанию — `title ASC`.

---

## Создание ноды

Форма создания — компонент `create-node-form.tsx`. При создании ноды:

1. Форма отправляет данные в server action.
2. Server action пишет через admin-client (bypass RLS).
3. После записи вызывается `invalidateSidebar(campaignId)`, чтобы новая нода
   немедленно появилась в сайдбаре.

Черновики форм не теряются при случайном закрытии — они сохраняются в
`localStorage` через `hooks/use-form-draft.ts`
(см. [`architecture/form-drafts.md`](../../architecture/form-drafts.md)).

---

## Навигация

Каталог предоставляет плоский список — никакой иерархии папок. Иерархию
(если нужна) DM выстраивает рёбрами. Это сознательное решение: в west-marches
контекст одной локации часто принадлежит сразу нескольким «папкам», а граф
гибче дерева.

Нода `encounter` (`node_type.slug = 'encounter'`) исключена из каталога и
сайдбара — энкаунтеры доступны через отдельную вкладку Encounters.

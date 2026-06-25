# Энкаунтеры — под капотом

> Схема таблиц, триггеры mirror-ноды, пилл-редактор, auth-гейтинг.
> Для разработчиков; пользовательский обзор — в [`README.md`](README.md).

---

## Mirror-нода: три триггера

Каждый энкаунтер имеет соответствующую ноду типа `encounter` в таблице `nodes`.
Синхронизация обеспечивается тремя триггерами (миграция
`039_encounter_mirror_and_loot_drafts.sql`), все `SECURITY DEFINER`:

| Триггер | Момент | Действие |
|---|---|---|
| `trg_encounter_create_mirror` | `BEFORE INSERT` на `encounters` | Создаёт ноду, записывает её `id` в `NEW.node_id` |
| `trg_encounter_sync_title` | `AFTER UPDATE OF title` на `encounters` | Синхронизирует `title` в зеркальную ноду |
| `trg_encounter_delete_mirror` | `AFTER DELETE` на `encounters` | Удаляет зеркальную ноду |

`encounters.node_id` — `NOT NULL`, `UNIQUE`, `FK → nodes(id) ON DELETE RESTRICT`.
FK с `RESTRICT` не мешает AFTER DELETE: к моменту срабатывания триггера
`encounter`-строка уже удалена и ничто на mirror не ссылается.

Проверить корректность триггеров в БД: `scripts/check-encounter-mirror-triggers.sql`.

Mirror-ноды отфильтровываются в `lib/sidebar-cache.ts` (фильтр `slug !== 'encounter'`)
и в SQL-запросах каталога — per-call `node_types.slug != 'encounter'` без
центрального хелпера (задокументировано как T025–T027 в плане).

---

## Statblock-таблицы

Статблоки монстров хранятся в `nodes.fields jsonb`. Полная схема полей введена
миграцией `018_statblock_fields.sql`; парсер в `lib/statblock.ts`:

- `actions`, `bonus_actions`, `reactions`, `legendary_actions` — массивы
  `{name, desc, targeting, source, cost?}`.
- `passives` — массив `{name, desc, source}`.
- `stats`, `saves`, `skills`, `senses`, `speed` — вложенные объекты.
- `ac`, `max_hp`, `hit_dice`, `cr`, `legendary_budget` — скалярные поля.

Функция `parseStatblock(title, fields)` возвращает `null`, если нода не
содержит боевого контента (ни actions, ни AC, ни HP). Приоритетная цепочка HP:
`fields.max_hp ?? fields.hp` — SRD-сид (014/019) пишет только `hp`;
`max_hp` появился позже в 018.

---

## Pill-редактор

Компонент `components/encounter/pill-editor.tsx` — изолированный клиентский
остров. Состояние (массив `{name, color?, duration?}`) хранится в JSONB-поле
участника. Операции:

- **Добавить** — поп-ап с quick-select частых условий + произвольный ввод.
- **Удалить** — клик на пилюле с подтверждением.
- **Временные условия** — `duration` в раундах; UI показывает декремент
  (миграция `016_conditions_temporal.sql`).

Data-flow: pill-редактор → `lib/encounter-actions.ts` (client-side Supabase)
→ `encounter_participants`. Revalidation не нужна — страница `force-dynamic`.

---

## Action-handlers: DM/player через `canEdit`

`components/encounter/encounter-page-client.tsx` вычисляет флаг `canEdit`
для каждого участника:

- `role === 'owner' || role === 'dm'` → `true` для всех участников.
- `role === 'player'` → `true` только для PC, которые принадлежат этому игроку
  (проверка через `canEditNode` из `lib/auth.ts`).

Для DM: write-first без confirm-диалога. Для player: ранний exit с
`alert('...не твой PC')` при попытке правки чужого участника.

Server actions в `app/actions/encounter-meta.ts` и
`app/actions/encounter-loot.ts` используют `createAdminClient()` — bypass RLS —
с явной проверкой роли через `resolveAuth(campaignId)` перед каждой записью
(контракт из `AGENTS.md`).

---

## `encounter_loot_drafts`

Таблица один-к-одному с `encounters` (PK = `encounter_id`). Поля:

- `lines jsonb` — черновик строк лута, `[{kind, ...}]`. `kind ∈ {'coin', 'item'}`.
- `loop_number`, `day_in_loop` — контекст (per-draft, не per-line).
- `updated_by uuid` — кто последний правил.

Логика конвертации черновика в транзакции — `lib/encounter-loot-resolver.ts`.
RLS на `encounter_loot_drafts`: `SELECT` для членов кампании; записи только
через admin-client в server actions (DM-gated).

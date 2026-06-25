# Audit log, soft-delete, версионирование

> Safety layer для DM-as-demiurge: вместо ограничения прав — следы.
> `event.deleted_at` вместо `DELETE`. Версии контентных сущностей. Таблица
> `dm_audit_log`. Сейчас в проде — hard DELETE на чувствительных таблицах,
> никакого версионирования.

---

## Философия: следы, не guardrails

DM может всё. Это принцип продукта: [`concepts/dm-as-demiurge.md`](../concepts/dm-as-demiurge.md).
Safety обеспечивается не запретом операций, а **воспроизводимостью истории**.
Если что-то «исчезло» — это можно найти в логе. Если что-то «изменилось» —
старая версия сохранена.

Единственные физические ограничения DM — технические, не логические:
DM не может уронить базу, удалить чужую кампанию или писать в `auth.users`.
Всё остальное — разрешено.

---

## Soft-delete: `event.deleted_at`

Целевая модель: ни одна строка из `events` не удаляется физически.

```sql
-- В целевой таблице events (см. generic-events-table.md):
deleted_at  timestamptz  -- null = живой; not null = удалён

-- Все продуктовые запросы:
where deleted_at is null

-- DM «удаляет» событие:
update events set deleted_at = now() where id = $1;

-- DM «восстанавливает»:
update events set deleted_at = null where id = $1;
```

Аналогично — для других таблиц, где hard DELETE сейчас применяется к значимым
данным (`categories`, узлы-ноды при удалении DM'ом).

В текущем проде `categories.is_deleted boolean` (миграция 034) — частичный
прецедент этого паттерна, но не через `deleted_at`.

---

## Версионирование контент-сущностей

Каждая content-сущность (предмет, монстр, спелл) получает `version: int`.
Правка не перезаписывает — создаёт новую версию; старые остаются.
Ссылки из событий указывают на конкретную `(item_id, item_version)`.

```sql
-- Пример для items (целевое состояние):
alter table items add column version       int  not null default 1;
alter table items add column is_current    bool not null default true;
alter table items add column previous_id   uuid references items(id);

-- «Редактировать» = создать новую строку:
-- new_item = {…изменённые поля…, version = old.version + 1, is_current = true}
-- update items set is_current = false where id = old_id
-- Событие: {item_id: new_item.id, item_version: new_item.version}
```

Восстановление к версии N: скопировать строку с `version=N` как новую текущую.

**Когда это не нужно:** ноды graph (title/fields) — они правятся in-place,
история редактора не хранится. Версионирование применяется к
**контент-сущностям**, на которые ссылаются `events`.

---

## Таблица `dm_audit_log`

```sql
create table dm_audit_log (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns(id) on delete cascade,

  action_type    text not null,
  -- 'event_delete', 'event_restore', 'content_edit', 'npc_override',
  -- 'location_edit', 'member_kick', 'loop_reset', …

  target_id      uuid,          -- id затронутой сущности
  target_table   text,          -- 'events', 'items', 'npc_groups', …

  before_state   jsonb,         -- состояние до (null если создание)
  after_state    jsonb,         -- состояние после (null если удаление)

  author_user_id uuid not null references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
```

**RLS:** `dm_audit_log` читается только участниками с ролью `owner` кампании.
DM-аккаунты (роль `dm`) видят только собственные записи (фильтр `author_user_id = auth.uid()`).

Пишется через server action (или триггер) при каждой DM-операции, которая
меняет `events`, контент-сущности или члены кампании.

---

## Что DM не может

Это **не** ограничения прав в RLS — это физические барьеры инфраструктуры:

- **DROP/TRUNCATE любой таблицы** — роль `authenticated` в Supabase не имеет
  таких привилегий; только `supabase_admin` через Studio (SSH-туннель).
- **Удалить чужую кампанию** — `campaign_id` в RLS всегда проверяется через
  `is_member(campaign_id)`; нечлен кампании не может трогать её данные.
- **Писать в `auth.users`** — таблица в схеме `auth`, RLS и роли
  `authenticated` туда не достают.
- **Читать другие чужие кампании** — RLS-функция `is_member` проверяет
  таблицу `campaign_members`.

---

## UI: история правок

Когда `dm_audit_log` наполнится, DM-интерфейс покажет:

- Историю правок конкретной ноды/события (фильтр по `target_id`).
- Возможность «откатить» к версии N (для контент-сущностей с версионированием).
- Лог удалённых событий с кнопкой восстановления.

До того момента — `dm_audit_log` существует как технический лог без
продуктового UI.

---

> Принцип DM-as-demiurge: [`concepts/dm-as-demiurge.md`](../concepts/dm-as-demiurge.md).
> Универсальный лог: [`generic-events-table.md`](generic-events-table.md).

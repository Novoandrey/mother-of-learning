# Generic events table — универсальный лог событий

> Расширение `transactions` до append-only таблицы `events` — фундамент всего
> pivot'а. Все DM-операции, действия игроков, движение NPC, изменения погоды
> становятся событиями одного типа. Сейчас в проде — нет; `transactions` покрывает
> только деньги и предметы.

---

## Зачем переходить на `events`

Таблица `transactions` (миграция `034_transactions_ledger.sql`)
решает задачу бухгалтерии: деньги, предметы, переводы. Колонки фиксированные —
`amount_cp/sp/gp/pp`, `item_name`, `kind in ('money','item','transfer')`.

Для движка нужен другой примитив: **любое событие в мире** — перемещение PC,
бросок погоды, NPC пришёл в локацию, DM поменял состояние данжа, игрок опознал
артефакт. Общий знаменатель: кто (`actor_id`), когда (`at_tick`), где
(`location_id`), что именно (`event_type` + `payload jsonb`), кому видно
(`visibility`), сбрасывается ли при сбросе петли (`persistence_scope`).

Транзакции не исчезают — они становятся частным `event_type` в новой таблице.

---

## Целевая схема `events`

```sql
create table events (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,

  event_type         text not null,           -- 'transaction', 'npc_move', 'weather_change', …

  at_tick            bigint not null,          -- тики от точки отсчёта кампании
  loop_id            uuid not null,            -- UUID петли (заменяет loop_number)

  actor_id           uuid references nodes(id) on delete set null,  -- PC / NPCGroup
  location_id        uuid references nodes(id) on delete set null,  -- Location

  payload            jsonb not null default '{}',  -- event-специфичные поля

  visibility         jsonb not null default '{"mode":"all"}',
                     -- {mode:'all'} | {mode:'dm_only'} | {mode:'characters',character_ids:[…]}

  persistence_scope  text not null default 'loop'
                     check (persistence_scope in ('loop','character','meta')),

  deleted_at         timestamptz,             -- null = существует; soft delete

  author_user_id     uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
```

**Ключевые решения:**

- **`at_tick bigint`** — целое число, не datetime. Конвертация в «День 5, 14:00»
  происходит в presentation layer через `tick_unit_seconds` кампании. Подробнее →
  [`tick-time-model.md`](tick-time-model.md).
- **`loop_id uuid`** — заменяет `loop_number: int`; UUID позволяет создать новую
  петлю без пересечения с историей старых. При loop reset создаётся новый `loop_id`.
- **`payload jsonb`** — event-специфичные поля; нет жёстких колонок под каждый тип.
  Валидация payload'а — в типизированных TS-хелперах, не в CHECK-констрейнте.
- **`deleted_at`** — soft delete вместо `DELETE`. Запросы фильтруют `where deleted_at is null`.
  Подробнее → [`audit-log-and-safety.md`](audit-log-and-safety.md).
- **`visibility jsonb`** — три режима из north-star §3. RLS-политика читает это поле.

---

## Индексы

```sql
-- Основной запрос: события кампании по времени
create index idx_events_campaign_tick
  on events (campaign_id, at_tick desc)
  where deleted_at is null;

-- Свёртка петли: все события текущего loop_id
create index idx_events_loop
  on events (campaign_id, loop_id, at_tick)
  where deleted_at is null;

-- Actor timeline: всё, что делал конкретный PC / NPC
create index idx_events_actor
  on events (actor_id, at_tick)
  where actor_id is not null and deleted_at is null;

-- Локационная история
create index idx_events_location
  on events (location_id, at_tick)
  where location_id is not null and deleted_at is null;
```

---

## RLS-политика по `visibility`

```sql
-- Участник видит событие, если:
-- 1) mode = 'all'   — всегда
-- 2) mode = 'dm_only' — только если роль dm/owner
-- 3) mode = 'characters' — если один из character_ids ссылается на PC пользователя
create policy events_select on events
  for select to authenticated
  using (
    is_member(campaign_id)
    and deleted_at is null
    and (
      (visibility->>'mode') = 'all'
      or ((visibility->>'mode') = 'dm_only' and is_dm_or_owner(campaign_id))
      or (
        (visibility->>'mode') = 'characters'
        and exists (
          select 1 from node_pc_owners npo
           where npo.user_id = auth.uid()
             and npo.node_id::text = any(
               array(select jsonb_array_elements_text(visibility->'character_ids'))
             )
        )
      )
    )
  );
```

Spectator — участник без контролируемых PC; видит события с `mode='all'`.
Поле `participants.see_all: bool` (когда появится) даст full read доступ
без `dm_or_owner`.

---

## Миграция `transactions` → `events`

Миграция сложная, но не деструктивная — `transactions` остаётся на время
переходного периода:

1. Создать таблицу `events` с полной схемой.
2. Для каждой `transaction` создать `event` с `event_type='transaction'`,
   `payload = {kind, amount_cp, amount_sp, amount_gp, amount_pp, item_name, …}`,
   `at_tick` = конвертированный `(loop_number, day_in_loop)`,
   `loop_id` = созданный UUID для соответствующего `loop_number`.
3. Переключить все server actions с записи в `transactions` на запись в `events`.
4. Дождаться стабилизации, затем deprecate `transactions`.

Конвертация `(loop_number, day_in_loop)` → `at_tick` требует зафиксированного
`tick_unit_seconds` и формулы точки отсчёта. До завершения группы B (tick-модель)
в `transactions`-транзакциях `at_tick` хранится приближённо через `day_in_loop × ticks_per_day`.

Полная карта рисков миграции — [`tick-time-model.md`](tick-time-model.md).

---

> Концептуальная основа: [`concepts/event-sourcing.md`](../concepts/event-sourcing.md).
> Soft delete и audit: [`audit-log-and-safety.md`](audit-log-and-safety.md).
> Persistence scope: [`concepts/persistence-scope.md`](../concepts/persistence-scope.md).

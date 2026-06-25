# NPC-движение и encounter rework

> Бухгалтерия движения, не AI. DM заявляет намерение — система тикает —
> DM видит активные позиции. Encounter rework: `EncounterDefinition` (designed,
> основа петли) + `EncounterTable` (procedural, weighted). Сейчас в проде —
> NPC-нода без clock и movement_plan; encounter-нода без таблиц с весами.
> Спека 032 «Реворк энкаунтеров» — первый шаг.

---

## Принцип: NPC tracking, не NPC AI

Это не «мир, который живёт сам». DM планирует маршрут, система вычисляет позицию
на любой `at_tick`. Никакой автономной воли NPC — только запланированное движение
под надзором. Подробнее о принципе — [`concepts/tool-first.md`](../concepts/tool-first.md).

---

## `NPCGroup`

Целевая схема:

```sql
-- NPCGroup — отдельная таблица, не просто нода
create table npc_groups (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,

  name                text not null,
  description         text,

  -- Per-NPC clock (отличается от PC!)
  current_tick        bigint not null default 0,

  -- Текущая локация
  current_location_id uuid references locations(id) on delete set null,

  -- Движение
  movement_plan       jsonb,
  -- Формат: [{location_id, arrive_tick, dwell_ticks}, …]

  dm_notes            text,  -- приватный scratchpad DM, не виден игрокам

  -- Видимость для игроков
  visibility          jsonb not null default '{"mode":"dm_only"}',

  created_at          timestamptz not null default now()
);
```

`movement_plan` — список «waypoints»: прийти в локацию X в tick T, остаться
на `dwell_ticks` тиков, двинуться дальше. Resolver вычисляет позицию на любой
момент без итерации.

---

## Tick resolver

На каждый tick advance PC (или по явному запросу DM) resolver пересчитывает
позицию всех `NPCGroup`, у которых `movement_plan` не пустой:

```typescript
function resolveNPCPosition(group: NPCGroup, at_tick: bigint): Location {
  const plan = group.movement_plan;
  // Найти waypoint, покрывающий at_tick
  const waypoint = plan.find(wp =>
    at_tick >= wp.arrive_tick && at_tick < wp.arrive_tick + wp.dwell_ticks
  );
  if (waypoint) return waypoint.location_id;
  // Группа в пути между waypoints — интерполировать по connection
  return interpolateInTransit(plan, at_tick);
}
```

Если позиция `NPCGroup` пересекается с позицией PC на тот же тик — encounter check.

---

## DM override и pause

DM может в любой момент:

- **Остановить** группу (`movement_plan = []`, `current_tick` заморожен).
- **Изменить маршрут** — редактировать `movement_plan` напрямую.
- **Переместить моментально** — записать `event_type='npc_teleport'` в `events`.
- **Скрыть или раскрыть** — поменять `visibility` группы.

Дашборд DM показывает все активные `movement_plan` на timeline, можно видеть
«кто где будет через 2 дня».

---

## `EncounterDefinition` — designed встречи

Спроектированные встречи, прибитые к `Location`. Основа петли: если PC снова
придёт в ту же локацию в той же петле — он встретит то же самое.

```typescript
interface EncounterDefinition {
  id:             string;
  location_id:    string;
  loop_id:        string;           // только для этой петли (persistence_scope='loop')

  tick_window?: {
    from_tick:    bigint;
    to_tick:      bigint;
  };

  composition:    EncounterComposition[];  // кто участвует
  auto_resolvable: boolean;  // можно ли пропустить автобоем
  dm_notes:       string;
}
```

`auto_resolvable = true` означает, что DM разрешил пропуск для игроков, которые
уже знают решение этого энкаунтера из предыдущих петель — «вы уже были здесь,
знаете, что делать». Экономит время на повторных петлях.

---

## `EncounterTable` — procedural weighted

Процедурные таблицы для wandering encounters и как подсказки DM при заполнении
новых локаций. Weighted entries с модификаторами по времени суток и погоде.

```typescript
interface EncounterTable {
  id:          string;
  campaign_id: string;
  name:        string;
  terrain_type?: string;  // применяется к этому типу местности

  entries: Array<{
    weight:       number;          // базовый вес
    composition:  EncounterComposition[];

    tick_modifiers: Array<{
      condition_type: 'time_of_day' | 'weather';
      condition_value: string;     // 'night', 'rain', …
      weight_multiplier: number;   // ночью вурдалаки × 2.0
    }>;
  }>;
}
```

Эффективный вес записи = `base_weight × Π(tick_modifiers applicable at current_tick)`.
Результат — suggestion для DM; DM принимает или меняет. Таблица используется и
для wandering encounters (процедурная случайная встреча), и как «что вообще
водится в этом биоме» при создании новой локации.

---

## `EncounterInstance`

Когда encounter происходит (designed или procedural), создаётся `EncounterInstance`:

```typescript
interface EncounterInstance {
  id:             string;
  campaign_id:    string;
  source_type:    'definition' | 'table' | 'manual';
  source_id?:     string;           // id EncounterDefinition или EncounterTable

  at_tick:        bigint;
  location_id:    string;

  // Snapshot локации в момент инициирования
  location_snapshot_id: string;

  participants:   string[];          // PC + NPC ids
  resolution:     'pending' | 'completed' | 'auto_resolved' | 'skipped';

  event_id:       string;            // ссылка на events (event_type='encounter_start')
}
```

`EncounterInstance` записывает факт встречи в `events`; финальный лут/исход —
отдельные события поверх.

---

> Спека 032 — реворк энкаунтеров (encounter-as-node, ближайший шаг).
> Текущий трекер энкаунтера: [`features/encounters/README.md`](../features/encounters/README.md).
> Концепт «мир до наблюдения»: [`concepts/world-as-observation-log.md`](../concepts/world-as-observation-log.md).

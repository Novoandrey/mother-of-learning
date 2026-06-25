# Локации: hex- и pointcrawl

> Целевая схема локаций: типизированный `Location` + отдельная таблица `Connection`
> с `base_traversal_ticks`, иерархия через `parent_location_id`, два стартовых
> типа — hex (wilderness) и point (города/данжи). Сейчас в проде — обычная нода
> `node_type='location'` без типа, без тиков, без иерархии.
> Спека 031 «Карта мира и локации» — первая реализация этого блока.

---

## Что не так с нодами сейчас

В текущем коде «локация» — просто нода с определённым `type_id`. Рёбра
графа (`edges`) не типизированы, не содержат `base_traversal_ticks`, не знают
о направлении или типе местности. DM ведёт расчёты в голове или на бумаге.

Для tick-движка нужна другая модель: каждый переход между локациями должен
знать, сколько тиков он стоит, чтобы `ActionCost.compute` мог сложить
`base_cost × modifier_stack` и показать игроку цену ещё до принятия решения.

---

## Схема `Location`

```sql
create table locations (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,

  location_type      text not null
                     check (location_type in ('hex','point','street','dungeon_room')),

  name               text not null,
  description        text,

  -- Иерархия: гекс → pointcrawl внутри него → данж внутри точки
  parent_location_id uuid references locations(id) on delete set null,

  -- Hex-специфика (null для point/street/dungeon_room)
  hex_q              int,  -- axial coord q
  hex_r              int,  -- axial coord r

  -- Общие атрибуты
  terrain_type       text,   -- 'road', 'forest', 'swamp', 'mountain', …
  is_hidden          bool not null default false,  -- DM видит, игроки нет

  fields             jsonb default '{}',  -- произвольные расширения

  created_at         timestamptz not null default now()
);

create unique index idx_locations_hex_coords
  on locations (campaign_id, hex_q, hex_r)
  where location_type = 'hex' and hex_q is not null;
```

---

## Схема `Connection`

```sql
create table connections (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,

  from_location_id      uuid not null references locations(id) on delete cascade,
  to_location_id        uuid not null references locations(id) on delete cascade,

  base_traversal_ticks  int not null,  -- стоимость в тиках без модификаторов
  direction             text,          -- 'N','NE','SE','S','SW','NW' для hex; null для point

  terrain_type          text,          -- может отличаться от terrain локации
  is_hidden             bool not null default false,

  is_bidirectional      bool not null default true,

  created_at            timestamptz not null default now()
);
```

Для hex-локаций ребро `Connection` дублируется в обе стороны (или `is_bidirectional=true`
+ логика в резолвере). Для pointcrawl — явные направленные рёбра.

---

## Hex-математика

Гексы хранятся в **axial-координатах** (q, r) по модели
[redblobgames](https://www.redblobgames.com/grids/hexagons/). Шесть соседей
гекса `(q, r)`:

```
N  = (q,   r-1)
NE = (q+1, r-1)
SE = (q+1, r)
S  = (q,   r+1)
SW = (q-1, r+1)
NW = (q-1, r)
```

Расстояние в hex-шагах: `max(|dq|, |dr|, |dq+dr|)`.
Конвертация axial → pixel для отрисовки на canvas — стандартная.

По умолчанию `base_traversal_ticks` для hex-ребра = 1 игровой день (4800 тиков
при `tick_unit_seconds=6`). Дорога — меньше, болото — больше; это задаётся
через `terrain_type` на `Connection`.

---

## Pointcrawl: именованный граф

Для городов, регионов и данжей — явный граф с именованными рёбрами:

- В городе: «Рынок → Таверна» через улицу (50 тиков пешком).
- В данже: «Комната 3 → Комната 5» через коридор (10 тиков).
- В регионе: «Столица → Порт» через королевский тракт (800 тиков верхом).

Никакой hex-математики — только явные `Connection` с `direction=null` и
произвольным `base_traversal_ticks`.

---

## Многоуровневость через `parent_location_id`

```
Глобальная hex-карта (hex, q/r)
  └── Гекс H-12 "Туманное болото" (hex)
        └── Деревня Сильвер-Форд (point)
              ├── Таверна «Ленивый Дракон» (point)
              └── Данж «Руины» (point)
                    ├── Вход (dungeon_room)
                    └── Тронный зал (dungeon_room)
```

`location_id` в `events` ссылается на любой уровень иерархии — событие можно
прикрепить к данжу, к комнате или к гексу, в зависимости от детальности.

---

## `LocationSnapshot`

Мир до наблюдения не существует (подробнее → [`concepts/world-as-observation-log.md`](../concepts/world-as-observation-log.md)).
`LocationSnapshot` фиксирует состояние локации в момент, когда PC туда пришёл:

```sql
create table location_snapshots (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references locations(id) on delete cascade,
  observed_at_tick bigint not null,
  observed_by_id  uuid references nodes(id),  -- PC / NPCGroup
  state           jsonb not null default '{}',  -- произвольное состояние
  created_at      timestamptz not null default now()
);
```

Таблица append-only: DM никогда не удаляет snapshot, только добавляет новый.
Запрос «что видел PC X в локации Y в тик T» — `where observed_at_tick <= T order by observed_at_tick desc limit 1`.

---

## Отложенные типы

`'street'` (streetcrawl, процедурная генерация улиц) и `'dungeon_room'`
(depthcrawl) — в схеме как допустимые значения `location_type`, но UI
для них не приоритетен на старте. Принцип тот же: рёбра `Connection`
с `base_traversal_ticks`.

---

> Время перемещения с модификаторами: [`time-and-modifiers.md`](time-and-modifiers.md).
> Спека 031 «Карта мира» — первая реализация. Мир как наблюдение: [`concepts/world-as-observation-log.md`](../concepts/world-as-observation-log.md).

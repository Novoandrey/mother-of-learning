# Tick time model — тики как единица игрового времени

> Целевая модель времени: `at_tick: bigint` от точки отсчёта кампании вместо
> `(loop_number, day_in_loop)`. Конвертация в читаемое представление —
> presentation layer. Сейчас в проде — `day_in_loop` как атомарная единица;
> `tick_unit_seconds` не существует.

---

## Зачем тики

В проде время хранится как `(loop_number: int, day_in_loop: int)` в таблице
`transactions` (миграция 034). День — атомарная единица; «час» и «раунд боя»
не различаются. Это нормально для бухгалтерии, но ломается, как только нужно:

- Считать, что пересечение NPC и PC произошло на конкретном **раунде** боя
  (6 секунд — стандартный `tick_unit_seconds` для D&D 5e).
- Хранить длинное действие («3 месяца тренировок») без итерации по каждому дню.
- Сравнить двух персонажей с разными «сейчас»: кто раньше придёт в точку Y?

`at_tick: bigint` решает это: одно целое число, масштабируемое под любой
`tick_unit_seconds`. Раунд боя D&D 5e → 1 тик = 6 секунд. День в нашей кампании
(8-часовой) → 4800 тиков. Год → ~1 752 000 тиков. `bigint` покрывает 9.2×10¹⁸ —
практически бесконечность.

---

## Конфигурация кампании

```sql
-- В целевой схеме campaigns получает новые поля:
alter table campaigns add column tick_unit_seconds  int  not null default 6;
alter table campaigns add column ticks_per_day      int  not null default 4800;  -- 8ч × 60м × 60с / 6с
alter table campaigns add column epoch_at           timestamptz;  -- реальная дата начала отсчёта (опц.)
```

`tick_unit_seconds` — per-кампания, не глобальная константа. Кампания с другой
системой может поставить 1 тик = 1 минута или 1 час без изменения схемы.

---

## Per-actor clock

У каждого `Actor` (в коде сейчас — нода с `node_type='pc'`) свой `current_tick`.
Два PC в одной кампании могут находиться на разных `at_tick` — один идёт через
данж на tick 48 000, другой торгует в городе на tick 57 600.

```sql
-- В целевой схеме нода PC получает:
alter table nodes add column current_tick  bigint;  -- null для не-PC нод
```

Сессия (session-нода) привязывает группу PC к одному временному интервалу.

---

## Длинные действия как один event

Вместо итерации тысяч тиков — один `event` с двумя полями:

```json
{
  "event_type": "downtime_activity",
  "at_tick": 48000,
  "payload": {
    "activity": "arcane_training",
    "start_tick": 48000,
    "duration_ticks": 432000
  }
}
```

`duration_ticks = 432 000` = 90 дней × 4800 тиков/день. Resolver читает
`start_tick + duration_ticks` и вычисляет, что 6 сентября (at_tick 528 000)
тренировка завершена. **Никаких промежуточных строк в БД.**

---

## Travel modes

На старте — два режима перемещения:

| Режим | Модификатор скорости | Типичный сценарий |
|---|---|---|
| `Normal` | × 1.0 | обычное перемещение по дороге |
| `Cautious` | × 1.5 (дольше) | разведка, стелс, горный бездорожник |

Другие режимы (`Forced March`, `Mounted` и т.д.) — отложены. Modifier stack
учитывает `travel_mode` как один из множителей. Порядок стека →
[`time-and-modifiers.md`](time-and-modifiers.md).

---

## Presentation layer

`at_tick` — целое число; людям нужно «День 5, час 14:00». Конвертация:

```typescript
function tickToHuman(tick: bigint, campaign: Campaign): HumanTime {
  const totalSeconds = Number(tick) * campaign.tick_unit_seconds;
  const day = Math.floor(totalSeconds / (campaign.ticks_per_day * campaign.tick_unit_seconds)) + 1;
  const remainderSeconds = totalSeconds % (campaign.ticks_per_day * campaign.tick_unit_seconds);
  const hour = Math.floor(remainderSeconds / 3600);
  const minute = Math.floor((remainderSeconds % 3600) / 60);
  return { day, hour, minute };
}
```

Presentation не лезет в схему БД — только вычисляется на клиенте/сервере.
UI-компонент показывает «День 5, 14:00» или «90 дней» — как удобно для контекста.

---

## Миграция: риски и план

Миграция `(loop_number, day_in_loop)` → `(loop_id, at_tick)` затрагивает:

- Таблицу `transactions` (034) — все строки получают `at_tick = day_in_loop × ticks_per_day`.
- Ноды loop/session — `loop_number` заменяется на `loop_id: uuid`.
- Все server actions и клиентские запросы, использующие `loop_number`/`day_in_loop`.

**Главный риск:** данные о времени внутри одного дня были однородны (день = атом),
при конвертации все события одного дня получают одинаковый `at_tick`. Это
корректное приближение — порядок событий внутри дня не сохранялся и до миграции.

**Не ломается:** `transfer_group_id`, approval flow, итоги бухгалтерии — они
не зависят от временной метки как числа.

**Требует freeze:** миграция должна пройти атомарно в одной транзакции.
Фичи, которые пишут в `transactions` во время миграции, будут заблокированы
на время её выполнения (~секунды на реальном объёме данных кампании).

---

> Следующий уровень детали: [`time-and-modifiers.md`](time-and-modifiers.md) — как считается стоимость действий.
> Время как концепт: [`concepts/time-as-resource.md`](../concepts/time-as-resource.md).

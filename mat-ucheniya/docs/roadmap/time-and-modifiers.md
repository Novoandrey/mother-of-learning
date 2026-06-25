# Modifier stack, погода, календарь, стоимость действий

> Детерминированный стек модификаторов: стоимость любого действия = `base_cost ×
> terrain × weather × time_of_day × travel_mode × condition`. UI показывает
> разложенную цену до принятия решения. Сейчас в проде — нет ничего; DM считает
> в голове.

---

## Почему стек, а не одна таблица

Стоимость перемещения зависит от нескольких независимых факторов одновременно:
болото замедляет само по себе, дождь добавляет сверху, ночь — ещё сверху.
Хранить комбинаторику всех сочетаний невозможно — множители перемножаются.

Фиксированный **порядок** стека критичен для воспроизводимости: одни и те же
входные данные → один и тот же результат, независимо от того, кто запрашивает.

```
base_cost
  × terrain_multiplier       (тип местности Connection.terrain_type)
  × weather_multiplier       (WeatherResolver.at(at_tick))
  × time_of_day_multiplier   (at_tick mod ticks_per_day → утро/день/вечер/ночь)
  × travel_mode_multiplier   (Normal=1.0, Cautious=1.5)
  × condition_multiplier     (состояния PC: Exhaustion, Encumbrance и т.д.)
```

Множители — данные кампании, не константы в коде. DM может поправить «болото ×1.3»
без деплоя.

---

## Типы действий

| Тип (`action_type`) | База стоимости | Основные модификаторы |
|---|---|---|
| `move` | `Connection.base_traversal_ticks` | terrain, weather, time_of_day, travel_mode, condition |
| `rest` (короткий) | `ticks_per_short_rest` (конфиг) | condition |
| `rest` (длинный) | `ticks_per_long_rest` (конфиг) | — |
| `ritual` | задаётся спеллом / активностью | condition |
| `shop` | `ticks_per_shop_visit` (конфиг) | — |
| `craft` | задаётся рецептом | condition |
| `train` | задаётся активностью | — |
| `combat_round` | 1 тик (`tick_unit_seconds = 6с`) | — |

`ticks_per_*` — конфигурируемые константы кампании, не хардкод в коде.

---

## `ActionCost.compute` — API

```typescript
interface ActionContext {
  action_type: ActionType;
  actor_id: string;           // PC или NPCGroup
  connection_id?: string;     // для move
  at_tick: bigint;            // текущий тик (для weather + time_of_day)
  travel_mode?: 'Normal' | 'Cautious';
  override_multipliers?: Partial<MultiplierStack>;  // DM-оверрайд
}

interface ActionCostResult {
  base_ticks: number;
  stack: {
    terrain:      number;
    weather:      number;
    time_of_day:  number;
    travel_mode:  number;
    condition:    number;
  };
  total_ticks: number;
  human_readable: string;  // «800 тиков ≈ 4 ч.»
}

function compute(ctx: ActionContext, campaign: Campaign): ActionCostResult;
```

Функция детерминирована: те же входные данные → тот же результат. Это важно
для replay и для отображения «стоимости» до совершения действия.

---

## `WeatherResolver.at(tick)`

Погода — детерминированная функция от `at_tick` и сида кампании, если режим
`procedural` или `hybrid`. DM в любой момент может переключить на `manual`
и вручную установить текущую погоду.

```typescript
type WeatherMode = 'manual' | 'procedural' | 'hybrid';

interface WeatherState {
  condition:   'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
  multiplier:  number;
}

class WeatherResolver {
  // Детерминированный: one tick → one weather
  at(tick: bigint): WeatherState;

  // DM-оверрайд: устанавливает manual-запись в events
  override(tick: bigint, state: WeatherState): void;
}
```

В режиме `hybrid` — процедурный baseline, DM может точечно переопределить
любой тик. Изменение погоды DM'ом записывается как `event_type='weather_override'`
в таблицу `events`, что гарантирует воспроизводимость истории.

---

## Конфигурация календаря

```typescript
interface CampaignCalendar {
  tick_unit_seconds:  number;    // 6 для D&D 5e; может быть 60, 3600 и т.д.
  ticks_per_day:      number;    // = day_length_seconds / tick_unit_seconds
  day_length_seconds: number;    // обычно 86400 (24ч); может быть 72000 (20ч)

  days_per_week:      number;
  weeks_per_season:   number;
  seasons_per_year:   number;

  // Именованные периоды дня (для time_of_day_multiplier)
  day_periods: Array<{
    name:        string;         // 'dawn', 'day', 'dusk', 'night'
    start_tick:  number;         // тик внутри дня (0..ticks_per_day)
    multiplier:  number;
  }>;
}
```

Вся эта конфигурация — данные в БД, не TS-константы. Кампания настраивается
один раз; изменение не требует деплоя.

---

## UI: разложенная цена

Формы действий показывают цену **до** подтверждения:

```
Перемещение: Базовый лагерь → Туманное болото
  База:         600 тиков  (Connection.base_traversal_ticks)
  × Болото:     × 1.3      (terrain_type = 'swamp')
  × Дождь:      × 1.1      (WeatherResolver.at(current_tick))
  × Ночь:       × 1.2      (time_of_day = 'night')
  ─────────────────────────
  Итого:       1030 тиков  ≈ 5 ч. 9 мин.
```

Игрок видит **откуда берётся каждая цифра** — принцип инспектируемости из
[`concepts/north-star.md`](../concepts/north-star.md) §3 (modifier stack).

---

> Базовые тики: [`tick-time-model.md`](tick-time-model.md).
> Локации и `base_traversal_ticks`: [`locations-hex-and-point.md`](locations-hex-and-point.md).
> Время как ресурс: [`concepts/time-as-resource.md`](../concepts/time-as-resource.md).

# [draft] Modifier stack, weather, calendar, action costs

> Заглушка. Содержание будет наполняться постепенно.

Стоимость любого действия = `base_cost × stack_of_modifiers`. Стек применяется детерминированно в фиксированном порядке: terrain × weather × time-of-day × travel-mode × condition. UI показывает разложенную цену до решения игрока: «Перемещение в C: 800 тиков (база 600 × болото 1.2 × дождь 1.1)». Calendar и weather — глобальное состояние кампании, DM перебивает в любой момент; weather может быть manual / procedural / hybrid с детерминированным сидом.

## Что планируется в статье

- Action types: move, rest, ritual, shop, craft, train, combat_round
- Modifier stack: типы модификаторов и порядок применения
- Calendar config: tick_unit, day_length, week_structure, season, day_night
- Weather schedule: manual / procedural / hybrid
- WeatherResolver.at(tick): детерминизм
- ActionCost.compute(action, actor, context): API
- UI: разложенная цена в формах действий

# Петли и сессии

> Временная ось кампании: петли делят историю на главы, сессии фиксируют
> реальные игровые встречи внутри петли. Обе сущности — ноды в общем графе.
> Прогрессбар показывает, какие пачки играли в какие дни и где наложения.

---

## Петля как нода

Миграция `012_loops_sessions_as_nodes.sql` перевела петли и сессии из отдельных
таблиц (`loops`, `sessions`, удалённых в конце миграции) в ноды типа `loop`
и `session` — стандартный граф `nodes`/`edges`.

**Нода типа `loop`**, поля в `nodes.fields`:

- `number` (int) — последовательный номер петли: 1, 2, 3…
- `status` — `'past' | 'current' | 'future'`.
- `length_days` (int, default 30) — длина петли в днях. Добавлено миграцией
  `032_session_packs_and_loop_length.sql`.
- `title` (text, optional) — название петли, например «Петля пожара».

Парсер и хелперы — `lib/loops.ts`; чистые хелперы без Next.js-зависимостей —
`lib/loop-length.ts` (`parseLengthDays`, `DEFAULT_LOOP_LENGTH_DAYS = 30`).

---

## Сессия как нода

**Нода типа `session`**, поля в `nodes.fields`:

- `session_number` (int) — уникальный номер сессии в кампании.
- `loop_number` (int) — к какой петле принадлежит.
- `day_from`, `day_to` (int) — диапазон дней внутри петли; пустая строка =
  без даты. Добавлено миграцией `032`.
- `recap`, `dm_notes`, `game_date`, `played_at` — текстовые поля.

Сессия связана с петлей ребром типа `contains` (`is_base=true`):
`loop_node → session_node`. Состав пачки — рёбра типа `participated_in`
(`is_base=true`, добавлен миграцией `032`): `session_node → pc_node`.

Страницы: `app/c/[slug]/loops/`, `app/c/[slug]/sessions/`.

---

## Координаты `(loop_number, day_in_loop)`

Это базовая единица игрового времени в текущей реализации. Все события
приложения — транзакции, лут энкаунтеров, летопись — привязываются к паре
`(loop_number, day_in_loop)`. В целевой модели это заменится на `(loop_id, at_tick)`,
но сейчас это два целых числа на нодах и строках лога.

Глоссарий HANDOFF ↔ код — в [`concepts/README.md`](../../concepts/README.md).
Концепт петли как ядра — в [`concepts/loop-as-core.md`](../../concepts/loop-as-core.md).

---

## Frontier

**Frontier петли** — наибольший `day_to` среди всех сессий этой петли.
Показывает, как далеко по игровому времени зашла петля.

**Frontier персонажа** — наибольший `day_to` среди сессий, где этот PC
является участником (`participated_in`). Это «сейчас» конкретного персонажа.
Компонент `components/character-frontier-card.tsx` показывает frontier PC
с чипами сессий.

Оба рассчитываются в `lib/loops.ts` (`getLoopFrontier`, `getCharacterFrontier`)
двумя раундтрипами: сначала сессии петли через `contains`-рёбра, затем
фильтрация по `participated_in`.

---

## Прогрессбар

Компонент `components/loop-progress-bar.tsx` визуализирует временную ось петли:
горизонтальная шкала от 1 до `length_days`. Каждая сессия — отрезок `[day_from,
day_to]`. Наложения сессий разных пачек показываются «дорожками» (lanes),
чтобы не перекрывать друг друга — логика разбиения по lanes в
`components/loop-progress-bar-lanes.ts`.

---

## Связи с другими фичами

- **Транзакции** бухгалтерии ссылаются на сессию через `loop_number` /
  `day_in_loop` — см. [`accounting/README.md`](../accounting/README.md).
- **Энкаунтеры** привязывают лут к `loop_number` / `day_in_loop` в
  `encounter_loot_drafts`.
- **Loop start setup** (спека 012) — bulk-операция переноса характеристик
  PC в новую петлю; детали в [`accounting/starter-setup.md`](../accounting/starter-setup.md).

# [draft] Tick time model

> Заглушка. Содержание будет наполняться постепенно.

Целевая модель времени из HANDOFF: `Campaign.tick_unit_seconds` (основа — 6с, один ход боёвки D&D 5e), события хранят `at_tick: int` от точки отсчёта кампании, per-actor clock (`actor.current_tick`), длинные действия как один event с `start_tick + duration_ticks` (без итерации тиков). Миграция: (loop_number, day_in_loop) → (loop_id, at_tick) — сложная, затрагивает практически все таблицы.

## Что планируется в статье

- Зачем тики (vs день/час/минута): дискретность + presentation layer
- Per-actor clock и асинхронное время
- Длинные действия как компрессированный event
- Конвертация (loop, day) ↔ at_tick во время миграции
- Что в presentation layer (Day 5, Hour 22, Minute 7)
- Travel modes: Normal, Cautious — на старте
- Riski миграции: какие данные сломаются

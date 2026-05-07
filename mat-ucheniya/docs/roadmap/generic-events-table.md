# [draft] Generic events table

> Заглушка. Содержание будет наполняться постепенно.

Расширение текущего `transactions` (только деньги/предметы) до универсального `events` лога — append-only, с колонками `event_type`, `at_tick`, `visibility`, `persistence_scope`, `actor_id`, `location_id`, `payload jsonb`, `deleted_at`. Транзакции становятся одним из event_type'ов. Это фундамент для всего остального pivot'а.

## Что планируется в статье

- Колонки `events` и их семантика
- Индексы для быстрой свёртки и RLS
- Миграция: транзакции → events с сохранением совместимости
- RLS-политика по `visibility`
- Soft-delete и audit log

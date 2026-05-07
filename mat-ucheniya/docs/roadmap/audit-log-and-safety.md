# Audit log, soft-delete, версионирование

> Заглушка. Содержание будет наполняться постепенно.

Safety layer для DM-as-demiurge: вместо ограничения прав — следы. `event.deleted_at` nullable вместо `DELETE`. Каждая content-сущность с `version: int`; правка создаёт новую версию, старые остаются; события ссылаются на конкретную версию (`item_id` + `item_version`). Отдельная таблица `dm_audit_log` (action_type, target_id, before_state, after_state, timestamp). RLS: `role=dm` пишет любые типы; `dm_audit_log` читается только владельцем кампании.

## Что планируется в статье

- event.deleted_at: миграция, RLS-фильтрация в queries
- Версионирование: схема, FK с версией, восстановление
- dm_audit_log: схема, что пишется, как смотрится
- Что DM не может (DROP базы, чужие кампании, auth.users)
- UI: история правок ноды, восстановление

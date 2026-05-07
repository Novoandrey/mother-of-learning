# [draft] Тестирование

> Заглушка. Содержание будет наполняться постепенно.

vitest на pure-helpers (~410 тестов) — это ledger-aggregation, starter-setup-resolver, encounter-loot-resolver, approval-grouping, transaction-dedup, coin-split и подобные. Никаких mock'ов Supabase: pure functions берут input → возвращают output. SQL-smoke скрипты в `scripts/check-rls-NNN.sql` обёрнуты в BEGIN/ROLLBACK, прогоняются через Supabase Dashboard вручную после применения миграции. Vercel build = authoritative type-check.

## Что планируется в статье

- Что тестируем (pure helpers) и что не тестируем (UI, серверные actions)
- Локальный прогон: `npm run test`
- SQL-smoke: что покрываем (RLS, триггеры, CHECK), как запускаем
- Vercel build как type-check (когда `npm install` ломается локально)

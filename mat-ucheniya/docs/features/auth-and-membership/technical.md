# Auth — под капотом

> Заглушка. Содержание будет наполняться постепенно.

Серверные actions используют admin-client + явный ownership-check вместо сложных RLS-выражений на write — это контракт из `AGENTS.md`. RLS включён на всех таблицах как страховка от программных ошибок. `requireAuth()` в `lib/auth.ts` бросает redirect на /login. `getMembership(campaignId)` возвращает роль или null. Spec-006 миграции 024, 027–028, 031 — auth infra.

## Что планируется в статье

- Server-action auth contract (формула из AGENTS.md)
- RLS как страховка: что проверяет, что нет
- `requireAuth` / `getMembership` — контракт и use-cases
- Membership table: схема, индексы, FK
- Onboarding migrations и что они сидят

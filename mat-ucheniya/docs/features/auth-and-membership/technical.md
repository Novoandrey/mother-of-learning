# Авторизация — под капотом

> Контракт auth-гейтинга server actions, RLS как страховка, хелперы
> `lib/auth.ts`. Для разработчиков; пользовательский обзор — в [`README.md`](README.md).

---

## Контракт: server actions обязаны начинаться с auth-проверки

Все server actions в `app/actions/*.ts` пишут через `createAdminClient()`
(service role key) — это **bypass RLS**. Поэтому каждый новый экспортируемый
action обязан начинаться с одного из трёх вызовов:

- **`resolveAuth(campaignId)`** — local helper в `transactions.ts` и
  `approval.ts`. Возвращает `{ok, userId, role}` или `{ok: false, error}`.
  Предпочтительный вариант, когда action разветвляется по роли (DM vs player).
- **`getMembership(campaignId)`** из `@/lib/auth` — когда достаточно
  подтвердить факт членства, не смотря на роль.
- **`canEditNode(nodeId, campaignId, userId, role)`** из `@/lib/auth` —
  per-node гейтинг, зеркалящий SQL-функцию `can_edit_node` (миграция `028`).

Действия игрока на своём PC дополнительно требуют `isPcOwner(pcId, userId)`.
Паттерн: membership check + role check + ownership check — см.
`createTransaction` как канонический пример.

Если action — тонкая обёртка над уже гейтнутым action'ом (например,
`stash.ts` → `transactions.ts`), это должно быть явно задокументировано в
заголовке файла, чтобы code review не искал отсутствующие проверки.

---

## RLS как страховка

RLS включён на всех таблицах (миграция `024_auth_profiles_members_rls.sql`).
Политики строятся на SQL-хелперах `is_member(campaign_id)` и
`get_my_role(campaign_id)` — оба `SECURITY DEFINER` чтобы избежать рекурсии.

**Что RLS делает**: блокирует прямые SELECT из клиентского кода тем, кто не
член кампании. Работает как последний барьер на случай программной ошибки в
app-коде.

**Что RLS не делает**: не является основным механизмом авторизации на write-путях
— их защищает явный auth-check в server action до вызова admin-client.

Исключение: `encounter_loot_drafts` — только SELECT-политика для членов;
INSERT/UPDATE/DELETE только через admin-client (нет write-policy намеренно).

---

## `lib/auth.ts` — хелперы

Все хелперы обёрнуты в `React.cache()` — результат переиспользуется в пределах
одного запроса (layout + page + generateMetadata могут вызвать один и тот же
хелпер несколько раз без повторных round-trips).

| Функция | Что делает |
|---|---|
| `getCurrentUser()` | `supabase.auth.getUser()`, nullable |
| `getCurrentUserAndProfile()` | user + профиль из `user_profiles`, nullable |
| `requireAuth()` | Редирект на `/login` если нет auth или профиля; редирект на `/onboarding` если `must_change_password`. Возвращает `{user, profile}`. |
| `getMembership(campaignId)` | Роль пользователя в кампании или `null` |
| `requireMembership(campaignId)` | Вызывает `requireAuth()` + `getMembership`; редирект на `/` если не член |
| `canEditNode(nodeId, campaignId, userId, role)` | Логика из `031_shared_world_editing.sql`: owner/dm → true; player → true для non-character нод; player → true для character только если в `node_pc_owners` |

---

## `lib/supabase/admin.ts` и `lib/supabase/server.ts`

- **`createAdminClient()`** — использует `SUPABASE_SERVICE_ROLE_KEY`. Только для
  server actions. Bypass RLS — значит, любая ошибка в auth-гейтинге приводит
  к незащищённой записи. Вот почему контракт выше — не рекомендация, а правило.
- **`createClient()`** (server) — использует сессию залогиненного пользователя.
  RLS включён. Используется в Server Components для чтения данных кампании.

---

## Миграционная история auth-инфраструктуры

| Миграция | Что делает |
|---|---|
| `024` | `user_profiles`, `campaign_members`, RLS на всех таблицах |
| `027` | `node_pc_owners` (PC-принадлежность) |
| `028` | SQL `can_edit_node()`: player edit own PC |
| `031` | `shared_world_editing`: player может редактировать non-character ноды |
| `115` | `user_profiles.telegram_id bigint unique` |

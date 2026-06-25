# Авторизация и членство

> Supabase Auth + кастомные профили + три роли в кампании. Вход по паролю
> или magic link; onboarding при первом входе; приглашения через invite-link;
> Telegram-привязка для Mini App.

---

## Регистрация и вход

Вход реализован через Supabase Auth (email + password и magic link).
Страница — `app/login/`. Адреса электронной почты синтетические: аккаунты
создаются с email в виде `{login}@mol.local` (функция `loginToEmail` в
`lib/auth.ts`) — в UI сам email никогда не показывается.

Профиль пользователя хранится в таблице `user_profiles` (миграция
`024_auth_profiles_members_rls.sql`):
- `user_id` — PK, FK на `auth.users`.
- `login` — уникальный логин, `[a-z0-9_-]{3,32}`.
- `display_name` — отображаемое имя (nullable).
- `must_change_password boolean` — флаг первого входа.

---

## Onboarding

При первом входе (`must_change_password = true`) `requireAuth()` из `lib/auth.ts`
автоматически редиректит на `app/onboarding/`. Onboarding закрывает флаг и
позволяет выбрать кампанию или создать новую. После завершения — редирект
на главную страницу кампании.

---

## Роли в кампании

Таблица `campaign_members` (миграция `024`): `(campaign_id, user_id)` → `role`.

| Роль | Права |
|---|---|
| `owner` | Полный контроль: назначение ролей, удаление кампании. Один на кампанию (partial unique index). |
| `dm` | Редактирует всё в кампании. Несколько DM поддерживаются (миграция `031_shared_world_editing.sql`). |
| `player` | Читает всё; редактирует свои PC (миграции `027_node_pc_owners.sql`, `028_player_edit_own_pc.sql`). |

Управление составом — `app/c/[slug]/members/`. Owner может менять роли,
приглашать и исключать участников.

PC-принадлежность фиксируется в таблице `node_pc_owners` (миграция `027`):
`(node_id, user_id)`. Один PC может принадлежать нескольким игрокам.
Проверка — функция `canEditNode` в `lib/auth.ts`.

---

## Приглашения

Приглашение — одноразовый токен (invite-link). Owner или DM генерирует ссылку;
перейдя по ней, новый пользователь регистрируется и автоматически получает
роль `player` в кампании. Миграция `024_DEPLOY_GUIDE.md` описывает
последовательность применения этой миграции на проде.

---

## Telegram-привязка

Миграция `115_user_profiles_telegram_id.sql` добавила `telegram_id bigint UNIQUE`
в `user_profiles`. DM связывает Telegram-аккаунт с учётной записью через
`app/c/[slug]/settings/telegram/`. После привязки Mini App (Telegram)
идентифицирует пользователя по этому полю (спека 046).

---

## Технические детали

Схема RLS, admin-client, контракты `requireAuth`/`getMembership` —
в [`technical.md`](technical.md).

> Концептуальная модель ролей и клиентов — в
> [`concepts/roles-and-clients.md`](../../concepts/roles-and-clients.md).

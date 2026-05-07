# [draft] Авторизация и членство

> Заглушка. Содержание будет наполняться постепенно.

Регистрация через Supabase Auth (email + password, magic link). Onboarding flow: создание/выбор кампании, минимальный профиль. Роли в кампании: `owner` (создатель), `dm` (несколько поддерживаются), `player`. Приглашения через invite-link (одноразовый токен) или прямую раздачу owner'ом. Membership-таблица — single source of truth для проверок прав.

## Что планируется в статье

- Регистрация и логин (email/password + magic link)
- Onboarding flow: куда попадает новый юзер
- Создание кампании и назначение owner
- Приглашения: invite-link, expiration, разовость
- Смена роли (owner может; downgrade и restore)

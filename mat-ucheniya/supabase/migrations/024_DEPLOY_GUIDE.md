# Инкремент 1: Auth + RLS — как развернуть

## ⚠️ Ломающее изменение прода

После миграции 024 анонимный доступ отключается. Пока не запустишь
`seed-owner`, приложение НЕ БУДЕТ работать ни для кого. Окно недоступности:
~30–60 сек между накатом миграции и успешным запуском скрипта.

## Порядок действий

### 1. Supabase Dashboard — настройка Auth

**Auth → Providers → Email:**
- `Enable Email provider` — ✓ включить
- `Confirm email` — ✗ выключить (мы шлём через admin API с
  `email_confirm: true`)

### 2. ENV переменные в Vercel

Добавить (Project Settings → Environment Variables):

```
SUPABASE_SERVICE_ROLE_KEY=<из Supabase Dashboard → API → service_role (secret)>
```

Убедись, что переменная НЕ помечена как `NEXT_PUBLIC_*` — это критично.

### 3. Применить миграцию 024

Через Supabase SQL Editor или `supabase db push`:

```
supabase/migrations/024_auth_profiles_members_rls.sql
```

Содержит:
- Таблицы `user_profiles`, `campaign_members`
- Колонку `nodes.owner_user_id`
- Helper functions `is_member`, `is_dm_or_owner`, `is_owner`
  (SECURITY DEFINER)
- RLS policies на все 17 таблиц

### 4. Локально: запустить seed-owner

Создай локальный `.env.local` в `mat-ucheniya/` (если ещё нет):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Запусти:

```sh
cd mat-ucheniya
npm install   # если не ставил
npm run seed-owner -- --login admin --password <YOUR_PASSWORD> --campaign mat-ucheniya
```

Замени `<YOUR_PASSWORD>` на свой. Пароль никуда не сохраняется кроме
auth.users в Supabase (хешируется). Твой пароль из чата —
`mol42totalpartykill` — вставишь его вручную в момент запуска.

Скрипт идемпотентный: повторный запуск с тем же логином обновит
пароль и роль, не создаст дубликат. Полезно, если когда-нибудь
забудешь пароль owner'а — можно просто перезапустить.

### 5. Проверить локально

```sh
npm run dev
```

Открыть `http://localhost:3000` → должно редиректить на `/login` →
ввести `admin` + свой пароль → попасть на `/c/mat-ucheniya/catalog`
со всем контентом как раньше.

### 6. Деплой

```sh
git push
```

Vercel подхватит. В проде после этого: открыть
`https://mother-of-learning.vercel.app` → `/login` → `admin` +
пароль → кампания.

## Флоу для будущих юзеров (Инкремент 2+)

Инкремент 1 закрывает только owner'а. ДМов и игроков ещё нельзя
создать через UI — будет в Инкременте 2 (страница `/members`).
До этого других пользователей заводить некому.

## Откат

Если что-то сломалось и хочешь вернуть публичный доступ:

```sql
-- Отключить RLS на всех таблицах (быстрый откат).
alter table nodes disable row level security;
alter table edges disable row level security;
alter table encounters disable row level security;
alter table encounter_participants disable row level security;
-- …и так по списку из миграции 024.
```

Это НЕ удаляет таблицы user_profiles/campaign_members, только
открывает доступ обратно. После отката middleware всё ещё будет
слать на /login, так что нужно либо выкатить ветку с выключенным
middleware, либо накатить RLS обратно и чинить корректно.

## Архитектура — ключевые файлы

- `middleware.ts` — session refresh + redirects
- `lib/supabase/middleware.ts` — helper для updateSession
- `lib/supabase/admin.ts` — service role client (server-only)
- `lib/auth.ts` — requireAuth, requireMembership, loginToEmail
- `app/login/` — форма входа
- `app/onboarding/` — принудительная смена пароля при первом входе
- `app/account/` — self-service смена пароля
- `app/auth/signout/route.ts` — выход
- `components/user-menu.tsx` — логин + «Выйти» в шапке
- `scripts/seed-owner.ts` — CLI для первого owner'а
- `supabase/migrations/024_auth_profiles_members_rls.sql` — вся БД

## Как работает синтетический email

Supabase Auth требует email. Мы используем `{login}@mol.local`
как технический email. Пользователь вводит только логин; `loginToEmail()`
в `lib/auth.ts` добавляет суффикс перед отправкой в `signInWithPassword`.
В UI email не показывается никогда.

`mol.local` — это TLD из RFC 2606, гарантированно не резолвится в
реальный домен. Если кто-то попытается отправить письмо на
`admin@mol.local`, ничего не случится.

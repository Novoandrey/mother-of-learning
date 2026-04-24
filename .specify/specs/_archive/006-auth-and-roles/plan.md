# Implementation Plan: Auth + Roles + RLS

**Branch**: `006-auth-and-roles` | **Date**: 2026-04-19 | **Spec**: spec-006

## Summary

Supabase Auth с password-based signin, технический email `{login}@mol.local`,
force change at first login через middleware, password reset только через
DM. Service role key для админских операций (создание юзеров, сброс пароля).
4 инкремента. Этот план покрывает Инкремент 1 — фундамент.

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres + Auth) + Tailwind v4

**Библиотеки уже стоят**: `@supabase/ssr`, `@supabase/supabase-js`

**Новое в стек**:
- ENV: `SUPABASE_SERVICE_ROLE_KEY` (Vercel + локально в .env.local)
- Dev dep: `tsx` для запуска CLI-скрипта TypeScript

**Supabase Dashboard** (ручные шаги, не через миграцию):
- Auth → Providers → Email → Enable email provider ✓
- Auth → Providers → Email → `Confirm email` ✗ (отключить)
- Auth → Policies → RLS включается через миграцию 024

## Constitution Check

- ✅ VI: роли owner/dm/player, multi-DM
- ✅ IX: инкременты = 4 маленькие карточки
- ✅ V: каждый инкремент даёт играбельный результат
- ✅ X: ничего в коде специфично для mat-ucheniya (кроме CLI-аргумента скрипта)
- ⚠️ Прод после Инкремента 1 перестанет быть публичным → ломающее изменение

## Data Model (новое в миграции 024)

### user_profiles
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid PK FK auth.users CASCADE | |
| login | text UNIQUE NOT NULL | regex `^[a-z0-9_-]{3,32}$` |
| display_name | text | nullable, fallback на login в UI |
| must_change_password | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |

### campaign_members
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| campaign_id | uuid FK campaigns CASCADE | NOT NULL |
| user_id | uuid FK auth.users CASCADE | NOT NULL |
| role | text CHECK (role IN ('owner','dm','player')) | NOT NULL |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE (campaign_id, user_id) | | |
| PARTIAL UNIQUE (campaign_id) WHERE role='owner' | | один owner per-campaign |

### nodes.owner_user_id
Новая колонка `uuid FK auth.users ON DELETE SET NULL`. Nullable. Смысл
только для type=character.

## RLS Strategy

### Helper functions (в той же миграции)

```sql
create or replace function is_member(p_campaign_id uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  )
$$;

create or replace function is_dm_or_owner(p_campaign_id uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role in ('owner','dm')
  )
$$;

create or replace function is_owner(p_campaign_id uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'owner'
  )
$$;
```

`SECURITY DEFINER` — чтобы функция обходила RLS на campaign_members
при проверке (иначе рекурсия: проверка доступа к nodes → запрос к
campaign_members → проверка доступа к campaign_members → …).

### Policies (Инкремент 1 — упрощённые)

**campaigns**:
- SELECT: `is_member(id)`
- all: false (никто через API не модифицирует, только миграции)

**campaign_members**:
- SELECT: `is_member(campaign_id)` — члены видят список
- all: `is_owner(campaign_id)` — только owner

**user_profiles**:
- SELECT: `user_id = auth.uid() OR exists (select 1 from campaign_members cm1, campaign_members cm2 where cm1.user_id = user_profiles.user_id and cm2.user_id = auth.uid() and cm1.campaign_id = cm2.campaign_id)`
- UPDATE: `user_id = auth.uid()` — сам себя
- INSERT/DELETE: service role only (bypass RLS)

**nodes, edges, encounters, encounter_participants, encounter_templates,
encounter_template_participants, chronicles, party, party_members,
encounter_log, encounter_events, node_types, edge_types, loops, sessions**:
- SELECT: `is_member(campaign_id)` (для таблиц без campaign_id — через
  join к родителю)
- INSERT/UPDATE/DELETE: `is_dm_or_owner(campaign_id)`

Инкремент 4 добавит edge case: ноды type=character с `owner_user_id =
auth.uid()` — UPDATE доступен владельцу. Сейчас не трогаем.

## Source Structure (Инкремент 1)

```
mat-ucheniya/
├── middleware.ts                         # NEW: session refresh + redirects
├── lib/
│   ├── supabase/
│   │   ├── client.ts                    # existing
│   │   ├── server.ts                    # existing
│   │   ├── middleware.ts                # NEW: session refresh helper
│   │   └── admin.ts                     # NEW: service role client
│   └── auth.ts                           # NEW: getCurrentUser, requireAuth helpers
├── app/
│   ├── page.tsx                          # UPDATE: redirect logic
│   ├── layout.tsx                        # existing
│   ├── login/
│   │   ├── page.tsx                     # NEW
│   │   └── actions.ts                   # NEW: signInAction
│   ├── onboarding/
│   │   ├── page.tsx                     # NEW: force password change
│   │   └── actions.ts                   # NEW
│   ├── account/
│   │   ├── page.tsx                     # NEW: change password (self-service)
│   │   └── actions.ts                   # NEW
│   ├── auth/
│   │   └── signout/
│   │       └── route.ts                 # NEW: POST → signOut → redirect
│   └── c/[slug]/
│       └── layout.tsx                    # UPDATE: require membership
├── components/
│   └── user-menu.tsx                    # NEW: display_name + logout button
├── scripts/
│   └── seed-owner.ts                     # NEW: CLI для первого owner'а
├── supabase/migrations/
│   └── 024_auth_profiles_members_rls.sql # NEW
└── package.json                          # UPDATE: add tsx, add scripts.seed-owner
```

## Key Design Decisions

1. **Synthetic email `{login}@mol.local`** — в UI нигде не показывается.
   Хранится как Supabase auth.users.email. При логине UI показывает поле
   «Логин», под капотом добавляем `@mol.local`.

2. **must_change_password в user_profiles, не в app_metadata** —
   проще читать, можно делать JOIN, видно из Server Components.

3. **Owner создаётся с must_change_password=false** — он сам задавал
   пароль в CLI, нет смысла просить сменить.

4. **Приглашённые юзеры (создаваемые через /members) — must_change_password=true**
   — их пароль знает ДМ, надо сменить.

5. **Middleware делает session refresh + redirects** — стандартный
   паттерн Supabase SSR. Без refresh сессия может тихо умереть.

6. **Service role client используется ТОЛЬКО в Server Actions / API
   routes** — никогда в Client Components. Отдельный файл
   `lib/supabase/admin.ts` с проверкой окружения.

7. **RLS включается через ALTER TABLE для всех таблиц разом** в
   миграции 024. Тестирование: после миграции залогиненный owner
   должен видеть все существующие 150+ нод.

## Risks

1. **Забыть RLS на таблицу** → баг видимости. Митигация: в миграции
   024 явный список всех текущих таблиц + policies.

2. **Service role key утечёт в клиент** → полный доступ к данным
   в обход RLS. Митигация:
   - `lib/supabase/admin.ts` начинается с `import 'server-only'`
   - Проверка `typeof window === 'undefined'` при создании
   - Имя переменной без `NEXT_PUBLIC_` префикса.

3. **Миграция 024 наложится на прод и сломает** → игроки не смогут
   зайти, пока owner не засидится. Митигация:
   - Миграцию накатить на Supabase **ПОСЛЕ** seed-скрипта.
   - Но seed-скрипт зависит от таблиц миграции 024…
   - Решение: миграция 024 применяется; **СРАЗУ** запускается
     seed-owner; в промежутке анонимный доступ уже отключён, но
     это окно меньше минуты. Prod будет недоступен на ~30 сек
     между миграцией и seed'ом.
   - Документируем это в инструкции запуска.

4. **`is_member` функция + SECURITY DEFINER** — опасный паттерн,
   если функция принимает произвольные данные. Митигация: функция
   принимает uuid и использует `auth.uid()`, не пользовательский
   ввод. Никто не может подсунуть чужой `user_id`.

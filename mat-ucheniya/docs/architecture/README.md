# Архитектура

> Кросс-cutting технические темы, не привязанные к одной фиче: стек, кэш,
> автосохранение форм, тесты, дизайн-токены. Если фича сама по себе требует
> глубокого технического разбора — смотрите её `technical.md`; здесь — то, что
> общее для всего приложения.

---

## Что в этом разделе

| Статья | О чём |
|---|---|
| [`stack.md`](stack.md) | Версии зависимостей, структура папок, деплой (Hetzner+Dokploy), особенности Next.js 16 |
| [`sidebar-cache.md`](sidebar-cache.md) | `unstable_cache` с тегом `sidebar:<campaignId>`, контракт инвалидации по call-site |
| [`form-drafts.md`](form-drafts.md) | `useFormDraft` — debounce-автосохранение форм в localStorage, баннер восстановления |
| [`style-tokens.md`](style-tokens.md) | Токены UI из `STYLE.md` — инпуты, кнопки, чипы, контрасты |
| [`testing.md`](testing.md) | Vitest на pure-helpers, SQL-smoke скрипты, build как type-check |

## Что НЕ в этом разделе

Если тема привязана к конкретной фиче, она живёт в `technical.md` этой фичи:

- транзакционная логика, RLS-схема бухгалтерии → [`features/accounting/technical.md`](../features/accounting/technical.md)
- алгоритм encounter loot resolver → [`features/encounters/technical.md`](../features/encounters/technical.md)
- структура каталога предметов, seed-миграции → [`features/inventory-and-items/technical.md`](../features/inventory-and-items/technical.md)

---

## Quick links

**Фронтенд.** Компоненты — `components/`, хуки — `hooks/`. Роуты App Router —
`app/c/[slug]/{accounting,catalog,encounters,items,loops,sessions,…}`. Телеграм
Mini App — `app/tg`. Документация (этот сайт) — `app/docs/`.

**Бэкенд.** Server actions — `app/actions/*.ts`. Route handlers — `app/api/`.
Чистые хелперы (без Supabase) — `lib/`. Запросы к БД — `lib/queries/`.
Supabase-клиенты — `lib/supabase/`.

**Инфраструктура.** Деплой, staging, бэкапы — [`process/git-and-staging.md`](../process/git-and-staging.md).
Процесс разработки — [`process/README.md`](../process/README.md).

# Стек

> Технологический стек, структура папок, деплой и особенности Next.js 16,
> на которые мы наступаем. Каверзы фреймворка — в `mat-ucheniya/AGENTS.md`.

---

## Зависимости

| Пакет | Версия | Роль |
|---|---|---|
| `next` | 16.2.3 | App Router, server actions, `unstable_cache` |
| `react` / `react-dom` | 19.2.4 | UI |
| `@supabase/supabase-js` | ^2.103.0 | Клиент БД/Auth |
| `@supabase/ssr` | ^0.10.2 | SSR-хелперы (cookies, серверный клиент) |
| `tailwindcss` | ^4 | CSS-утилиты (v4, PostCSS-based) |
| `@tailwindcss/typography` | ^0.5.19 | Стили для markdown-контента |
| `lucide-react` | ^1.8.0 | Иконки |
| `@fontsource-variable/manrope` | ^5.2.8 | Основной шрифт (variable) |
| `@fontsource-variable/jetbrains-mono` | ^5.2.8 | Моноширинный (code/markdown) |
| `react-markdown` + `remark-gfm` | ^10.1 / ^4 | Рендеринг markdown в `/docs` |
| `jose` | ^6.2.3 | JWT-верификация для Telegram Mini App auth |
| `vitest` | ^4.1.5 | Тесты pure-helpers |
| `tsx` | ^4.19.2 | Запуск скриптов (`scripts/*.ts`) |
| `aws4fetch` | ^1.0.20 | Подпись запросов к R2 (бэкапы) |

**TypeScript strict** включён. **ESLint 9** с `eslint-config-next`.

---

## Структура папок

```
mat-ucheniya/
├── app/                     # App Router: layouts, pages, server actions, API routes
│   ├── c/[slug]/            # Кампания: accounting, catalog, encounters, …
│   ├── tg/                  # Telegram Mini App (/tg)
│   ├── docs/[[...slug]]/    # Документация
│   ├── actions/             # Server actions (*.ts)
│   └── api/                 # Route handlers
├── components/              # React-компоненты
├── hooks/                   # Client hooks (use-form-draft.ts, …)
├── lib/                     # Чистые хелперы + Supabase-клиенты + queries
│   ├── __tests__/           # Vitest тесты
│   ├── supabase/            # admin.ts, server.ts, client.ts, proxy.ts
│   └── queries/             # Функции чтения из БД
├── scripts/                 # Seed/import/check скрипты (tsx)
├── supabase/
│   └── migrations/          # SQL-миграции (001–117+)
├── docs/                    # Документация (markdown, этот сайт)
├── proxy.ts                 # Auth proxy (Next.js 16: вместо middleware)
├── AGENTS.md                # Правила кода (обязательно читать)
├── STYLE.md                 # Дизайн-токены
└── vitest.config.ts
```

---

## NPM-скрипты

| Скрипт | Что делает |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (= авторитетный type-check) |
| `npm run typecheck` | `tsc --noEmit` без сборки |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (`vitest run`) |
| `npm run seed-owner` | Создать owner-аккаунт |
| `npm run seed-srd` | Загрузить SRD-предметы |
| `npm run seed-portraits` | Загрузить портреты PC |
| `npm run import-electives` | Импорт факультативов |

---

## Server actions vs route handlers vs RPC

- **Server actions** (`app/actions/*.ts`) — основной путь для мутаций из
  клиентских компонентов. Используют `createAdminClient()` (service role, RLS
  bypassed) и **обязаны** начинаться с auth-check (см. `AGENTS.md`).
- **Route handlers** (`app/api/*`) — для внешних вызовов: Telegram webhooks,
  CLI-инвалидация сайдбара (`/api/admin/invalidate-sidebar`).
- **Postgres RPC** (`supabase.rpc(...)`) — для сложных атомарных операций:
  loop-start setup, autogen-транзакции энкаунтера.
- **Прямые клиентские запросы** — только read-only через `lib/queries/`;
  RLS защищает их по `role` из JWT.

---

## Деплой

**Прод — self-hosted на Hetzner** (CPX32, Helsinki). Хостится через **Dokploy**:
PR в `main` → CI gate → Dokploy строит Docker-образ прямо на боксе → деплой.
Self-hosted Supabase: API `db.theloopers.org`, Studio только через SSH-туннель,
порт 5432 закрыт наружу.

**Staging** — ветка `staging` → https://staging.theloopers.org, облачная
Supabase-копия прода. Staging можно ломать свободно — он для проверки перед PR.

Vercel исторически использовался на раннем этапе. После инфра-эпика 023–027
(spec-043) прод переехал на Hetzner+Dokploy. Vercel в текущем деплое
не задействован.

Детали — [`process/git-and-staging.md`](../process/git-and-staging.md).

---

## Особенности Next.js 16

**`proxy.ts` вместо `middleware.ts`** — в Next.js 16 auth-proxy называется
`proxy.ts` и экспортирует функцию `proxy` (не `middleware`). Файл лежит в
`mat-ucheniya/proxy.ts`. Логика: refresh Supabase-cookie, редирект
неаутентифицированных с `/c/*` на `/login`, редирект `must_change_password` →
`/onboarding`, запись cookie `current_campaign_slug`. Реализация сессионного
обновления — `lib/supabase/proxy.ts`.

**`revalidateTag(tag, 'max')`** — второй аргумент (cache profile) обязателен при
инвалидации `unstable_cache`; без него тег не сбрасывается. Подробнее —
[`sidebar-cache.md`](sidebar-cache.md).

Полный список каверзов — `mat-ucheniya/AGENTS.md`, раздел «This is NOT the
Next.js you know».

# Implementation Plan: Граф сущностей — фундамент

**Branch**: `001-entity-graph-foundation` | **Date**: 2026-04-13 | **Spec**: [spec.md](./spec.md)

## Summary

Создать работающий сайт с графом сущностей кампании: Postgres-таблицы
для нод/рёбер с JSONB-полями, полнотекстовый поиск по кириллице,
каталог с фильтрацией и карточками, навигация по связям. Seed-данные
из реальных таблиц кампании "Мать Учения". Деплой на Vercel + Supabase.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18+
**Framework**: Next.js 14+ (App Router)
**Primary Dependencies**: @supabase/supabase-js, @supabase/ssr, Tailwind CSS 3
**Storage**: PostgreSQL 15 (Supabase)
**Testing**: Manual (первый релиз), далее Vitest
**Target Platform**: Web (desktop-first, responsive)
**Project Type**: Web application (fullstack via Supabase)
**Performance Goals**: Поиск < 500ms, загрузка каталога < 2s
**Constraints**: Один разработчик, минимум инфраструктуры
**Scale/Scope**: ~500 нод, ~2000 рёбер, 1 кампания, 1–20 пользователей

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Атомарность | ✅ PASS | Ноды и рёбра — атомарные сущности с ID |
| II. Перекрёстные ссылки | ⚠️ PARTIAL | Рёбра есть, wiki-ссылки [[...]] вне скоупа |
| III. Петля как ось | ⏭ N/A | Вне скоупа этой фичи |
| IV. Данные первичны | ✅ PASS | Supabase API = данные без UI; SQL seed |
| V. Каждый релиз играбелен | ✅ PASS | Каталог с поиском > Google Sheets |
| VI. Мульти-ДМ | ⏭ DEFERRED | campaigns таблица готова, auth позже |
| VII. Ссылки не копии | ✅ PASS | fields может хранить URL-ссылки |
| VIII. Простота стека | ✅ PASS | Next.js + Supabase + Vercel, больше ничего |
| IX. Микро-фичи | ✅ PASS | Одна фича, 10 FR, seed 18 сущностей |
| X. Универсальность | ✅ PASS | node_types конфигурируемы per campaign |

**Gate result**: PASS. Partial на II допустим — wiki-ссылки запланированы
как следующая фича.

## Project Structure

### Documentation (this feature)

```text
specs/001-entity-graph-foundation/
├── spec.md
├── plan.md              (this file)
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── supabase-api.md
└── checklists/
    └── requirements.md
```

### Source Code

```text
mat-ucheniya/
├── app/
│   ├── layout.tsx              # Root layout, шрифты, Supabase provider
│   ├── page.tsx                # Redirect → /catalog
│   └── catalog/
│       ├── page.tsx            # Каталог: список + поиск + фильтры
│       └── [id]/
│           └── page.tsx        # Карточка ноды: поля + связи
├── components/
│   ├── node-list.tsx           # Список нод с виртуальным скроллом
│   ├── node-card.tsx           # Карточка-превью в списке
│   ├── node-detail.tsx         # Полная карточка с полями
│   ├── edge-list.tsx           # Список связей на карточке
│   ├── search-input.tsx        # Поле поиска с debounce
│   ├── type-filter.tsx         # Фильтр по типу сущности
│   └── create-node-form.tsx    # Форма создания новой ноды
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser Supabase client
│   │   ├── server.ts           # Server Supabase client
│   │   └── types.ts            # Generated DB types
│   └── utils.ts                # Helpers
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seed.sql                # 10 NPC + 5 PC + 3 locations + edges
├── tailwind.config.ts
├── next.config.ts
├── package.json
└── .env.local.example
```

**Structure Decision**: Один Next.js проект. Нет отдельного бекенда —
Supabase предоставляет API. Миграции и seed живут в `supabase/` для
CLI `supabase db push` / `supabase db reset`.

## Implementation Phases

### Phase A: Инфраструктура (DX-001)

1. `npx create-next-app@latest mat-ucheniya --typescript --tailwind --app`
2. Создать проект в Supabase Dashboard.
3. Установить `@supabase/supabase-js`, `@supabase/ssr`.
4. Настроить `.env.local` с `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Создать `lib/supabase/client.ts` и `lib/supabase/server.ts`.
6. Деплой пустого Next.js на Vercel. Проверить: сайт открывается.

### Phase B: Схема данных (DM-001)

1. Написать `001_initial_schema.sql` по data-model.md:
   - Таблица `campaigns`.
   - Таблица `node_types` с FK на campaigns.
   - Таблица `nodes` с FK на node_types, JSONB fields, tsvector.
   - Таблица `edges` с FK на nodes (source/target).
   - Триггер для search_vector.
   - Все индексы.
2. Применить миграцию: `supabase db push` или через Dashboard SQL Editor.
3. Сгенерировать TypeScript-типы: `supabase gen types typescript`.
4. Проверить: таблицы видны в Supabase Table Editor.

### Phase C: Seed-данные (DX-002)

1. Написать `seed.sql` с реальными данными из таблиц:
   - 1 кампания "Мать Учения".
   - 8 типов нод.
   - 10 НПС + 5 PC + 3 локации (title + fields из таблиц).
   - ~15 связей между ними.
2. Применить seed: `supabase db reset` (миграция + seed).
3. Проверить: данные видны в Table Editor, поиск по `search_vector` работает.

### Phase D: Каталог и карточка (UI-001)

1. `catalog/page.tsx` — Server Component:
   - Загрузить node_types для фильтров.
   - Загрузить первые 50 нод (или все, при ~18 штуках).
   - Рендерить SearchInput + TypeFilter + NodeList.
2. `search-input.tsx` — Client Component:
   - Debounce 300ms.
   - При изменении → обновить URL search params → перезагрузить данные.
3. `type-filter.tsx` — Client Component:
   - Список кнопок/чипов по типам + "Все".
   - При клике → обновить URL search params.
4. `catalog/page.tsx` читает search params, делает запрос с фильтрами.
5. `catalog/[id]/page.tsx` — Server Component:
   - Загрузить ноду по ID + связи.
   - Рендерить NodeDetail + EdgeList.
6. `edge-list.tsx` — связь = ссылка `<Link href="/catalog/{id}">`.
7. `create-node-form.tsx` — Client Component:
   - Выбор типа → показать default_fields как подсказку.
   - Ввод title + fields → insert → redirect в каталог.

### Phase E: Деплой и проверка

1. Push в GitHub.
2. Vercel auto-deploy.
3. Пройти 4 сценария из quickstart.md.
4. Показать друзьям.

## Complexity Tracking

Нет нарушений конституции, таблица не требуется.

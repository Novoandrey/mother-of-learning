# Кэш сайдбара и инвалидация

> `lib/sidebar-cache.ts` — `unstable_cache`-обёртка над данными для левого
> навигационного дерева кампании. Сайдбар рендерится на каждой странице
> `/c/[slug]/*`, поэтому без кэша каждая навигация перечитывала бы 150+ нод.
> Канон контракта — `mat-ucheniya/AGENTS.md` раздел «Sidebar cache invalidation».

---

## Что кэшируется

`getSidebarData(campaignId)` читает через admin-клиент:

- `node_types` кампании (id, slug, label, icon) — отсортированы по `sort_order`
- все `nodes` кампании (id, title, `type_slug`) — через постраничный цикл

**Encounter-ноды** (`type_slug = 'encounter'`) фильтруются и в сайдбар не
попадают — они навигируются через список энкаунтеров, а не через дерево нод.

Кэш-тег: `sidebar:<campaignId>`. Revalidate: `60` секунд — максимальное время
«несвежего» сайдбара при пропущенной инвалидации.

---

## Pagination: 10k cap

`node_types` Supabase проекта ограничивает ответ 1000 строками независимо от
`range()`. Поэтому хук грузит ноды постранично: `PAGE_SIZE = 1000`,
`MAX_PAGES = 10`, цикл прерывается как только страница вернула меньше `PAGE_SIZE`
строк. Жёсткий потолок — ~10k нод. На текущем масштабе (~1600 нод) это
комфортно. При реальном приближении к 10k — нужен count-only sidebar или
ленивая загрузка (числится в «Хвостах» `NEXT.md`, не блокер).

---

## Контракт инвалидации по call-site

Любая серверная мутация, затрагивающая `node_types` или `nodes` (создание,
переименование, смена типа/иконки, удаление), **обязана** инвалидировать тег.
Иначе сайдбар покажет устаревший контент до следующего 60-секундного
self-heal.

| Call-site | Как инвалидировать |
|---|---|
| Server action / Route Handler | `import { invalidateSidebar } from '@/lib/sidebar-cache'` → `invalidateSidebar(campaignId)` |
| Client hook / компонент | `import { invalidateSidebarAction } from '@/app/actions/cache'` → `await invalidateSidebarAction(campaignId)` (server action, гейтит по membership) |
| CLI-скрипт (вне Next runtime) | `invalidateSidebarRemote(campaignSlug)` из `scripts/lib/invalidate-sidebar-remote.ts` — POST на `/api/admin/invalidate-sidebar` (auth: `Bearer SUPABASE_SERVICE_ROLE_KEY`). Читает `APP_URL` (дефолт `http://localhost:3000`); при запуске против прода — выставить в деплой-URL. Ошибка не фатальна, сайдбар самовосстановится через 60s. |

**CLI-обходной путь** существует потому, что `revalidateTag` — внутренняя
функция Next runtime; вызвать её из скрипта, запущенного через `tsx`,
невозможно. Endpoint `POST /api/admin/invalidate-sidebar` — тонкая обёртка,
которая принимает тот же `SUPABASE_SERVICE_ROLE_KEY` и вызывает `invalidateSidebar`
внутри Next-контекста. Параметр — `?campaign=<slug-or-uuid>`.

---

## Что НЕ в кэше

Таблицы `chronicles`, `encounters`, `encounter_participants`, `edges`,
`node_pc_owners` сайдбарный кэш **не затрагивают**. Страницы, читающие их,
по большей части объявлены `export const dynamic = 'force-dynamic'` и явной
инвалидации не требуют. Если добавляете кэш на новую таблицу — документируйте
контракт инвалидации в `AGENTS.md`.

---

## Технический нюанс: `revalidateTag` в Next.js 16

`invalidateSidebar` вызывает `revalidateTag(tag, 'max')` — второй аргумент
(cache profile) обязателен в Next.js 16, где `unstable_cache` привязан к
профилю. Без него инвалидация молча не срабатывает.

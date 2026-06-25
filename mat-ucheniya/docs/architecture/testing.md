# Тестирование

> Что и чем покрываем тестами, что сознательно не покрываем и почему
> «зелёный build = type-check». Технические детали отдельных фич — в их
> `technical.md`.

Стратегия простая: **тестируем чистые функции, не тестируем стекло и сервер.**
Никаких mock'ов Supabase, никаких рендеров компонентов — только `input → output`
на pure helpers из `lib/`.

---

## Что покрываем

`lib/__tests__/` содержит 23 тест-файла (~410 тестов vitest):

| Категория | Файлы |
|---|---|
| Транзакции | `transaction-dedup`, `transaction-format`, `transaction-resolver`, `transaction-validation` |
| Старт петли | `starter-setup-resolver`, `starter-setup-diff`, `starter-setup-affected`, `starter-setup-validation` |
| Encounter loot | `encounter-loot-resolver`, `encounter-loot-validation` |
| Approval | `approval`, `approval-policy` |
| Деньги | `coin-split`, `contribution-split` |
| Инвентарь | `inventory-aggregation`, `inventory-slice`, `stash-aggregation`, `items-filters`, `items-grouping`, `items-validation` |
| Цены | `apply-default-prices` |
| Другое | `shortfall-resolver`, `telegram-init-data` |

**Что не тестируем сознательно:**

- UI-компоненты (React) — нет JSDOM, нет react-testing-library
- Server actions — зависят от Supabase-клиента и auth-контекста
- Route handlers — интеграционный уровень, не unit

Если хелпер требует Supabase, он не должен быть в `lib/` — нужен либо `lib/queries/`, либо server action.

---

## Локальный запуск

```sh
npm run test          # vitest run (однократно)
npm run typecheck     # tsc --noEmit (без сборки)
npm run build         # полный build = авторитетный type-check
```

Vitest-конфиг (`vitest.config.ts`): `environment: 'node'`, `include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts']`, `passWithNoTests: true`. Алиасы `@/…` резолвятся через `tsconfigPaths: true` (Vite 6+ native, без плагина).

---

## SQL-smoke (RLS, триггеры, CHECK)

После применения миграции ручная проверка через Supabase Dashboard SQL Editor.
Скрипты в `scripts/`:

| Файл | Что проверяет |
|---|---|
| `check-rls-013.sql` | RLS на `encounter_loot_drafts` (spec-013) |
| `check-rls-014.sql` | RLS на approval-таблицы (spec-014) |
| `check-rls-015.sql` | RLS на item/inventory таблицы (spec-015) |
| `check-rls-018.sql` | RLS на dnd.su предметы (spec-018) |
| `check-approval-constraints-014.sql` | CHECK-ограничения approval flow |
| `check-encounter-mirror-triggers.sql` | Триггер автосоздания mirror-ноды энкаунтера |

Все скрипты обёрнуты в `BEGIN … ROLLBACK` — тестовые данные живут только во
время выполнения и на прод не оседают. Ожидаемый вывод: строки `PASS …` и
итоговый `✓ All PASS (N tests)`. Хоть один `FAIL` — разбираться сразу.

---

## Build как type-check

`npm run build` — авторитетный type-check. Когда `npm install` ломается локально
(конфликты нативных зависимостей, Node-версия), CI в Dokploy всё равно
прогоняет build внутри Docker-образа. Если build зелёный — типы чистые.

`npm run typecheck` (`tsc --noEmit`) быстрее, но не ловит некоторые
Next.js-специфичные ошибки типов (например, в server actions и layout-пропах),
которые вылазят только при полном build.

> См. также: [`stack.md`](stack.md), [`process/spec-kit.md`](../process/spec-kit.md).

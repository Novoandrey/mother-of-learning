# Implementation Plan: Петли и сессии как ноды графа

**Branch**: `003-loops-sessions-as-nodes` | **Date**: 2026-04-13 | **Spec**: spec.md

## Summary

Мигрировать петли и сессии из отдельных таблиц (`loops`, `sessions`)
в единый граф (`nodes` + `edges`). Добавить node_types `loop` и `session`,
перенести данные, обновить UI-страницы на чтение из `nodes`,
обновить search_vector триггер для индексации всех JSONB-полей,
удалить старые таблицы.

## Technical Context

**Stack**: Next.js 14 (App Router) + Supabase + Tailwind v4
**Storage**: Supabase Postgres — модификация существующих таблиц
**Testing**: Ручное тестирование по quickstart-сценариям
**Constraints**: Миграция без потери данных, UI-совместимость

## Constitution Check

- ✅ I. Атомарность: петли и сессии становятся нодами — главная цель
- ✅ II. Перекрёстные ссылки: сессии можно связывать с НПС через рёбра
- ✅ IV. Данные-первичны: всё через JSONB fields, UI — линза
- ✅ V. Каждый релиз играбелен: после миграции всё работает как раньше + бонусы
- ✅ VIII. Простота стека: ничего нового, те же таблицы
- ✅ X. Универсальность: search_vector индексирует все поля, не захардкожен под recap
- ✅ XI. Единообразие: реюзаем существующие компоненты (NodeDetail, теги, markdown)

## Data Model

### Новые node_types

| slug | label | icon | default_fields |
|------|-------|------|----------------|
| loop | Петля | 🔄 | `{number: "", title: "", status: "past", notes: ""}` |
| session | Сессия | 📋 | `{session_number: "", title: "", recap: "", dm_notes: "", played_at: "", game_date: ""}` |

### Маппинг полей

**loops → nodes (type=loop)**:
- `loops.number` → `nodes.fields.number` (int)
- `loops.title` → `nodes.title` (формат: "Петля {number}" если title пуст)
- `loops.status` → `nodes.fields.status`
- `loops.notes` → `nodes.content` (markdown, не fields!)
- `loops.started_at`, `ended_at` → опускаем (не использовались)

**sessions → nodes (type=session)**:
- `sessions.session_number` → `nodes.fields.session_number` (int)
- `sessions.title` → `nodes.title` (формат: "Сессия {number}" если title пуст)
- `sessions.loop_number` → `nodes.fields.loop_number` (int, для запросов)
- `sessions.recap` → `nodes.fields.recap`
- `sessions.dm_notes` → `nodes.fields.dm_notes`
- `sessions.played_at` → `nodes.fields.played_at`
- `sessions.game_date` → `nodes.fields.game_date`

**Связи**: Для каждой сессии с loop_number → ребро `contains` от ноды петли к ноде сессии.

### Search Vector (обновлённый триггер)

```sql
-- Индексирует title + content + ВСЕ текстовые значения из fields
CREATE OR REPLACE FUNCTION update_node_search_vector()
RETURNS trigger AS $$
DECLARE
  fields_text text := '';
  val text;
BEGIN
  -- Concatenate all text values from fields JSONB
  FOR val IN SELECT jsonb_each_text.value FROM jsonb_each_text(COALESCE(NEW.fields, '{}'::jsonb))
  LOOP
    fields_text := fields_text || ' ' || val;
  END LOOP;

  NEW.search_vector := to_tsvector('russian',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.content, '') || ' ' ||
    fields_text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Source Structure

```
supabase/migrations/
└── 012_loops_sessions_as_nodes.sql   # Миграция: типы, данные, рёбра, удаление таблиц

lib/
└── loops.ts                          # UPDATE: запросы из nodes вместо loops/sessions

components/
├── loop-form.tsx                     # UPDATE: пишет в nodes.fields
├── session-form.tsx                  # UPDATE: пишет в nodes.fields
└── node-detail.tsx                   # БЕЗ ИЗМЕНЕНИЙ (уже универсальный)

app/c/[slug]/
├── loops/page.tsx                    # UPDATE: запрос из nodes
├── loops/new/page.tsx                # UPDATE: insert в nodes
├── loops/[id]/edit/page.tsx          # UPDATE: update в nodes
├── sessions/page.tsx                 # UPDATE: запрос из nodes
├── sessions/new/page.tsx             # UPDATE: insert в nodes
├── sessions/[id]/page.tsx            # UPDATE: запрос из nodes

app/api/chronicles/
└── route.ts                          # UPDATE: loop_number читается из nodes.fields
```

## Key Design Decisions

1. **notes → content, не fields**: Заметки петли — это markdown, логично
   хранить в `nodes.content` (уже есть редактор MarkdownContent).

2. **loop_number в fields сессии**: Хранить loop_number прямо в fields
   (а не только как ребро) для простоты запросов: `WHERE fields->>'loop_number' = '3'`.
   Ребро `contains` — для навигации и графа.

3. **title = displayable name**: `nodes.title` — "Петля 3" или "Петля пожара",
   а не просто число. Это делает петли и сессии читаемыми в каталоге.

4. **Одна миграция**: Всё в одном SQL-файле — создание типов, INSERT INTO nodes
   SELECT FROM loops/sessions, создание рёбер, DROP старых таблиц.
   Атомарная транзакция.

5. **chronicles.loop_number остаётся**: Не трогаем хроники в этой фиче.
   Они ссылаются на loop_number (int), который теперь в fields ноды.
   Запросы к хроникам работают через JOIN или фильтр.

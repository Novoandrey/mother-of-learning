# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Feature-specific items live in `.specify/specs/NNN-*/backlog.md`.

Updated: 2026-04-13

---

## Bugs

### ~~BUG-001~~ ✅ FIXED
New entity didn't appear in catalog without page reload.
Fixed: `router.refresh()` after `router.push()` in `create-node-form.tsx`.

---

## Features

### ~~FEAT-002~~ ✅ DONE
Incoming edge creation from target node card.
Done: direction toggle in `create-edge-form.tsx`, flips source/target on save.

### FEAT-001 [P3] Edge type constraints (allowed source/target types)
- **Feature**: 001-entity-graph
- `edge_types` gets `allowed_source_types` / `allowed_target_types` arrays
- CreateEdgeForm filters target nodes by constraint

### ~~FEAT-004~~ ✅ DONE
UI consistency: unified design tokens across all non-encounter components.
16 files, single token system: inputs, buttons, cards, headers, empty states, errors.

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships

### ~~FEAT-005~~ ✅ DONE
НПС/Монстры: max_hp + ссылка на статблок → авто-HP в энкаунтере.
Migration 013. creature → "Монстр". URL fields render as links in node-detail.
Statblock icon in participant-row and catalog-panel.

---

## Ideas

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.

### IDEA-002 Git-style constitution versioning
- **Feature**: dx

### ~~IDEA-003~~ ✅ DONE Каталог-дерево в сайдбаре (Chronicler-style)
- Левый сайдбар: типы → ноды → вложенность через `contains`

### IDEA-004 Per-file .md documentation with cross-references
- **Feature**: dx
- Status: on hold

### IDEA-005 Responsive mobile layout
- **Feature**: ui
- 375px viewport support for encounter tracker (horizontal scroll on table)
- Mobile-friendly catalog navigation

### ~~IDEA-006~~ ✅ DONE Карточка персонажа с Markdown-контентом
- Миграция 011: колонка `content` в nodes
- MarkdownContent компонент: view/edit с превью
- react-markdown + remark-gfm + @tailwindcss/typography

### ~~IDEA-007~~ ✅ DONE Летопись персонажа
- Chronicles компонент: CRUD записей с привязкой к петле и дате
- API routes: POST/PUT/DELETE /api/chronicles

### IDEA-008 Граф-визуализация / майндмапа сущностей
- **Feature**: 008-graph-view
- Интерактивная визуализация графа нод и рёбер
- Варианты: полный граф / вокруг одной ноды / по типу рёбер
- Исследовать: react-flow, cytoscape.js, d3-force, sigma.js
- Не делать раньше времени — сначала наполнить данными

### IDEA-009 Realtime-синхронизация энкаунтера (мультиплеер)
- **Feature**: encounter
- Несколько юзеров на странице энкаунтера → все видят изменения HP, инициативы, хода в реальном времени
- Supabase Realtime: подписка на `encounters` и `encounter_participants` через `.on('postgres_changes', ...)`
- Ключевые сценарии: ДМ меняет HP → игроки видят мгновенно; ДМ жмёт "Следующий ход" → у всех обновляется
- Конфликты: optimistic UI + realtime = нужна стратегия (last-write-wins достаточно для MVP)
- Конституция VI: мульти-ДМ и мультиплеер — первый шаг к realtime

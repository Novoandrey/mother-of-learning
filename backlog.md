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

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships

---

## Ideas

### IDEA-001 ~~Encounter templates~~ ✅ INFRASTRUCTURE EXISTS
- Infrastructure: migration 007, template-actions.ts, save-as-template-button.tsx
- UI не подключён — отложено

### IDEA-002 Git-style constitution versioning
- **Feature**: dx

### IDEA-003 Каталог-дерево в сайдбаре (Chronicler-style)
- **Feature**: 003-catalog-tree
- Левый сайдбар: верхний уровень = типы сущностей, внутри = ноды, вложенность через `contains`
- Master-detail layout: клик по ноде → детали справа

### IDEA-004 Per-file .md documentation with cross-references
- **Feature**: dx
- Status: on hold

### IDEA-005 Responsive mobile layout
- **Feature**: ui
- 375px viewport support for encounter tracker (horizontal scroll on table)
- Mobile-friendly catalog navigation

### IDEA-006 Граф-визуализация / майндмапа сущностей
- **Feature**: 006-graph-view
- Проблема: сущности живут в разных списках одновременно (НПС → группа → локация → петля), текущий сайдбар не отражает эту многомерность
- Нужна интерактивная визуализация графа нод и рёбер с разными режимами отображения: по типу связи, по петле, по локации, по группе
- Опасения: легко усложнить до непригодности — нужно изучить готовые решения перед реализацией
- **Исследовать**: Obsidian graph view, react-flow, cytoscape.js, d3-force, sigma.js — что уже есть и насколько встраиваемо
- **Варианты отображения**: полный граф кампании / граф одной петли / граф вокруг одной ноды (1–2 степени связи) / только определённый тип рёбер
- **Фильтры**: по типу ноды, по типу ребра, по тегу, по петле
- **Не делать раньше времени** — сначала убедиться что данных достаточно и структура графа устоялась

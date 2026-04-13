# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Feature-specific items live in `.specify/specs/NNN-*/backlog.md`.

Updated: 2026-04-13

---

## Bugs

### ~~BUG-001~~ ✅ FIXED
New entity didn't appear in catalog without page reload.

---

## Features

### ~~FEAT-002~~ ✅ DONE
Incoming edge creation from target node card.

### FEAT-001 [P3] Edge type constraints (allowed source/target types)
- **Feature**: 001-entity-graph
- `edge_types` gets `allowed_source_types` / `allowed_target_types` arrays
- CreateEdgeForm filters target nodes by constraint

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships

---

## Ideas

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.
- Протестировано вручную.

### IDEA-002 Git-style constitution versioning
- **Feature**: dx
- "Original → fork → new original" pattern for constitution

### IDEA-003 Каталог-дерево в сайдбаре (Chronicler-style)
- **Feature**: 003-catalog-tree
- Левый сайдбар: верхний уровень = типы сущностей, внутри = ноды, вложенность через `contains`
- Master-detail layout: клик по ноде → детали справа
- Референс: Chronicler (worldanvil), Obsidian

### IDEA-004 Per-file .md documentation with cross-references
- **Feature**: dx
- Status: on hold

### IDEA-005 Responsive mobile layout
- **Feature**: ui
- 375px viewport support for encounter tracker (horizontal scroll on table)
- Mobile-friendly catalog navigation

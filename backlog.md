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

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.
- Протестировано вручную.

### IDEA-002 Git-style constitution versioning
- **Feature**: dx
- "Original → fork → new original" pattern for constitution

### IDEA-003 Каталог-дерево в сайдбаре (Chronicler-style) 🔜 NEXT
- **Feature**: 004-catalog-tree
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

### IDEA-006 Карточка персонажа с Markdown-контентом
- **Feature**: 005-character-card
- Поле `content` (markdown) на карточке ноды: полноценный редактор + рендеринг
- Поддержка статов, таблиц, изображений по ссылке
- Заготовка под чарлисты для PC и NPC
- Заглушка уже есть в node-detail.tsx (раздел «Контент»)

### IDEA-007 Летопись персонажа
- **Feature**: 005-character-card (вместе с IDEA-006)
- Раздел «Летопись» на карточке персонажа
- Таблица `chronicles`: заголовок, markdown-текст, номер петли, внутриигровая дата
- Фанфики, рассказы, заметки ДМа привязанные к персонажу и моменту времени
- Миграция 008 уже применена, заглушка в node-detail.tsx готова

### IDEA-008 Петли — таймлайн и события
- **Feature**: 006-loops
- Страница `/loops`: список петель (текущая + прошедшие)
- Таймлайн по дням внутри петли, события, накопленная информация
- Что помнят путешественники между петлями (персистентное состояние)
- Миграция 008 уже применена, роут `/loops` и навигация готовы (заглушка)

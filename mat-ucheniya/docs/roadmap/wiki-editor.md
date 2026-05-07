# [draft] Spec-021 — Wiki / Markdown editor

> Заглушка. Содержание будет наполняться постепенно.

Markdown-редактор как ядро для вики кампании, поверх sandbox-флоу spec-022. Получен дизайн-пак Claude Design (SPEC.md, HANDOFF.md, JSX frames, editor.css). Четыре ортогональных слоя: Storage (markdown в JSONB), wikilinks ([[link]] → node-link), inline-create (новая нода прямо из редактора по типу сущности), annotation triggers (`@`/`#`/`!`/`%`/`*` для разных типов). Отсутствует `colors_and_type.css` из дизайн-зипа — попросить.

## Что планируется в статье

- Storage: формат, миграции, конфликты
- Wikilinks: парсинг, рендеринг, создание-по-ссылке
- Inline-create: пер-тип дефолты, DM-approval для NPC
- Annotation triggers: ru-layout (№ ; ! % *) vs en-layout
- Layered visibility: integration со spec-022
- Дизайн-пак: что там лежит и как использовать
- Реюз компонентов: TTRPG-wiki как LegendKeeper

# [draft] Spec-022 — Visibility / sandbox / approval

> Заглушка. Содержание будет наполняться постепенно.

Three-state видимость нод: `private` (только автор), `party_draft` (видят member'ы кампании, кроме owner+dm), `published` (все). Переписка RLS под три состояния. Approval queue (паттерн из spec-014, но для нод): owner+dm одобряет draft → published. Sandbox-страница для DM — отдельный view черновиков (своих + чужих, если DM). Этот фундамент необходим для wiki-редактора (spec-021).

## Что планируется в статье

- Enum visibility (private / party_draft / published)
- RLS rewrite: чтение и запись по visibility + role
- Approval queue для нод (паттерн spec-014 переиспользуется)
- Sandbox-страница: layout, фильтры, переходы
- Кто может публиковать party_draft (owner+dm)
- Удаление чужих private-нод (запрет / разрешение / штраф)
- Migration: существующие ноды → published

# Процесс разработки

> Как устроена работа над «Матерью Учения»: spec-kit как основной workflow,
> версионирование, git-флоу с PR-only `main`, память между сессиями в нескольких
> файлах. Раздел нужен новому соавтору — человеку или AI-ассистенту — чтобы быстро
> влиться и не сломать ничего в прод-окружении.

---

## Карта процесса

Четыре инструмента держат всё вместе:

| Инструмент | Что | Где |
|---|---|---|
| **Spec-kit** | workflow «от идеи до кода» — пять фаз, артефакты, фазовые ворота | `.specify/specs/NNN-*/` |
| **Версионирование** | полу-семвер `a.b.c`, `CHANGELOG.md`, `NEXT.md`, `package.json` | корень репо |
| **Git-флоу** | feature-ветки → PR → `main`; `staging`-ветка для ручной проверки | `mat-ucheniya/AGENTS.md` |
| **Chatlog / память** | `NEXT.md` (состояние), `chatlog/` (сессии), `.specify/memory/` (долгосрочная) | корень репо |

Детали каждого — в отдельной статье:

- [`spec-kit.md`](spec-kit.md) — Specify → Clarify → Plan → Tasks → Implement
- [`versioning.md`](versioning.md) — схема версий, что пишем в CHANGELOG
- [`git-and-staging.md`](git-and-staging.md) — ветки, PR, staging, деплой
- [`chatlog-and-memory.md`](chatlog-and-memory.md) — NEXT.md, chatlog/, `.specify/memory/`

---

## Quick start для нового соавтора

Первые пять минут в проекте:

1. **Клонируй репо** через HTTPS с личным GitHub PAT (fine-grained, `Contents = Read and write`, `Pull requests = Read and write`). PAT кладётся в настройки Claude-проекта, не в файлы.
2. **Прочти** `meta/claude-project-instructions.md` — там boot-протокол, языки кода и чата, режим работы.
3. **Запусти** `bash scripts/dev/status.sh` — версия, дедлайны, таблица всех спек. Если есть ❌ — правь до фичерной работы.
4. **Прочти** `NEXT.md` (≤150 строк) — что в работе прямо сейчас.
5. Работаешь по спеке? Открой её `tasks.md`, возьми первый незакрытый `[ ]`.

Правила: код (`mat-ucheniya/**`, кроме `*.md`) — только через PR в `main`; мета-файлы (`.specify/`, `chatlog/`, `meta/`, `infra/`, `scripts/dev/`, `*.md`) — прямо в `main`. Никогда не мержи ветку `staging` в `main`.

---

## Quick start для нового чата с Claude

Протокол каждого нового чата — в `meta/claude-project-instructions.md`. Коротко:

1. Клонируй репо.
2. `bash scripts/dev/status.sh`.
3. Прочти `NEXT.md`.
4. Если работаешь по спеке — прочти `tasks.md`; `plan.md` только если что-то неясно.

По умолчанию **не читай** `backlog.md`, `chatlog/` и `_archive/` — это дорого и не нужно для большинства задач. Открывай их намеренно, с причиной.

Конец сессии: `bash scripts/dev/close-session.sh <slug>` → заполни chatlog-файл → обнови `NEXT.md` (только состояние) → обнови `backlog.md` → `git commit && push`.

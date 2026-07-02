# Roadmap

> Куда движется проект. Три горизонта, путь элемента от идеи до прода
> и связь с детальными спеками в `.specify/`. Если хотите понять,
> что строится прямо сейчас — [`near-term.md`](near-term.md); если
> что и почему отложено — [`postponed.md`](postponed.md).

---

## Три горизонта

| Горизонт | Файл | Суть |
|---|---|---|
| **Ближайшие приоритеты** | [`near-term.md`](near-term.md) | Активная работа + очередь до 030 + роадмап 030+ |
| **Эпик RPG-движок** | [`engine-pivot.md`](engine-pivot.md) | Серия спек 045–051 + spec-022: персонаж как пирамида модулей |
| **Отложенное** | [`postponed.md`](postponed.md) | Идеи и фичи без слота в текущей очереди |

Плюс к этому — [`in-progress.md`](in-progress.md): начатое, но не
финализированное (spec в Specify/Clarify, технические хвосты).

---

## Путь элемента

```
Идея (backlog.md IDEA-NNN)
  → Принятие в очередь (запись в NEXT.md, номер спеки)
  → Specify (spec.md — границы, сценарии, FR)
  → Clarify (вопросы и ответы, spec.md зафиксирован)
  → Plan (plan.md — таски, миграции, компоненты)
  → Tasks (tasks.md — чекбоксы)
  → In progress (ветка, PR)
  → In prod (NEXT.md «В проде», CHANGELOG.md)
```

Детали процесса — [`process/spec-kit.md`](../process/spec-kit.md).
Детальные спеки живут в `.specify/specs/NNN-*/` после Specify-фазы.

---

## Текущая очередь (краткий снимок)

На момент написания активная работа — **spec-052 Inventory** (код готов,
T001–T029; ждёт T030–T032: staging + миграции + E2E, затем PR) и **эпик
«RPG-движок»** (spec-045 Engine Core — Specify draft, spec-022 ждёт 045).

Полная таблица роадмапа 030+ — в [`near-term.md`](near-term.md).

---

## Связанные разделы

- [`engine-pivot.md`](engine-pivot.md) — детальная карта эпика движка
  и мотивация пивота.
- [`content-packs.md`](content-packs.md) — долгосрочная цель:
  D&D как портабельный контент-пак.
- [`tick-time-model.md`](tick-time-model.md) — модель тиков (целевая
  замена `(loop_number, day_in_loop)`).
- [`generic-events-table.md`](generic-events-table.md) — универсальный
  лог событий вместо `transactions`.
- [`visibility-and-sandbox.md`](visibility-and-sandbox.md) — трёхуровневая
  видимость нод: фундамент вики и sandbox DM.
- [`wiki-editor.md`](wiki-editor.md) — Markdown-редактор поверх
  visibility-слоя.
- [`live-broadcast.md`](live-broadcast.md) — spectator и realtime лог.
- [`player-mobile.md`](player-mobile.md) — мобильный режим игрока
  (Telegram Mini App + будущий лист персонажа v3).
- [`west-marches.md`](west-marches.md) — требования формата и что
  нужно для полноценного multi-DM.
- [`audit-log-and-safety.md`](audit-log-and-safety.md) — soft delete
  и DM audit log.

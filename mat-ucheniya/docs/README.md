# Документация «Мать Учения»

> Карта проекта: концептуальные принципы, описание фич, архитектура,
> процесс разработки и планы. Документация живёт в репозитории как набор
> `.md`-файлов в `mat-ucheniya/docs/` и рендерится на `/docs`
> (`lib/docs.ts` → `react-markdown`). В будущем (spec-021, вики-редактор)
> станет графом нод+рёбер с редактированием прямо в приложении —
> см. [`roadmap/wiki-editor.md`](roadmap/wiki-editor.md).

**Mother of Learning / «Мать Учения»** — open-source веб-приложение для
ведения сложных ролевых кампаний формата **west marches**: общий мир,
несколько DM, десятки игроков, петля времени и асинхронное игровое
время. С чего проект начинается и куда движется — в
[`concepts/north-star.md`](concepts/north-star.md).

---

## Карта разделов

Разделы идут от «почему» к «что» и к «как» — это и есть рекомендованный
порядок погружения.

| Раздел | О чём | Точка входа |
|---|---|---|
| [`concepts/`](concepts/README.md) | Философия и ключевые архитектурные идеи — почему сделано именно так | [`north-star.md`](concepts/north-star.md) |
| [`features/`](features/README.md) | Реальные фичи в проде: что делают и как устроены | [`features/README.md`](features/README.md) |
| [`architecture/`](architecture/README.md) | Кросс-cutting тех-темы: стек, кэш, формы, тесты, дизайн-токены | [`architecture/README.md`](architecture/README.md) |
| [`process/`](process/README.md) | Как мы строим проект: spec-kit, git-флоу, версии, память между сессиями | [`process/README.md`](process/README.md) |
| [`roadmap/`](roadmap/README.md) | Куда движемся: ближайшие приоритеты, engine pivot, отложенное | [`roadmap/README.md`](roadmap/README.md) |

Каждая статья самодостаточна; перекрёстные ссылки ведут вглубь. Если
встретили незнакомый термин — загляните в **глоссарий
«HANDOFF ↔ код в проде»** внизу [`concepts/README.md`](concepts/README.md).

---

## Пути чтения по аудитории

**Игрок.** Начните с [`north-star.md`](concepts/north-star.md), чтобы
понять формат кампании, затем — фичи, которыми пользуетесь:
[петли и сессии](features/loops-and-sessions/README.md),
[бухгалтерия](features/accounting/README.md),
[инвентарь](features/inventory-and-items/README.md),
[общак и складчина](features/stash-and-skladchina/README.md). Что уже
доступно с телефона — [`roadmap/player-mobile.md`](roadmap/player-mobile.md).

**DM.** [`north-star.md`](concepts/north-star.md) →
концепты [`dm-as-demiurge.md`](concepts/dm-as-demiurge.md) и
[`two-modes.md`](concepts/two-modes.md) → фичи
[каталог](features/catalog/README.md),
[энкаунтеры](features/encounters/README.md),
[летопись](features/chronicles/README.md),
[стартовый сетап петли](features/accounting/starter-setup.md) →
[`roadmap/`](roadmap/README.md), чтобы понять, что впереди.

**Разработчик.** [`process/spec-kit.md`](process/spec-kit.md) и
[`process/git-and-staging.md`](process/git-and-staging.md) → раздел
[`architecture/`](architecture/README.md) (стек, тесты, кэш, токены) →
[`concepts/node-graph.md`](concepts/node-graph.md) как основа схемы →
`technical.md` внутри интересующих фич.

**Соавтор / AI-ассистент.** [`process/README.md`](process/README.md)
(quick start для нового чата) → корневой `NEXT.md` (текущее состояние) →
глоссарий в [`concepts/README.md`](concepts/README.md) → `spec.md`
активной спеки в `.specify/specs/`.

---

## Как обновлять документацию

Документация — часть репозитория, правится как код: ветка → правка
`.md` → **Pull Request в `main`** (см.
[`process/git-and-staging.md`](process/git-and-staging.md)). H1-заголовок
файла становится названием в сайдбаре `/docs`; первый абзац-блокквот —
рамкой статьи. Порядок разделов задан в `lib/docs.ts`
(`concepts` → `features` → `architecture` → `process` → `roadmap`),
внутри папки `README.md` идёт первым, остальное — по алфавиту.

Граница разделов: **концепт** — переносимая идея (не завязана на
конкретные таблицы); **feature** — реальная фича с кодом; **architecture** —
сквозная техника; **roadmap** — то, чего ещё нет. Подробный критерий —
в конце [`concepts/README.md`](concepts/README.md).

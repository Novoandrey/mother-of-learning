# Chat 82 — публичный `/docs` раздел + интеграция HANDOFF, 2026-05-07

## Контекст (откуда пришли)

После chat 81 (IDEA-063 «Сиория», IDEA-064 тасктрекер закреплён за
spec-022) пользователь сказал, что текущий `/c/[slug]/tasks` (kanban
прототип под spec-022) ему не нужен и его можно дропнуть. Вместо
тасктрекера он хочет публичный раздел документации — easy-to-read
markdown-страницы для нетехнарей про дизайн и работу приложения,
рядом — техническая документация на программистском уровне, плюс
отдельные статьи про spec-kit, версии, дизайн-пилларз. Структура
файлов как git-tree (вложенность, дерево слева).

В процессе обсуждения попросил поискать best practices организации
документации — Diátaxis (Procida) подтвердил feature-based + четыре
типа документов; используется в Stripe, Canonical, Django. Адаптировал:
top-level разделы concepts/features/architecture/process/roadmap;
внутри фичи `README.md` (explanation + how-to) + `technical.md`
(reference + deep explanation), без жёсткой пары — сложные фичи
получают подфайлы.

После одобрения структуры пользователь прислал MOTHER-OF-LEARNING-HANDOFF
(self-contained vision document). Документ существенно переопределяет
проект: west marches с 30+ игроками и multi-DM, tick-based время с
per-actor clock'ом, persistence_scope для loop reset, hex+point
locations с traversal_ticks, designed+procedural encounters, modifier
stack для action costs, weather/calendar resolvers, NPC movement
plans, visibility per event, audit log, content-packs (D&D отделён
от движка). Реальный разрыв с продом: сейчас (loop_number, day_in_loop)
целые числа, локации — обычные ноды, события только money/items,
D&D-специфика встроена.

Договорились: HANDOFF — long-term north star, не binding на текущий
прод. concepts/ получает принципы, roadmap/ — pivot-список с грубой
группировкой, features/ описывает прод as-is. Терминология (вариант c):
текущая в текстах, glossary в `concepts/README.md`. HANDOFF распылён
по multiple concepts (вариант a) + sводный `north-star.md`.

## Что сделано

- **Удалён** `app/c/[slug]/tasks/` — 6 файлов (board.tsx, board.css,
  drawers.tsx, page.tsx, pieces.tsx, types-and-data.ts), ~750 строк
  kanban-прототипа из Claude Design package.
- **Удалён tab «📌 Задачи»** из `components/nav-tabs.tsx`.
- **Добавлен link «📖 Документация»** в campaign top bar (рядом с
  «+ Создать»).
- **Создан раздел `/docs`** как top-level public route:
  - `lib/docs.ts` — filesystem reader: `getDocsTree()` + `readDoc(slug)`,
    title-extraction из первого `# `, sort: known FOLDER_ORDER
    (concepts/features/architecture/process/roadmap), README.md как
    folder-index.
  - `app/docs/layout.tsx` — top bar (📖 Документация / К кампаниям /
    UserMenu) + tree-sidebar (w-64) + main content (max-w-3xl).
  - `app/docs/[[...slug]]/page.tsx` — catch-all server component:
    `readDoc(slug)` → `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
    + breadcrumbs + prose-стили из `@tailwindcss/typography`. На
    not-found → `notFound()`.
  - `components/docs-tree-nav.tsx` — client component с usePathname
    highlight; всегда expanded; folder-rows с indexHref, file-rows
    с slug-href.
- **Создано 63 stub-файла** под `mat-ucheniya/docs/`. Все: H1 + «> Заглушка»
  + один абзац-описание + список «Что планируется в статье». Категории:
  - **concepts/** (14): README, pillars, north-star, tool-first,
    time-as-resource, world-as-observation-log, dm-as-demiurge,
    two-modes, roles-and-clients, node-graph, event-sourcing,
    persistence-scope, visibility, engine-vs-content, loop-as-core.
  - **features/** (18): README + catalog + loops-and-sessions +
    encounters {README, technical} + accounting {README, starter-setup,
    approval-queue, technical} + inventory-and-items {README, pricing,
    technical} + stash-and-skladchina + chronicles + electives +
    monsters + auth-and-membership {README, technical}.
  - **architecture/** (6): README, stack, sidebar-cache, form-drafts,
    testing, style-tokens.
  - **process/** (5): README, spec-kit, versioning, git-and-staging
    (TBD), chatlog-and-memory.
  - **roadmap/** (17): README, near-term, in-progress, postponed,
    engine-pivot, tick-time-model, generic-events-table,
    locations-hex-and-point, time-and-modifiers,
    npc-movement-and-encounters, audit-log-and-safety, content-packs,
    west-marches, live-broadcast, wiki-editor, visibility-and-sandbox,
    quests, player-mobile.
- Spec-022 «Тасктрекер» отменён в `NEXT.md`. Slot 022 свободен.
- Версия `0.8.0 → 0.9.0`.

## Миграции

Нет.

## Тесты

Не запускал локально (npm install падает в sandbox с ENOTEMPTY,
известная проблема). Vercel build = authoritative type-check;
`tsc --noEmit` без node_modules даёт baseline-ошибки про missing
`react`/`fs`/`path` (по всему проекту), новые файлы дают ровно тот
же класс ошибок плюс пара logical (одна — `doc is possibly null`
после `notFound()`, исправлено через `doc!`). Логических багов не
ожидается; ReactMarkdown в server component должен работать (10+
поддерживает RSC), но Vercel-сборка скажет.

## Коммиты

Будет один: чат 82 — `/docs` + HANDOFF integration.

## Что важно для следующего чата

- **/docs готовы как stub-каркас.** Следующий ход — наполнять
  содержимым. Логично начать с `concepts/north-star.md` (распилить
  HANDOFF) и с `concepts/README.md` (glossary HANDOFF↔текущий код).
- **Spec-020 PC Holdings Overview** — следующий по очереди (план
  готов с chat 77).
- **Pivot к движку** не означает «бросаем D&D-MVP сейчас». Pivot —
  series of deliberate spec'ов в `roadmap/engine-pivot.md`,
  параллельно с обычной разработкой.
- **scripts-tmp/generate_docs_stubs.py** оставлен в репо как
  one-shot — после первого реального contentful-файла можно
  удалить (или оставить как историческую утилиту).

## Action items для пользователя

- Проверить deploy на Vercel — рендер `/docs`, навигация по дереву,
  активная подсветка, переходы. Особенно посмотреть `/docs/concepts/north-star`,
  `/docs/roadmap/engine-pivot`, `/docs/features/accounting/approval-queue`.
- Если `colors_and_type.css` из дизайн-пака Claude Design всё ещё
  не пришёл — это упоминалось как блокер для spec-021.
- Решить, какие файлы наполнять в первую очередь. Я бы начал с
  концептов из HANDOFF (5 новых) и near-term/engine-pivot — они
  сразу полезны и для следующего чата с Claude.

# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-24 (chat 36 — spec-010 specify/clarify/plan/tasks)

## В проде сейчас

- **spec-001 Каталог сущностей**: граф нод+рёбер, поиск, фильтры, создание
- **spec-002/005 Трекер энкаунтера v3**: инициатива, HP, условия, эффекты, лог
- **spec-003 Петли и сессии как ноды**: миграции `008a`-`012`
- **spec-006 Auth + роли**: миграции `024`, `027`-`028`, `031`
- **spec-009 Loop progress bar + session packs**: миграции `032`-`033`.
  `participated_in` edge_type, `day_from/day_to` на сессии,
  `length_days` на петле. `ParticipantsPicker` в форме,
  fluid-grid progress bar со stacked lanes + tooltip/sheet,
  frontier marker для current-петли, PC frontier card на
  странице персонажа. Единый view сессии — `/catalog/[id]`
  редиректит на `/sessions/[id]`.
- **Статблоки монстров** (без папки спеки): миграции `013`-`014`, `018`-`020`, `023`
- **Excel-like grid энкаунтера**: рестайл на design tokens, AC+death saves, PillEditor
- **Markdown + Летопись**: миграции `011`, `015`-`017`
- **Факультативы**: миграция `029`
- **PC roster v2**: миграция `030`
- **Shared world editing + perf**: миграция `031`, React `cache()`, `Promise.all`
- **TECH-003**: убрано 21 `any` из join-ответов, утилита `lib/supabase/joins.ts`
- **Ultrareview-полишинг (chat 28)**: BUG-014, TECH-001 (branding env),
  TECH-002 (react-hooks lint), TECH-004 (cached sidebar), UX-001 (toast),
  UX-002 (pending indicators) — всё в проде
- **BUG-015 (chat 29)**: после удаления ноды редирект через `router.back()`
  с fallback на каталог (раньше всегда летел в `/catalog`)
- **TECH-005 (chat 29)**: `middleware.ts` → `proxy.ts` (Next 16 file
  convention), deprecation warning убран
- **DEBT-003 (chat 30)**: SRD seed вынесен из миграций в
  `lib/seeds/dnd5e-srd.ts` + server action
  `initializeCampaignFromTemplate` + CLI `npm run seed-srd`.
  Open source unblocker — новые кампании больше не получают
  пустой `condition` тип.
- **BUG-016 + TECH-006 (chat 31)**: аудит инвалидаций кэша
  сайдбара. Зафикшены 2 миссинга: `createCustomType` (создание
  кастомного типа ноды) и `initializeCampaignFromTemplate`
  (создание кампании). Правило задокументировано в `AGENTS.md`.
  Остальные ~10 мутаций проверены — либо уже зовут invalidate,
  либо не аффектят сайдбар.
- **TECH-007 (chat 32)**: invalidate-from-CLI. Новый POST endpoint
  `/api/admin/invalidate-sidebar` (auth: `Bearer SUPABASE_SERVICE_ROLE_KEY`)
  + хелпер `scripts/lib/invalidate-sidebar-remote.ts` проведён в
  `seed-srd`, `dedupe-srd`, `import-electives`. Non-fatal: сайдбар
  всё равно self-heal через 60с TTL. Прод-env: `APP_URL=...vercel.app`.

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `033_session_form_cleanup.sql`

## Следующий приоритет

**spec-010 Transactions ledger — Implement.** Spec, plan, tasks
**готовы и закоммичены** (`.specify/specs/010-transactions-ledger/`).
Следующий чат начинает `implement` по `tasks.md`: одна задача за
раз, `[x]` + confirm между задачами (hard rule).

Ключевое из плана:
- **"Бухгалтерия" как top-level app** под `/c/[slug]/accounting/*`
  (ledger + `settings/categories` + будущие под-роуты
  spec-011..015). Nav-линк добавляется в `layout.tsx`.
- Одна таблица **`categories` с `scope text`** (default
  `'transaction'`, CHECK IN ('transaction','item')) —
  spec-015 добавит `scope='item'` без schema change.
- **День — primary temporal anchor** (не сессия); auto-fill
  из `getCharacterFrontier` (spec-009). "Off-session" — default,
  не режим.
- Денойминации через const map `DENOMINATIONS + GP_WEIGHT` —
  добавить homebrew-валюту = 1 entry + 1 колонка.
- Mobile-first для игрока, desktop-primary для ДМ — **same
  components, Tailwind media queries**, никаких `useIsMobile()`
  хуков.

MVP shippable после phase 9 (T001–T027 — US1/US2/US3/US4). P2
фазы (transfer/item/DM-settings) можно в том же PR или отдельно.
Новый dev-dep: `vitest` (T003).

### Параллельные кандидаты (если бухгалтерия пауза)

- **IDEA-037** [P2] — факультативы → бонусы к статам PC
- **IDEA-041** [P2] — система фидбека внутри приложения (кнопка + лента)
- **Spec-007 этап 4 stage 4** — трекер трат на ход (action/bonus/movement)
- **Encounter race conditions** [P3] — поведение при одновременных
  правках двух DM в encounter grid (last-write-wins сейчас, нужно
  зафиксировать или сделать optimistic concurrency).
- **Мобилка игрока** (Spec-007 этап 5) — большая фича, ждёт решения

## Отложенные фичи

1. Трансформация факультативов в бонусы к статам PC
2. **Мобилка игрока** — режим игрока (читалка, mobile-first). Будущая спека.
3. **Трекер трат на ход в энкаунтере** — action/bonus/reaction счётчики.
4. **Общая панель реакций/легендарок** — агрегат реакций всех живых участников.
5. **PillEditor v2** — rename pill, выбор цвета.
6. IDEA-029 Spells + slots (ждёт auth, большая фича)
7. Импорт из Google Sheets (таблицы персонажей)
8. Лог вне боя (IDEA-026 инкремент 4)

## Стек и окружение

- Next.js 16 (App Router) + Supabase + Tailwind v4
- Рабочая директория в репо: `mat-ucheniya/`
- Тестовая кампания: slug `mat-ucheniya`
- Ключевые зависимости: `lucide-react`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`

## Файлы памяти

- `.specify/memory/constitution.md` — конституция v3.0.0 (действующая)
- `.specify/memory/encounter-tracker-v1-retrospective.md` — ретро v1 трекера
- `.specify/memory/character-sheet-excel-system.md` — система листа персонажа
- `.specify/memory/bookkeeping-roadmap.md` — roadmap для спецификаций 009-015
  (Бухгалтерия: петля/транзакции/общак/лут)
- `.specify/memory/assets/character-sheet-examples.xlsx` — Excel с примерами листов (для будущей фичи)
- `mat-ucheniya/STYLE.md` — design tokens (source of truth для UI)
- `mat-ucheniya/AGENTS.md` — предупреждение про Next.js 16
- `mat-ucheniya/scripts/README.md` — парсер SRD

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать.
- СДВГ: одна задача за раз, выбирай лучший вариант сам.
- Файлы миграций: отдавать пользователю через `present_files`.
- Правило переноса: сначала перенеси как есть, потом улучшай.
- Хардкод-аудит: при новом компоненте проверять на строковые константы
  под конкретную кампанию; выносить в функции с TODO-ссылкой на backlog.

## В конце сессии

1. Создать `chatlog/YYYY-MM-DD-chatNN-короткое-название.md` по шаблону из `chatlog/README.md`.
2. Обновить `NEXT.md`: секции «В проде» и «Следующий приоритет».
3. Обновить `backlog.md` если появились новые баги/идеи.
4. Закоммитить и запушить.

# Backlog — archive

Сделанные тикеты (✅/~~/DONE/FIXED) и полностью устаревшие секции чат-археологии. Живое — в `backlog.md`.

Split: split_backlog.py run on 2026-04-24.

---

## Часть A — секции из закрытых чатов

## Новое (chat 25) — Spec-008 Факультативы ✅
Страница `/c/[slug]/electives` + CSV-импортёр + bulk-seed игроков.
См. NEXT.md секцию chat 25 для деталей.

### IDEA-037 [P2] Факультативы → бонусы к статам PC
- **Feature**: 008-electives (следующий этап)
- После заливки данных — трансформировать факультативы в мутации карточки PC:
  проверки (Навык «История»), черты (War Caster, Healer), способности
  («модификация Silent Image»), владения.
- Модель: поле `elective.effects jsonb` с массивом эффектов типа
  `{type:'skill_prof', skill:'history'}`, `{type:'feat', name:'War Caster'}`,
  `{type:'custom', text:'...'}`. Карточка PC агрегирует все has_elective
  → суммирует эффекты → показывает в секции «Бонусы от факультативов».
- Сначала ручное заполнение effects на каждой elective-ноде, потом
  авто-применение к PC (без ручного копирования статов).

### IDEA-038 [P3] Множественный выбор PC за раз на факультативе
- **Feature**: 008-electives
- Сейчас в таблице факультативов dropdown «+ добавить» открывает список
  PC и принимает клик по одному. Было бы удобнее чекбоксы + «Применить».
- Особенно актуально для факультативов типа «Метамагическая модификация»,
  где 8 PC разом.

### IDEA-039 [P3] История изменений факультативов
- **Feature**: 008-electives
- «Кто когда взял/снял какой факультатив». События через существующий
  event-sourcing (миграция 017) или отдельная `elective_events`.
- Для петли времени это критично в перспективе: «в петле 3 Янка взяла
  риторику, в петле 4 — нет».

### IDEA-040 [P2] node_types.slug фильтр в правой панели статблока
- **Feature**: 007-statblocks
- Сейчас при открытии статблока с правой панели он ищет все ноды
  в кампании. Логично фильтровать по type_slug='creature'|'npc'|'character'.
- Замечено при работе с факультативами: elective-ноды тоже попадают
  в пикер (неприятно).

### IDEA-041 [P2] Система фидбека внутри приложения
- **Feature**: ux / коммуникация в команде
- На каждом экране — большая кнопка «Фидбек» (FAB снизу-справа или
  в шапке). Клик → форма (textarea + опционально категория). Юзер
  пишет что не так / что хочется → отправляется.
- Каждая запись хранит `user_id`, `page_url`, `body`, `created_at`,
  опционально `category` ('bug' | 'idea' | 'other').
- В блоке с табами справа (сейчас табы есть только в энкаунтере —
  при реализации решить: глобальный rail или per-page; скорее
  глобальный slide-out со значком «фидбек»). Все участники кампании
  видят ленту: «кто что когда написал». Лайки/обсуждение — позже,
  для MVP просто список.
- Зачем: тестим всей группой, проще ловить баги/идеи прямо в момент
  использования, чем потом писать в чат. Также — исторический след
  как продукт развивался.
- Модель: миграция `032_feedback.sql` — таблица `feedback`
  (id, campaign_id, user_id, page_url, body, category, created_at),
  RLS — все участники кампании читают, любой авторизованный пишет.
- ~0.5–1 день: миграция + FAB + dialog + лента.

---

---

## Новое (chat 24)
### IDEA-034 [P2] Visibility='dm_only' для секретных нод
- **Feature**: 006-auth-and-roles (расширение после закрытия spec-006)
- Колонка `nodes.visibility enum('public','dm_only') DEFAULT 'public'`.
- RLS: `nodes_select` добавляет условие `visibility='public' OR
  is_dm_or_owner(campaign_id)`.
- UI: на карточке ноды чекбокс «Скрыть от игроков» (только для ДМа).
- Когда: когда появятся сюрпризные статблоки, закрытые NPC, планы
  следующей петли — т.е. появится что скрывать.

### IDEA-036 [P3] Единый canEdit для loops/sessions edit-страниц
- **Feature**: dx
- Сейчас `/loops/[id]/edit` и аналоги не обёрнуты в `canEdit`-паттерн.
  Игрок получит ошибку от RLS при попытке сохранить, но UI это не
  прячет. Привести к тому же паттерну что и `catalog/[id]/edit`.
- Низкий приоритет: loops/sessions редко правятся, а RLS защищает.

---

---

## Старое (chat 22 и ранее)
Updated-before: 2026-04-19 (chat 22)

---

---

## Новое (chat 22)
### Инкремент 2 spec-006 готов: /members для owner
- **Feature**: 006-auth-and-roles
- Страница `/c/[slug]/members` доступна только owner'у.
- Create/reset-password/remove через Server Actions за `requireOwner` гейтом.
- Создание ДМа ставит `must_change_password=true` → юзер сменит пароль при
  первом входе (работает единая онбординг-воронка из инкремента 1).
- `updateMemberRoleAction` написан, но UI не подключён — ждёт инкремента 3
  (превращение dm↔player).

### IDEA-035 [P3] Owner transfer
- **Feature**: 006-auth-and-roles
- Сейчас unique-индекс в БД гарантирует exactly-one-owner. Чтобы передать
  владение, нужна атомарная операция: старый owner → dm, новый dm → owner.
- Делать **не** через updateMemberRoleAction (она запрещает `role='owner'`
  осознанно), а через отдельную `transferOwnershipAction` с транзакцией.
- Когда: после инкремента 4. Реальная потребность — когда у пользователя
  появится вторая кампания, где он не владелец.

---

---

## Старое (chat 20 и ранее)
Updated-before: 2026-04-19 (chat 20)

---

---

## Новое (chat 20)
### Stage 3 готов: PillEditor
- **Feature**: 002-encounter-tracker / spec-007 stage 3
- `components/encounter/pill-editor.tsx` — ClickUp-style контекст-попап.
- Клик по пилюле больше не удаляет, а открывает меню с метой
  («с раунда N») и кнопкой «Убрать».
- API расширяемый: `actions: PillAction[]` — stage 5 может накинуть
  «Переименовать», «Сменить цвет» без ломания контракта.
- Осталось в этапе 4: stage 4 (трекер трат action/bonus/movement),
  stage 5 (rename/color в PillEditor).

### IDEA-034 [P3] Расширение PillEditor: rename, color, round override
- **Feature**: 002-encounter-tracker / spec-007 stage 5
- Фундамент в `pill-editor.tsx` готов — принимает массив actions
  с полем tone. Нужна реализация конкретных действий:
- **Rename**: инлайн-редактирование имени условия на одной пилюле.
  Решить: переименовываем только локально на этом participant или
  глобально в suggestions (тогда у всех)? Скорее всего — локально,
  с опциональным чекбоксом «применить ко всем».
- **Color**: требует `fields.color` на condition-нодах каталога.
  Сейчас все пилюли серые. Добавить 6-8 цветов из палитры токенов
  (amber/red/blue/green/purple…) как пресет.
- **Round override**: ручная правка `round` (если ДМ накладывал
  условие задним числом или забыл вовремя убрать).
- **Когда делать**: после stage 4 (трекер трат) и перед общей
  панелью реакций. Реальная потребность появится когда ДМ начнёт
  ловить «мне нужно быстро вернуть это условие на раунд раньше»
  или «у меня 3 разных Отравлен, хочу их визуально отличать».

---

---

## Новое (chat 19)
### Stage 2 готов: AC + death saves + # column + role dot возле имени
- **Feature**: 002-encounter-tracker / spec-007 stage 2
- Миграция 023 добавила `encounter_participants.ac int` + `death_saves jsonb`.
- Новые колонки в гриде; role dot переехал к имени; `#` теперь номер строки
  с индикатором bulk-select.
- Осталось в этапе 4: PillEditor (stage 3) и трекер трат action/bonus/movement (stage 4).

---

---

## Новое (chat 13)
### ~~BUG-013~~ ✅ FIXED SRD-монстры добавлялись с HP=0
- **Feature**: 002-encounter-tracker
- Fixed: `max_hp ?? hp` fallback в add-participant-row, encounter-catalog-panel, parseStatblock.
- Причина: SRD seed (миграция 019) пишет HP в `fields.hp`, homebrew — в `fields.max_hp`. Код читал только max_hp.

### IDEA-033 [P2] Homebrew / canon статус на карточках
- **Feature**: catalog / statblock
- Визуально отличать SRD-монстров от homebrew. Тэги `srd`/`canon` уже есть в seed.
- В хедере статблока и в карточке каталога — маленький бэйдж "SRD" (серый) или "Homebrew" (синий).
- Фильтр в каталоге: "только homebrew", "только SRD".
- Позже: система "оверрайдов" (IDEA-024) — взять SRD-ноду как основу, сделать копию с префиксом "Homebrew: ...".

---

---

## Roadmap энкаунтера (legacy — работа без папки спеки)
Работа шла под названием «Spec-007», но папка `.specify/specs/007-*/`
так и не создалась. Сделанное уже в проде, отложенное — получает
отдельную нормальную спеку при старте.

Цель была: убрать когнитивную нагрузку ДМа — все доступные действия
видны без переключения вкладок. Правая панель с actions/bonus/reactions/legendary
+ общий блок реакций и легендарок. Mobile-first для игрока.

**Сделано и в проде:**
- Этап 1 (фундамент статблоков) — миграции `018`+`019`, парсер SRD, 10 монстров.
- Этап 2 (правая панель) — actions как кнопки, мульти-таргет пикер, счётчики.
- Этап 4 stage 1-3 (Excel-like grid) — рестайл на токены, AC+death saves, PillEditor.

**Отложено (каждое — своя спека при старте):**
- Этап 3 (общая панель реакций/легендарок) — агрегат реакций всех живых.
- Этап 4 stage 4 (трекер трат на ход) — action/bonus/reaction счётчики.
- Этап 4 stage 5 (PillEditor v2) — rename pill, выбор цвета.
- Этап 5 (мобилка игрока) — режим игрока, после полного auth.

Паттерн Prototype: participant = deep clone базовой ноды монстра + оверрайды.
Предметы/эффекты добавляют записи в actions/passives с `source: item_id`.

---

---

## Часть B — сделанные тикеты из живых секций

### (из "🔜 NEXT — баги и мелочёвка (chat 29)")

### BUG-018 [P1] ✅ DONE — Энкаунтер-трекер: урон не применяется к HP в grid'е, но виден в пикере цели до reload
- **Открыто**: chat 44 (фидбек от игрока)
- **Сделано**: chat 45
- Репро был: игрок атакует скимитаром, наносит 20 урона. В общей
  табличке энкаунтера HP цели не меняется. При следующем ударе, когда
  открывается выбор цели — там уже отображается уменьшенное HP. F5
  сбрасывает всё.
- **Корень**:
  1. RLS на `encounter_participants` — modify только DM/owner (мигр. 024).
  2. Клиентский write через browser Supabase client в
     `encounter-page-client.tsx:handleActionResolved` молча падал для
     игрока (try/catch глотал в console.error).
  3. Локальный optimistic update применялся только к `participantsSnap`
     (который читает target picker), но НЕ к `participants` в
     `<EncounterGrid>` — это были два независимых стейта. Оттого и
     асимметрия «в пикере видно, в гриде нет».
- **Фикс** (4 файла):
  - `app/c/[slug]/encounters/[id]/page.tsx` — читает `getMembership`,
    считает `canEdit = role in ('owner','dm')`, прокидывает в клиент.
  - `components/encounter/encounter-page-client.tsx` — prop `canEdit`,
    ранний exit в `handleActionResolved` для игрока (один alert),
    write-first / state-after для DM, grid sync через новый ref-метод
    `setParticipantHp`.
  - `components/encounter/encounter-grid.tsx` — prop `canEdit`, метод
    `setParticipantHp` в `EncounterGridHandle`.
  - `hooks/use-participant-actions.ts` — `canEdit` в Options, все 18
    mutation-колбэков для игрока заменяются на noop с warn-once alert'ом.
- Ссылка: `commit <sha> — fix(encounter): gate writes on DM role, sync
  grid/snap — BUG-018`

### BUG-017 [P1] ✅ DONE — Скролл пикера участников обрезается, когда выбрано 6+
- **Открыто и сделано**: chat 35 (после мёрджа spec-009 review-polish)
- Весь блок с selected rows + хедерами «Выбрано» / «Остальные» был
  обёрнут в `sticky top-0 z-10 bg-white`. Когда высота блока
  становилась больше `sm:max-h-80` (320px) — при 6+ выбранных —
  sticky прилипал к верху скролл-контейнера и выталкивал unselected
  rows за пределы видимой области. Пользователь не мог прокрутить
  до них.
- **Фикс**: убран внешний sticky-обёртка. Структура плоская,
  selected rows и заголовки идут обычным потоком. Scroll теперь
  работает при любом количестве выбранных.
- Ссылка: `commit c6f52e… — fix(spec-009): picker scroll truncated beyond 6 selected`
  (см. `mat-ucheniya/components/participants-picker.tsx`)

### BUG-016 [P2] ✅ DONE — Каталог и сайдбар рассинхронизируются (stale cache)
- **Сделано**: chat 31
- Системный аудит: см. TECH-006 ниже. В рамках BUG-016 конкретно
  починен `createCustomType` (миссинг `invalidateSidebarAction`
  после инсерта в `node_types`).
- CLI-кейс (когда `seed-srd` показывает 34 в каталоге и 20 в сайдбаре)
  остался открытым — вынесен в TECH-007.

### TECH-006 [P2] ✅ DONE — Аудит инвалидаций кэша и stale-data
- **Сделано**: chat 31
- Прошёл systematic sweep по всем мутациям таргетных таблиц
  (nodes, node_types, node_pc_owners, chronicles, encounters,
  loops, sessions, edges).
- **Зафикшено** (2 миссинга):
  - `hooks/use-node-form.ts` `createCustomType` — добавлен
    `invalidateSidebarAction(campaignId)`.
  - `lib/campaign-actions.ts` `initializeCampaignFromTemplate` —
    добавлен `invalidateSidebar(campaignId)` после `seedCampaignSrd`.
- **Проверено OK** (не требует фиксов):
  - `api/nodes/[id]` DELETE — уже зовёт invalidate.
  - `api/nodes/[id]` PATCH/content — обновляет поля вне сайдбара.
  - `api/chronicles/*` — catalog/loops `force-dynamic`, UI оптимистичный.
  - `members/actions.ts` PC owners — сайдбар не фильтрует по owner-ам.
  - `electives/actions.ts`, `use-node-form.ts` handleSubmit/handleDelete
    — уже зовут invalidate.
  - `lib/encounter-actions.ts`, `use-encounter-turns.ts`,
    `encounter-grid.tsx`, `encounter-page-client.tsx` — encounters
    + encounter_participants не в сайдбаре.
  - `create-edge-form.tsx` — edges не в сайдбаре, `router.refresh()` ok.
- **Документация**: правило добавлено в `AGENTS.md` (sidebar cache
  invalidation by call site).
- **Не покрыто** (отдельные задачи):
  - CLI-скрипты — TECH-007 ниже.
  - Race conditions в encounter grid — нужен план (optimistic
    concurrency vs version column vs realtime). Заводится отдельно
    при появлении реальных жалоб.

### TECH-007 [P3] ✅ DONE — invalidate-from-CLI
- **Сделано**: chat 32
- **Контекст**: BUG-016 нашёл, что после `npm run seed-srd` каталог
  показывает 34, а сайдбар 20 до 60с TTL. Скрипты вне Next runtime,
  `revalidateTag` недоступен.
- **Решение**: defensive infra (вариант A из backlog).
  - `POST /api/admin/invalidate-sidebar?campaign=<slug-или-uuid>` —
    auth `Bearer SUPABASE_SERVICE_ROLE_KEY` (constant-time compare),
    резолвит slug в id, дёргает `invalidateSidebar(campaignId)`.
  - `scripts/lib/invalidate-sidebar-remote.ts` — fetch-хелпер,
    читает `APP_URL` (default `localhost:3000`) + service-role key.
    Non-fatal: при ошибке логирует warning, скрипт всё равно success.
  - Проводка: `seed-srd.ts`, `dedupe-srd.ts`, `import-electives.ts`.
  - `AGENTS.md` — секция про CLI обновлена.
- **Прод-настройка**: для запуска CLI против прода надо выставить
  `APP_URL=https://mother-of-learning.vercel.app`.
- **Замечание**: в момент работы триггер не сработал (BUG-016 уже
  закрыт, сайдбар корректен). Сделано как defensive infra по
  явному решению — при появлении массового workflow всё готово.


- **Сделано**: chat 29
- При удалении рекапа из его детальной страницы (куда пришёл с петли)
  пользователь оказывался в /catalog, а не возвращался на родительскую
  петлю. Плюс задержка перехода создавала впечатление что кнопка
  «Удаляю…» зависла.
- Фикс: `node-detail.tsx` `handleDelete` теперь делает `router.back()`
  если в истории есть откуда вернуться, иначе fallback на `/catalog`.

### BUG-014 [P1] ✅ DONE — `roundRef.current = turns.round` в render body
- **Сделано**: chat 28 (commit `330a290`)
- Удалена строка из `encounter-grid.tsx`, ref синхронизируется
  через `onRoundChange` callback в `useEncounterTurns`.

### TECH-001 [P2] ✅ DONE — Хардкод "Мать Учения" → env var
- **Сделано**: chat 28 (commit `496fcd9`)
- `lib/branding.ts` создан, `APP_NAME = process.env.NEXT_PUBLIC_APP_NAME
  || 'Мать Учения'`. `app/layout.tsx` и `app/login/page.tsx` используют его.

### TECH-002 [P2] ✅ DONE — 7 мест `react-hooks/set-state-in-effect`
- **Сделано**: chat 28 (commit `330a290`)
- `tag-cell`, `add-participant-row`, `action-resolve-dialog`,
  `electives-client`, `members-client` — везде паттерн заменён
  на реакцию в хендлере вместо `useEffect`.

### TECH-003 [P2] ✅ DONE — `any` в Supabase join ответах
- **Сделано**: chat 28
- Создана утилита `lib/supabase/joins.ts` с `Joined<T>`, `unwrapOne<T>`,
  `unwrapMany<T>`.
- Убрано 21 `any` из 9 файлов: `members/actions.ts` (×6),
  `encounters/page.tsx` (×2), `encounters/[id]/page.tsx` (×4),
  `loops/page.tsx`, `catalog/page.tsx`, `app/page.tsx`,
  `lib/loops.ts` (×2), `hooks/use-node-form.ts` (×2),
  `hooks/use-participant-actions.ts`.
- `tsc --noEmit` + `next build` проходят чисто.

### UX-001 [P2] ✅ DONE — Toast-менеджер вместо alert()
- **Сделано**: chat 28 (commit `496fcd9`)
- `components/toast-provider.tsx` + `useToast()` хук в `app/layout.tsx`.
  Используется в `node-detail.tsx`, `chronicles.tsx`, `create-edge-form.tsx`.

### UX-002 [P3] ✅ DONE — Индикаторы pending на inline-формах
- **Сделано**: chat 28 (commit `330a290` + другие)
- `electives-client.tsx` и `members-client.tsx` уже используют
  `useActionState` с `pending` → `disabled={pending}` на submit-кнопках.

### TECH-004 [P2] ✅ DONE — `unstable_cache` на sidebar query
- **Сделано**: chat 28 (commit `c12e248`)
- Layout sidebar query завёрнут в `unstable_cache`, плюс параллельные
  fetches через `Promise.all`.

### TECH-005 [P3] ✅ DONE — Middleware → Proxy (Next 16)
- **Сделано**: chat 29
- `mat-ucheniya/middleware.ts` → `proxy.ts`, функция `middleware` → `proxy`.
- Заодно `lib/supabase/middleware.ts` → `lib/supabase/proxy.ts`
  для консистентности (это просто имя файла, не file convention).
- Edge runtime в проекте не использовался → миграция тривиальна.
- Deprecation warning ушёл, проект готов к Next 17.

---

---

### (из "🔒 TECH DEBT от ultrareview — для отдельных фич, не в chat 28")

### DEBT-003 [P2] ✅ DONE (chat 30) — SRD seed привязан к `slug='mat-ucheniya'`
- **Feature**: universality (constitution X) — open source blocker
- Миграции 003 (conditions), 005 (effects), 022 (exhaustion levels)
  инсертили в `WHERE c.slug='mat-ucheniya'`. Новая кампания, созданная
  через UI, получила бы пустой тип `condition`, ноль conditions,
  ноль effects → трекер энкаунтера сломан из коробки.
- **Решение**: `lib/seeds/dnd5e-srd.ts` — единый источник правды,
  идемпотентный сидер. `lib/campaign-actions.ts` — server action
  `initializeCampaignFromTemplate`. CLI `npm run seed-srd -- --campaign <slug>`
  для бэкфилла. Без новой SQL-миграции — чистая TS-логика.
- **Осталось**: когда появится UI «Создать кампанию», сразу после
  INSERT в `campaigns` вызывать `initializeCampaignFromTemplate`.

---

### (из "Bugs")

### ~~BUG-001~~ ✅ FIXED
New entity didn't appear in catalog without page reload.
Fixed: `router.refresh()` after `router.push()` in `create-node-form.tsx`.

### ~~BUG-002~~ ✅ FIXED HP нельзя редактировать напрямую
- **Feature**: 002-encounter-tracker
- Fixed: currentHp теперь кликабельный — клик → inline input → Enter/blur → сохранение
- Найдено: 2026-04-15, исправлено: 2026-04-15

### ~~BUG-003~~ ✅ FIXED Клонирование участников — сбой нумерации
- **Feature**: 002-encounter-tracker
- Fixed: клон теперь ищет все существующие номера и берёт следующий свободный
- Найдено: 2026-04-15, исправлено: 2026-04-15

---

---

### (из "Features")

### ~~FEAT-002~~ ✅ DONE
Incoming edge creation from target node card.
Done: direction toggle in `create-edge-form.tsx`, flips source/target on save.

### ~~FEAT-004~~ ✅ DONE
UI consistency: unified design tokens across all non-encounter components.
16 files, single token system: inputs, buttons, cards, headers, empty states, errors.

### ~~FEAT-005~~ ✅ DONE
НПС/Монстры: max_hp + ссылка на статблок → авто-HP в энкаунтере.
Migration 013. creature → "Монстр". URL fields render as links in node-detail.
Statblock icon in participant-row and catalog-panel.

---

---

### (из "Ideas")

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.

### ~~IDEA-003~~ ✅ DONE → ПЕРЕОСМЫСЛЕНО
- Было: дерево в сайдбаре (Chronicler-style вложенность)
- Стало: плоский список + конфигурируемая группировка (принцип III-b)
- Вложенность через `contains` остаётся как связь, но НЕ как навигация
- Сайдбар = универсальный компонент с пропсами visibleTypes + columns + groupBy

### ~~IDEA-006~~ ✅ DONE Карточка персонажа с Markdown-контентом
- Миграция 011: колонка `content` в nodes
- MarkdownContent компонент: view/edit с превью
- react-markdown + remark-gfm + @tailwindcss/typography

### ~~IDEA-007~~ ✅ DONE Летопись персонажа
- Chronicles компонент: CRUD записей с привязкой к петле и дате
- API routes: POST/PUT/DELETE /api/chronicles

### ~~IDEA-010~~ ✅ DONE Энкаунтер-трекер: Excel-first редизайн
- v2: spec-005. v3: полная пересборка с нуля, −2361 строк мёртвого кода.

### ~~IDEA-019~~ ✅ DONE Массовое выделение строк в трекере
- **Feature**: 005-encounter-tracker-v2
- Click/Ctrl+Click/Shift+Click для выделения строк
- Редактирование HP/инициативы/роли/tempHP → применяется ко всем выделенным
- HP парсит raw input (−10 = дельта к каждому)
- Массовое удаление, toggle active
- Escape = снять выделение

### ~~IDEA-020~~ ✅ DONE Широкий интерфейс ДМа (full-width layout)
- max-w-5xl убран из layout, перенесён в отдельные страницы
- Энкаунтер занимает всю ширину экрана

### ~~IDEA-023~~ ✅ DONE Сайдбар-каталог для энкаунтера
- **Feature**: 005-encounter-tracker-v2 (расширение)
- EncounterCatalogPanel: группировка по типу, поиск, max_hp, статблок
- Один клик → добавить в энкаунтер
- Grid: forwardRef + useImperativeHandle для внешних вызовов
- Flex-layout: grid+log | catalog panel

---

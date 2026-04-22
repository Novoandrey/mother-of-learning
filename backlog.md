# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Single source of truth — все баги, фичи, идеи живут здесь.

Updated: 2026-04-22 (chat 29 — BUG-015 + backlog sync)

---

## 🔜 NEXT — баги и мелочёвка (chat 29)

Все 4 пункта из прошлого NEXT (BUG-014, TECH-001, UX-001, UX-002)
по факту уже сделаны в chat 28 — backlog отстал. Синхронизировано.

### BUG-015 [P2] ✅ DONE — после удаления ноды редирект всегда в /catalog
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

### TECH-005 [P3] Middleware → Proxy (Next 16 deprecation)
- **Feature**: dx
- Предупреждение `The "middleware" file convention is deprecated.
  Please use "proxy" instead.`
- Сейчас работает, но при апгрейде до Next 17 поломается. Переименовать
  `middleware.ts` → `proxy.ts`, обновить конфиг.

---

## 🔒 TECH DEBT от ultrareview — для отдельных фич, не в chat 28

### DEBT-001 [P3] Chronicles не мигрированы в ноды графа
- **Feature**: spec-003 (граф как единая модель)
- Отдельная таблица `chronicles` с собственными `loop_number`, `node_id`,
  API routes `/api/chronicles/*`. Нарушает constitution I + II.
- Правильно: `chronicle_entry` как node type, `chronicle→node` и
  `chronicle→loop` как edges. Убирает отдельные API routes, отдельный
  компонент, дублирующийся `loop_number`.
- Не срочно. Отдельная фича на 0.5–1 день.

### DEBT-002 [P3] `008a_party.sql` — мёртвая таблица
- **Feature**: dx (cleanup)
- Таблица `party` и `party_members` созданы в миграции 008a_party, но
  ни одного `from('party')` в коде нет. Либо удалить миграцией 032,
  либо в комментарии задокументировать «reserved for IDEA-X».

### DEBT-003 [P2] SRD seed привязан к `slug='mat-ucheniya'`
- **Feature**: universality (constitution X) — open source blocker
- Миграции 003 (conditions), 005 (effects), 022 (exhaustion levels)
  инсертят в `WHERE c.slug='mat-ucheniya'`. Новая кампания, созданная
  через UI, получит пустой тип `condition`, ноль conditions,
  ноль effects → трекер энкаунтера сломан из коробки.
- Правильный фикс: server action `initializeCampaignFromTemplate(id)` +
  `lib/seeds/dnd5e-srd.ts` — идемпотентно инсертит универсальные SRD
  данные. Вызывать при создании кампании.
- Блокирует open source релиз. Оценка — 1 день.

### DEBT-004 [P3] `to_tsvector('russian')` hardcoded
- **Feature**: i18n / universality
- Search trigger использует русский Snowball словарь. Англ/другие
  языки не получат stemming. Фикс: колонка `campaigns.language` +
  триггер читает её. Не срочно.

### DEBT-005 [P3] `loop` как node_type в каждой кампании
- **Feature**: universality
- Миграция 012 инсертит `loop` в каждую существующую кампанию. Новая
  кампания для обычной (без петли времени) игры получит лишний тип.
- Правильно: per-campaign feature flags (`campaign_features` table
  или `campaigns.features jsonb`).

### DEBT-006 [P3] `/api/chronicles`, `/api/nodes/*` — REST вместо actions
- **Feature**: dx (консистентность)
- Весь остальной проект — server actions. Только chronicles + nodes API
  остались на REST routes. Непоследовательно. При рефакторинге (например
  в DEBT-001) перенести на actions.

### DEBT-007 [P3] Zod схема для statblock
- **Feature**: dx (надёжность)
- `lib/statblock.ts` определяет тип Statblock (~40 полей в JSONB), но
  ни runtime validation, ни CHECK constraint. Один неверный write —
  и UI падает молча.
- Фикс: zod schema в `lib/statblock.ts`, использовать в
  `lib/encounter-actions.ts` на входе. 0.5 дня.

### DEBT-008 [P3] Глобальный error reporting
- **Feature**: dx / observability
- 18 мест с `console.error` в prod. Для open source нормально (юзер
  в консоль смотрит), но для серьёзного продакшна — надо Sentry или
  аналог. Обёртка `lib/log.ts` с `reportError()`.

### DEBT-009 [P3] `save-as-template-button.tsx` не подключён
- **Feature**: encounter templates (IDEA-001)
- Компонент + server action + миграция 007 существуют, но нигде не
  импортируется. Либо подключить в `encounter-grid.tsx` (IDEA-001
  как была помечена 🔜), либо удалить dead code.

---

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

## Старое (chat 22 и ранее)

Updated-before: 2026-04-19 (chat 22)

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

## Старое (chat 20 и ранее)

Updated-before: 2026-04-19 (chat 20)

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

## Новое (chat 19)

### Stage 2 готов: AC + death saves + # column + role dot возле имени
- **Feature**: 002-encounter-tracker / spec-007 stage 2
- Миграция 023 добавила `encounter_participants.ac int` + `death_saves jsonb`.
- Новые колонки в гриде; role dot переехал к имени; `#` теперь номер строки
  с индикатором bulk-select.
- Осталось в этапе 4: PillEditor (stage 3) и трекер трат action/bonus/movement (stage 4).

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

## Bugs

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

## Features

### ~~FEAT-002~~ ✅ DONE
Incoming edge creation from target node card.
Done: direction toggle in `create-edge-form.tsx`, flips source/target on save.

### FEAT-001 [P3] Edge type constraints (allowed source/target types)
- **Feature**: 001-entity-graph
- `edge_types` gets `allowed_source_types` / `allowed_target_types` arrays
- CreateEdgeForm filters target nodes by constraint

### ~~FEAT-004~~ ✅ DONE
UI consistency: unified design tokens across all non-encounter components.
16 files, single token system: inputs, buttons, cards, headers, empty states, errors.

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships

### ~~FEAT-005~~ ✅ DONE
НПС/Монстры: max_hp + ссылка на статблок → авто-HP в энкаунтере.
Migration 013. creature → "Монстр". URL fields render as links in node-detail.
Statblock icon in participant-row and catalog-panel.

---

## Ideas

### ~~IDEA-001~~ ✅ DONE Encounter templates (save → clone → modify)
- SaveAsTemplateButton в combat-tracker, список шаблонов на странице энкаунтеров.

### IDEA-002 Git-style constitution versioning
- **Feature**: dx

### ~~IDEA-003~~ ✅ DONE → ПЕРЕОСМЫСЛЕНО
- Было: дерево в сайдбаре (Chronicler-style вложенность)
- Стало: плоский список + конфигурируемая группировка (принцип III-b)
- Вложенность через `contains` остаётся как связь, но НЕ как навигация
- Сайдбар = универсальный компонент с пропсами visibleTypes + columns + groupBy

### IDEA-004 Per-file .md documentation with cross-references
- **Feature**: dx
- Status: on hold

### IDEA-005 Responsive mobile layout
- **Feature**: ui
- 375px viewport support for encounter tracker (horizontal scroll on table)
- Mobile-friendly catalog navigation

### ~~IDEA-006~~ ✅ DONE Карточка персонажа с Markdown-контентом
- Миграция 011: колонка `content` в nodes
- MarkdownContent компонент: view/edit с превью
- react-markdown + remark-gfm + @tailwindcss/typography

### ~~IDEA-007~~ ✅ DONE Летопись персонажа
- Chronicles компонент: CRUD записей с привязкой к петле и дате
- API routes: POST/PUT/DELETE /api/chronicles

### IDEA-008 Граф-визуализация / майндмапа сущностей
- **Feature**: 008-graph-view
- Интерактивная визуализация графа нод и рёбер
- Варианты: полный граф / вокруг одной ноды / по типу рёбер
- Исследовать: react-flow, cytoscape.js, d3-force, sigma.js
- Не делать раньше времени — сначала наполнить данными

### IDEA-009 Realtime-синхронизация энкаунтера (мультиплеер)
- **Feature**: encounter
- Несколько юзеров на странице энкаунтера → все видят изменения HP, инициативы, хода в реальном времени
- Supabase Realtime: подписка на `encounters` и `encounter_participants` через `.on('postgres_changes', ...)`
- Ключевые сценарии: ДМ меняет HP → игроки видят мгновенно; ДМ жмёт "Следующий ход" → у всех обновляется
- Конфликты: optimistic UI + realtime = нужна стратегия (last-write-wins достаточно для MVP)
- Конституция VI: мульти-ДМ и мультиплеер — первый шаг к realtime

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

### IDEA-011 [P1] Temporal State Viewer — персонажи во времени и пространстве
- **Feature**: 005-temporal-viewer (новый спек)
- Экран: внизу — слайдер времени (петля → день → час, не дробнее)
- Вверху — карта локаций (прямоугольники) с токенами игроков внутри
- Скроллинг слайдера → видно как персонажи перемещаются между локациями
- Клик на персонажа → его стейт в этот момент времени (статы, инвентарь, HP)
- Ключевое: есть фронтир "сейчас" — дальше мотать нельзя
- "Сейчас" продвигается во время игр или между сессиями
- Это визуализация принципа I конституции v3 (петля как ядро)
- Требует: модель состояний персонажей привязанных к (петля, день, час)
- Найдено: обсуждение 2026-04-15

### IDEA-012 Конституция кампании (world rules as data)
- **Feature**: 006-campaign-constitution
- Человекочитаемый документ с правилами мира: сеттинг, тон, homebrew, домашние механики
- Примеры: "высокомагический мир", "power fantasy", "крит = макс кубик + бросок"
- Два уровня: для ДМа (полный) и для игроков (упрощённый, без спойлеров)
- Хранится как нода типа `campaign-doc` или как поля кампании
- Машиночитаемый формат → можно выгрузить как LLM-контекст
- Связь: IDEA-013 (AI-генерация использует это как system prompt)

### IDEA-013 LLM-контекст и AI-генерация
- **Feature**: 007-ai-generation
- Выгрузка контекста кампании для LLM: конституция мира + граф сущностей + текущий момент
- Юзкейсы: сгенерировать НПС, энкаунтер, лут, диалог — всё в стиле кампании
- "На основе старых" = RAG по существующим нодам
- Требует: IDEA-012 (конституция кампании), наполненный граф
- Долгосрочная цель: приложение не только записывает, но и генерирует

### IDEA-014 Авто-бой и авто-лут (тривиальные энкаунтеры)
- **Feature**: 002-encounter-tracker (расширение)
- ДМ помечает пройденный энкаунтер как "тривиальный"
- При похожем энкаунтере в будущем → предложение авто-резолва
- Рогалик-механика: прогрессия = старые проблемы автоматизируются
- Требует: шаблоны энкаунтеров (IDEA-001 ✅), difficulty rating

### IDEA-015 Модель "Игрок заявляет → ДМ подтверждает" + ЛОГ ДЕЙСТВИЙ
- **Feature**: 002-encounter-tracker (переосмысление)
- **UI**: Excel-таблица сверху (состояние) + ЛОГ ДЕЙСТВИЙ снизу (хронология) — центр экрана
- Энкаунтер как поток событий: игрок отправляет заявку (абилка + цель), ДМ подтверждает/отклоняет/модифицирует
- Лог фиксирует только подтверждённые действия: "Маркус → Удар → Лиловый червь → ✓ 14 урона"
- Игроки готовят действия между ходами: открывают телефон, выбирают абилку, выбирают цель
- ДМ видит очередь заявок, одним тапом подтверждает или отклоняет
- Любое решение можно откатить (undo)
- Импровизация: игрок может написать произвольный текст, ДМ дописывает результат
- Связь: event sourcing (конституция v3 принцип V), IDEA-009 (realtime), IDEA-014 (авто-бой)
- Требует: realtime, роли (ДМ/игрок), модель событий
- **MVP лога**: простой текстовый лог на странице энкаунтера (ДМ пишет вручную), без модели событий

### IDEA-016 Авто-рекапы из событий боя
- **Feature**: 002-encounter-tracker + 007-ai-generation
- Если бой ведётся через события → механический лог пишется автоматически
- "Раунд 1: Дрипли атаковал Тролля-2, попал, 14 урона. Тролль-2 убит."
- LLM превращает механический лог в нарративный рекап
- История боёв хранится, доступна для просмотра
- Облегчает вкат новых игроков: можно прочитать что было
- Требует: IDEA-015 (модель событий), IDEA-013 (LLM-контекст)

### IDEA-017 Конструктор персонажа слоями (progression builder)
- **Feature**: 004-character-sheet
- Персонаж = базовая нода + стек эффектов (раса, класс, предметы, баффы, уровни)
- Каждый эффект = событие, итоговый стейт = replay всех эффектов
- Режим "создаём персонажа": пошагово накидываем слои, видим результат
- Не нужно заполнять огромную таблицу — конструктор ведёт за руку
- Снижает порог входа: 30 человек в чате, 15 играет, 15 смотрит — сложно изучать рулбуки
- Связь: event sourcing (принцип V), лист персонажа (приоритет №3)

### IDEA-018 Гайд по кампейну (onboarding pack)
- **Feature**: 006-campaign-constitution (расширение)
- Набор markdown-нод типа `campaign-doc`: суть игры, правила, рекап мира, пересказ книги, ссылки
- "Почему во главу угла ставится веселье и истории" — философия кампейна
- Краткий рекап: что произошло, где мы сейчас
- Версия для ДМа (полная) и для игрока (без спойлеров)
- Решает реальную проблему: людям интересно, но сложно вкатиться
- Связь: IDEA-012 (конституция кампании)

### IDEA-021 [P4] Cell-as-tile: ECS для UI-ячеек (SS13-подход)
- **Feature**: ui-architecture
- Каждая ячейка грида = атомарный "тайл" с набором свойств (тип данных, рендерер, валидация, хоткеи, состояние выделения)
- По сути ECS (Entity Component System) на уровне UI
- Аналогия: SS13 tile system, AG Grid cell renderer, Google Sheets cell
- Сейчас 3 типа ячеек (EditableCell, HpCell, TagCell) — мало данных для абстракции
- **Триггер**: когда типов ячеек будет 8+ и паттерн копипасты начнёт бесить
- **Не делать раньше**: нужен опыт из лога действий, листа персонажа, character builder
- Связь: IDEA-019 (горячие клавиши), IDEA-020 (full-width layout)

### IDEA-022 [P3] Генеалогическое древо персонажей (app-визуализация)
- **Feature**: graph-apps
- Визуализация семейных и родственных связей между персонажами
- По сути — один из "аппов" поверх графа: фильтр по рёбрам типа `parent_of`, `sibling`, `married_to` → визуальное дерево
- Идея от игрока (Катя?): хочет строить родословные персонажей
- Реализация: плоские ноды + рёбра родства → рендер как дерево (d3-hierarchy / react-flow)
- Не требует вложенности в данных — структура дерева = результат запроса по рёбрам
- Хороший тест принципа III-b: плоские данные → визуализация как иерархия
- Новые edge_types: `parent_of`, `sibling`, `married_to`, `adopted_by`
- Связь: IDEA-008 (граф-визуализация), принцип III-b (плоская навигация)

### ~~IDEA-023~~ ✅ DONE Сайдбар-каталог для энкаунтера
- **Feature**: 005-encounter-tracker-v2 (расширение)
- EncounterCatalogPanel: группировка по типу, поиск, max_hp, статблок
- Один клик → добавить в энкаунтер
- Grid: forwardRef + useImperativeHandle для внешних вызовов
- Flex-layout: grid+log | catalog panel

### IDEA-024 [P2] Сеттинг как пакет: канон + кампейн-оверрайды
- **Feature**: campaign-settings / distributable-worlds
- Два слоя данных: **сеттинг** (канон из книги/системы) и **кампейн** (что родилось в игре)
- Тег `canon` на нодах + раздел "Канон" в markdown-контенте (MVP)
- Полная версия: сеттинг = базовый пакет нод (НПС, локации, события, сюжет, связи)
- Кампейн = форк сеттинга с оверрайдами: каноничные ноды наследуются, кастомные добавляются
- Карточка НПС: секция "Канон" (из книги, read-only) + секция "Кампейн" (ваша версия, editable)
- Конечная цель: собрать "Mother of Learning" как готовый кампейн-сеттинг под ключ
  → новый ДМ скачивает → добавляет своих PC → играет
- Это и продукт (готовые сеттинги), и killer feature (community-driven пакеты миров)
- Связь: принцип IX (универсальность), IDEA-012 (конституция кампании), IDEA-018 (onboarding pack)
- Новые edge_types для канона: `canon_version_of` (кампейн-нода → канон-нода)

### IDEA-025 [P2] Статистика петли: "что изменилось"
- **Feature**: temporal / loop-analytics
- Экран сравнения двух петель: что изменилось в мире, у персонажей, в связях
- "Петля 3 vs Петля 4, день 15" → diff по нодам, рёбрам, событиям
- Связь: принцип I (петля как ядро), принцип V (event sourcing)
- **Тайминг**: разработка ≈ через месяц, когда доиграем текущую петлю — будут реальные данные для сравнения
- Требует: наполненные данные по минимум 2 петлям

### IDEA-026 [P1] Единый лог событий — дорожная карта инкрементов
- **Feature**: event-log / core-architecture
- Каждое действие (бой, социалка, исследование) = запись в логе
- Стейт = replay всех подтверждённых событий (принцип V конституции)
- Нет разницы бой/социалка — в бою есть раунды, в социалке нет

**Инкременты (каждый — самостоятельная ценность):**

1. ✅ **Текстовый лог** — уже есть (encounter_log, миграция 015). ДМ пишет вручную.

2. ✅ **Временная привязка событий** — условия/эффекты записываются с координатой `{round}`.
   Миграция 016: text[] → jsonb. TagCell показывает номер раунда. Автолог при добавлении/снятии.

3. ✅ **Структурированные события** — таблица `encounter_events` с jsonb result.
   Типы: hp_damage/heal, condition/effect add/remove, round/turn_start, custom.
   Merged timeline рендерит события + текст ДМа вместе. Миграция 017.

4. **Лог вне боя** — те же события, но без раунда: социалка, исследование,
   торговля. Энкаунтер = любая сцена, не обязательно бой.
   Поле `encounter.mode`: `combat` (инициатива, раунды) / `scene` (свободный порядок).

5. **Игрок → ДМ поток** (IDEA-015) — игрок отправляет заявку (абилка + цель),
   ДМ подтверждает/отклоняет/модифицирует. Требует: realtime (IDEA-009), роли.
   Каждое подтверждённое действие = запись в лог.

6. **Авто-рекапы** (IDEA-016) — механический лог → LLM → нарративный рекап.
   Требует: инкремент 3 (структурированные события), IDEA-013 (LLM-контекст).

- Связь: принцип V (event sourcing), IDEA-009 (realtime), IDEA-015, IDEA-016
- Каждый инкремент самостоятелен: можно остановиться на любом и иметь пользу

### IDEA-027 [P3] Гендер и свойства сущностей → склонение в логе
- **Feature**: data-model / encounter-log
- Гендер (м/ж/ср) = поле в fields ноды → используется для склонения глаголов в авто-логе
- "Аранеа потеряла 17 хп" vs "Дрипли потерял 17 хп"
- Общая мысль: каждая сущность = своя мини-таблица свойств (как тайлы в SS13)
- Свойства типизированы, рендерятся на карточке, влияют на поведение (лог, формы, фильтры)
- Связь: IDEA-021 (cell-as-tile ECS), принцип I (атомарность данных)

### IDEA-028 [P2] Клонирование ноды как homebrew-вариант
- **Feature**: 001-entity-graph
- Кнопка «Создать копию» на карточке ноды → форма создания pre-filled
  всеми fields исходной ноды, title = "Копия {original}". Сохранить →
  новая нода с теми же type_id и tags, independent от оригинала.
- Опционально: ребро `variant_of` (parent → child) между оригиналом
  и копией, чтобы видеть генеалогию.
- Use case:
  - SRD-монстр → homebrew-версия (Goblin → Goblin Shaman со spellcasting)
  - Магические предметы с upgrade-путями (+1 / +2 / +3 версии)
  - NPC-симулякры и двойники
  - НЕ для истории PC — у PC это линейное развитие одной ноды, не вариант
- Отличие от spec-007 Prototype: тот клон живёт в participant энкаунтера,
  этот — в каталоге как самостоятельная нода.
- **Когда делать**: после spec-007 этап 4 (Excel-like grid), перед логинами.
  Причины:
  1. К этому моменту SRD-монстры активно используются на сессиях — давление
     на homebrew-варианты максимально, фича будет закрывать реальную боль.
  2. Модель данных после всех этапов трекера стабилизируется — клонирование
     нужно продумывать с учётом: что делать с рёбрами (located_in, owns),
     с тегами (`srd`/`canon` копировать или нет), с содержимым поля `source_doc`.
  3. Этап 2 трекера (participant = deep clone ноды) даст опыт клонирования —
     перенос паттерна в каталог станет естественным рефакторингом, а не
     новой конструкцией с нуля.
  4. Не конфликтует с RLS/ролями (они появляются на логинах) — копия
     наследует campaign_id от оригинала, разрешения применяются автоматически.

### IDEA-029 [P2] Заклинания как структурированный JSON + расходники
- **Feature**: spells (spec TBD, после 007)
- Заклинания сейчас живут как текст в action.desc. Нужна отдельная структура:
  - `{ name, level, school, casting_time, range, components: {v,s,m,material?}, duration, desc, at_higher_levels? }`
  - Slots trackery: `spell_slots: {1: {max, used}, 2: {max, used}, ...}` на participant или node
  - Material components как расходники (e.g. "diamond worth 300gp" для Revivify)
  - Concentration — один эффект на существо, автоматически снимается при касте нового concentration-заклинания
- Магические предметы на НПС: свой slot пула (charges), свой список spells
- Интеграция со StatblockPanel — отдельная секция "Заклинания" с уровнями и слотами
- Парсинг из SRD open5e (spells API) — аналог parse_srd.py
- **Когда делать**: после логинов + мобилки. Боль высокая у кастеров, но
  не блокирует основной флоу боя. Требует UI для каста (выбор уровня слота,
  затраты материала).

### IDEA-030 [P3] Базовые реакции для существ (Attack of Opportunity)
- **Feature**: 007 (или постскриптум)
- По D&D 5e почти у каждого существа есть Opportunity Attack — если
  противник уходит из досягаемости без Disengage, можно атаковать.
  Сейчас это надо вручную добавлять в каждый statblock.
- Идея: в parse_srd.py / в seed-миграции добавить default reaction
  "Attack of Opportunity" всем существам с melee-атакой, если её нет
  явно в reactions.
- Альтернатива: хранить "default_reactions" в node_type.default_fields
  и мёрджить на рендере, чтобы не плодить данные.
- Расширяется: у драконов — Wing Flank, у спелкастеров — Counterspell,
  и т.д. Но это уже per-creature, в seed.

### IDEA-031 [P3] Фиты (feats) у НПС и монстров
- **Feature**: 007
- Сейчас fields поддерживают actions / passives / legendary / reactions,
  но не `feats`. Фиты (Great Weapon Master, Sentinel, Lucky, Spell Sniper…)
  — отдельная категория с собственным эффектом на игру.
- Shape: `feats: [{ name, desc, source?, tags?: ['combat'|'utility'] }]`
- В StatblockPanel — отдельная секция "Фиты" (между Passives и Legendary).
- Большинство фитов = passive modifiers, но некоторые дают новые actions
  (Polearm Master bonus attack). Такие — дублировать в bonus_actions,
  либо ссылкой `source: 'feat:polearm-master'`.
- SRD фиты доступны в open5e — расширить parse_srd.py.

### IDEA-032 [P2] Схлопывание группы одинаковых существ (20 гоблинов)
- **Feature**: 007 (вероятно этап 4 или 6)
- Боль: 20 кобольдов с одной инициативой забивают грид и выматывают ДМ.
- Идея: если в бою N участников с одним `node_id` и одной `initiative`
  (и одинаковой ролью/активностью) — схлопывать их в один ряд "Кобольд ×20".
- Раскрытие: клик по ряду → показать отдельные строки (как сейчас).
- Агрегатное состояние:
  - Суммарное HP: `Σ current_hp / Σ max_hp` (например `112 / 140`)
  - Счётчик живых: `осталось 13 из 20`
- ДМ записывает урон суммой: "−35 урона" → система применяет к группе:
  - умирает N существ с наименьшим HP сначала, остаток идёт в одно раненное
  - альтернатива: ДМ выбирает, кого именно «добить» (для правила Cleave)
- Условия/эффекты: применяются либо ко всей группе, либо к выбранным
  (нужен пикер при добавлении условия на группу).
- Реализация: вероятно отдельная таблица `encounter_group` или флаг
  `group_key` на participant, но данные остаются атомарными (каждое
  существо — отдельный participant), просто представление агрегировано.
- **Связано с IDEA-027** (совместный ход в инициативе) и IDEA-028
  (клонирование ноды).

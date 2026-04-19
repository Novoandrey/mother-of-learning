# NEXT — контекст для следующего чата

> Этот файл обновляется в конце каждого чата. Всегда актуален.
> Last updated: 2026-04-19 (chat 24 — spec-006 инкремент 4: RLS для игроков)

## Что сделано (накопительно)

- **Spec-001**: Каталог сущностей (граф нод + рёбер, поиск, фильтры, создание).
- **Spec-002**: Трекер энкаунтера v1 (инициатива, HP, условия, эффекты).
- **Петли, сессии, Markdown, Летопись**: миграции 008-012. Loops/sessions как ноды графа.
- **FEAT-005 + seed монстров**: миграции 013-014. max_hp + statblock_url у npc/creature, 38 монстров кампании.
- **UX каталога** (2026-04-14): свои типы, дерево вложенности, поиск как центр.
- **Конституция v3** (2026-04-15): разделение Продукт/Процесс, два режима (игрок/ДМ), event sourcing как принцип V.
- **Spec-005 Трекер v3** (Excel-first редизайн): −2361 строк мёртвого кода.
- **IDEA-026 инкр. 1-3**: текстовый лог → временная привязка → структурированные события (миграции 015-017).
- **IDEA-023 + UniversalSidebar**: один сайдбар слева, контекстно-настраиваемый.
- **Рефакторинг** (chat 8): encounter-grid (745→365), create-node-form (657→220) разложены на хуки.
- **Spec-007 этап 1** (chat 9): фундамент статблоков — миграция 018 (структура полей + GIN-индекс), миграция 019 (10 SRD монстров).

## Что сделано в этом чате (chat 10, 2026-04-19)

### Spec-007 этап 2: дизайн-хэндофф + фундамент правой панели ✅

Получил handoff bundle из Claude Design (https://api.anthropic.com/v1/design/h/fjesA-PjsI7fRXFnxNcpJg), разобрал транскрипт, реализовал согласно финальным решениям пользователя (Clean theme, Manrope+JetBrains Mono, inline-редактирование, KO-selectable в пикере, ClickUp-style PillEditor на будущее).

- **Миграция 020**: `used_reactions int`, `legendary_used int` в `encounter_participants` (NOT NULL DEFAULT 0).
- **Design tokens в globals.css**: полная палитра (neutral/blue/red/amber/green/orange/purple), радиусы, тени, motion с `prefers-reduced-motion`.
- **Шрифты**: Manrope Variable (UI) + JetBrains Mono Variable (числа) через `@fontsource-variable/*`.
- **Lucide-react** добавлен — иконки Swords, Target, Shield, Eye, Zap, Crown, Sparkles, ChevronDown, Minus, Plus, X, BookOpen.
- **`lib/statblock.ts`**: типы (Statblock, StatblockAction, Passive, AbilityScores, Senses, Speed), защитный парсер `parseStatblock(title, fields)`, `abilityMod`, `formatMod`, `isDeadConditionName`, `hasDeadCondition`.
- **7 компонентов** в `components/encounter/statblock/`:
  - `hp-bar.tsx` — bar с цветовыми порогами + temp HP overlay, размеры sm/md/big
  - `counter-chip.tsx` — Реакция/Легендарки с +/− и Lucide-иконкой
  - `stat-row.tsx` — 6 ability scores с модификаторами
  - `statblock-section.tsx` — collapsible section с иконкой и счётчиком
  - `action-button.tsx` — ActionButton + ActionTooltip + FormulaLine (подсветка `+X to hit`, `NdN+N`, `DC N Stat`)
  - `target-picker-dialog.tsx` — модалка с KO-selectable, dead-disabled
  - `statblock-panel.tsx` — главный контейнер: header (name, CR, AC/HP/speed, counters), stats row, senses line, 5 секций (Actions/Bonus/Reactions/Legendary/Passives), emptystate если нет statblock-данных
- **`encounter-page-client.tsx`** переписан: правый сайдбар = табы Статблок/Каталог, state counters синхронизирован с Supabase, reset реакций при смене хода, action → addEvent в лог.
- **`encounter-grid.tsx`**: добавлены props `onActiveChange(id)` и `onParticipantsChange(list)`.

### Хардкод-аудит (по запросу пользователя)

- ✅ Вынес `['dead', 'мертв', 'мёртв']` из encounter-page-client в `isDeadConditionName` / `hasDeadCondition` в `lib/statblock.ts` с TODO-комментарием для настройки кампании (IDEA-028).
- ⚠️ Осознанно оставил D&D 5e-специфику: 6 ability scores (STR/DEX/CON/INT/WIS/CHA), формулы `+N to hit` / `NdN+N` / `DC N Stat`, max реакций = 1, скорости `walk/fly/swim/climb/burrow`, `abilityMod = ⌊(score−10)/2⌋`. Конституция X: "разрабатывается на примере D&D 5e" — это в пределах принципа. При переходе на другую систему — вынести в конфиг кампании.

### Новые идеи в backlog от пользователя

- **IDEA-029**: Заклинания как JSON + spell slots + расходники + маг.предметы на НПС
- **IDEA-030**: Базовая реакция AoO у существ с melee (default_reactions в node_type)
- **IDEA-031**: Фиты для НПС/монстров (feats: []) — отдельная секция в statblock
- **IDEA-032**: Схлопывание группы одинаковых существ (20 кобольдов) — агрегатное HP, счётчик живых, урон суммой

## Что сделано в этом чате (chat 11, 2026-04-19)

### Hotfix + QA перед deploy ✅

- **`encounter-grid.tsx`** — закрыта недоделка chat 10:
  - `onParticipantsChange` задестрактурен в сигнатуре forwardRef.
  - Добавлен `useEffect(() => { onParticipantsChange?.(participants) }, [participants, onParticipantsChange])` рядом с useEffect для turnId.
  - Родитель (`encounter-page-client.tsx`) уже был подключён как `onParticipantsChange={setParticipantsSnap}` — теперь правая панель видит живые HP/conditions без F5.
- **`npm run build`** — прошёл чисто. TypeScript 0 ошибок, Turbopack 25.1s.
- **Миграция 020** отдана пользователю через `present_files`. Применить в Supabase SQL Editor.

## Что сделано в этом чате (chat 12, 2026-04-19)

### 5 UX-фиксов на странице энкаунтера ✅

1. **Reactions reset at START of own turn** — уже работало. Оставил существующий `useEffect` на `activeId` в `encounter-page-client.tsx`. Проверено.
2. **Legendary reset at END of own turn** — добавлен `prevActiveIdRef` + второй `useEffect`. При смене `activeId` c `prev` на новый, если у `prev` был `legendary_used > 0` — сбрасывается в 0 и пишется в Supabase. Ловит именно конец хода, а не начало.
3. **Hide UniversalSidebar on encounter detail page** — новый клиентский компонент `components/campaign-sidebar-aside.tsx`. Проверяет `usePathname()` против регэкспа `/c/:slug/encounters/:uuid$`, возвращает `null` если совпало. Сам `<aside>` тоже живёт внутри — пропадает вместе с содержимым. В `app/c/[slug]/layout.tsx` заменил прямой `<aside>` на `<CampaignSidebarAside />`. На каталоге и остальных страницах всё как было.
4. **AddParticipantRow dropdown clipped** — вынесен из `overflow-x-auto` обёртки в `encounter-grid.tsx`. Теперь row сидит сразу под таблицей на том же уровне, что outer `<div>`, и dropdown свободно выпадает вниз без клипа. Пришлось почистить лишний `</div>` после перестановки.
5. **EncounterLog — newest at top + no auto-scroll** — `timeline.slice().reverse().map(...)` для отрисовки. Удалён `useEffect` с `scrollIntoView`, `bottomRef`, `prevLenRef` и якорь `<div ref={bottomRef} />`. Импорт `useEffect` убран из `encounter-log.tsx`.

### Build + commit

- `npm run build` — чисто. Turbopack 18.5s, TypeScript 0 ошибок.
- Коммит `b12-5-ux-fixes` в main, push.

## Что сделано в этом чате (chat 13, 2026-04-19)

### Статблок-фиксы + настройки HP + Legendary Resistance ✅

**Задачи пользователя (10 пунктов):**

1. ✅ **Bug: max_hp и current_hp не подхватывались при добавлении SRD-моба.** SRD seed (миграция 019) пишет стартовое HP в `fields.hp`, homebrew — в `fields.max_hp`. Фоллбэк `max_hp ?? hp` добавлен в трёх местах: `add-participant-row.tsx` (submit + подсказка в дропдауне), `encounter-catalog-panel.tsx` (click-handler + колонка через `render`), `parseStatblock` в `lib/statblock.ts`.

2. ✅ **Настройки кампании с выбором метода HP.** Миграция 021 добавила `campaigns.settings jsonb`. Новая страница `/c/[slug]/settings` с 4 опциями: `average` (DMG-среднее из статблока), `max` (хардкор — все хит-дайсы на максимум), `min` (1 за дайс), `roll` (бросок каждый раз). Server Action `updateCampaignHpMethod` мержит настройку в `settings` без затирания других ключей. `computeMonsterHp(fields, method)` в `lib/statblock.ts` парсит `hit_dice` формата `17d10+85` и выдаёт HP. При добавлении моба клиент считает массив HP на каждого из `qty` (важно для `roll`) и шлёт на сервер.

3. ✅ **Спасброски и HD.** `Statblock.saves` и `hit_dice` уже были в модели — теперь рендерятся в панели: HD рядом с лейблом HP (`· 17d10+85`), спасы как отдельная строка `Спасы СИЛ +0, ТЕЛ +13, МДР +7` с русскими аббревиатурами.

4. ✅ **Senses.** Добавлены `truesight` и `tremorsense` (рендерились только PP/darkvision/blindsight). Все чувства идут в стате-стрипе.

5. ✅ **Proficiency bonus.** Добавлен чип `PB +X` в хедере панели. `effectiveProficiency(sb)` использует `proficiency_bonus` из полей если есть, иначе считает по CR (таблица 5e DMG: CR <5 → +2, <9 → +3, <13 → +4 и т.д., `parseCrValue` понимает `"1/4"`, `"1/8"` и т.п.).

6. ✅ **Skills.** Отдельная строка `Навыки Аркан +18, Проница +9, ...` с русскими аббревиатурами (словарь `SKILL_LABEL_RU` на 18 скилов).

7. ✅ **Tooltip на тип существа.** `creatureTypeInfo(type)` в `lib/statblock.ts` — словарь на 14 типов (aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead) с русской меткой и кратким описанием. В панели подтип подчёркнут пунктиром + нативный `title=` на hover.

8. ✅ **Legendary Resistance tracker.** Миграция 021 добавила `encounter_participants.legendary_resistance_used int NOT NULL DEFAULT 0`. `extractLegendaryResistanceBudget(passives)` парсит имя пассива регэкспом `/legendary resistance \((\d+)\s*\/\s*day\)/i`. Если бюджет > 0 — в хедере появляется третий `CounterChip` с иконкой Sparkles, внизу панели reminder-строка "Сопротивлений N/M осталось сегодня". Состояние синхронизируется с БД так же, как реакции/легендарки (через `makeCounterSetter`).

9. ⏸ **Homebrew / canon badge** — не начато, оставлено в backlog как IDEA-033. Инфраструктура уже есть: SRD-ноды тегированы `srd`/`canon` в `fields.tags`.

10. ✅ **Источник (source_doc).** Поле было в модели, теперь рендерится футером панели вместе со ссылкой на `statblock_url`: `Источник: SRD 2014 (Open5e) · статблок ↗`.

### Что новое в модели

- `lib/campaign.ts`: `CampaignSettings { hp_method }`, `parseCampaignSettings`, `getCampaignBySlug` теперь возвращает `Campaign & { settings }`.
- `lib/statblock.ts`: `Statblock` расширен `proficiency_bonus`, `source_doc`, `legendary_resistance_budget`. Новые хелперы: `HpMethod`/`isHpMethod`, `parseHitDice`, `computeMonsterHp`, `parseCrValue`/`proficiencyFromCr`/`effectiveProficiency`, `extractLegendaryResistanceBudget`, `creatureTypeInfo`.
- `encounter_participants`: новая колонка `legendary_resistance_used`.
- `campaigns`: новая колонка `settings jsonb`.

### UI-мелочи

- Настройки кампании: новая вкладка ⚙️ в `nav-tabs.tsx` (пятая после Энкаунтеров).
- `counter-chip.tsx`: принимает третью иконку `'sparkles'`.

### Build + commit

- `npm run build` — чисто. Turbopack 30.4s, TypeScript 0 ошибок (была одна — duplicate key в `makeCounterSetter` при слиянии объектов, починил через явный `existing`).
- Коммит и push — будут в ответе.

## ⚠️ Действия для пользователя

1. **Применить миграцию 021** (`021_campaign_settings_and_lr.sql`, файл на руках через present_files). Добавляет `campaigns.settings` и `encounter_participants.legendary_resistance_used`. **БЕЗ этой миграции продакшн упадёт** — код теперь читает эти колонки.
2. Проверить что 020, 019, 018 уже применены.
3. **QA на проде:**
   - `/c/mat-ucheniya/settings` — страница открывается, видны 4 опции метода HP, можно сохранить.
   - Установить `max` (или желаемое), добавить дракона/лича в энкаунтер: HP должен быть максимум дайса + бонус.
   - Переключить на `roll`, добавить 3 троллей — у каждого разное HP.
   - SRD-монстр в энкаунтере: HP подтягивается сразу (баг 1 закрыт).
   - Панель статблока показывает: ⚙️ тип подчёркнут, hover → русское описание; CR бэйдж; HD рядом с HP; спасы/навыки строками; PB чип; senses с blindsight/truesight/tremorsense если есть; у лича/дракона — 3-й счётчик "Сопротивл." с +/−, после использования reminder внизу; в футере источник + ссылка.
   - Вкладка ⚙️ Настройки видна в навигации.

## Что сделано в этом чате (chat 14, 2026-04-19)

### 5 UX-правок + action resolve flow ✅

1. **Settings feedback** — после сохранения `redirect(...?saved=1)`, на странице зелёный баннер `✓ Сохранено`.

2. **"Выделено: N" не двигает таблицу** — selection bar вынесен из `<thead>` в floating pill снизу экрана (`position: fixed, bottom-4`). Больше не смещает layout при клике в первый столбец.

3. **TagCell: полный список при открытии** — dropdown показывает все доступные варианты, как только ячейка в фокусе (раньше только после ввода). Размер увеличен: `w-56 max-h-56`, cap 30 элементов.

4. **Кнопки последнего столбца** — заменены на dropdown `⋯` в новом компоненте `components/encounter/row-actions-menu.tsx`. Три пункта с подписями:
   - **Клонировать** — копия участника с номером.
   - **Убрать из боя / Вернуть в бой** — `is_active` toggle. Теперь понятно, что это "скамейка" (сущность остаётся в списке, но пропускается инициативой).
   - **Удалить совсем** — красный, navigates `deleteParticipant`.
   Колонка ⚙ сужена с `w-20` до `w-12`.

5. **Action resolve flow** — новый `ActionResolveDialog`. Флоу теперь:
   - `self` action → сразу resolve dialog.
   - `single` / `area` action → TargetPicker → resolve dialog с выбранными целями.
   - В resolve-диалоге: формула действия (с подсветкой `+N to hit`, `NdN+N`, `DC N Stat`), список целей, для каждой: toggle Попал/Промах, input урона, заметка (крит, спас, отравлен…), общий комментарий.
   - Apply → `handleActionResolved` в `encounter-page-client.tsx` пишет один event на цель (`hp_damage` если урон > 0, иначе `custom`) + общий custom-event если есть комментарий. Урон применяется напрямую в `encounter_participants.current_hp` + оптимистично в `participantsSnap` (HP-бары обновляются сразу). Соответствует принципу пользователя: "игрок предлагает — ДМ пишет исход".

### Новое / изменённое

- **Новые файлы**: `components/encounter/row-actions-menu.tsx`, `components/encounter/statblock/action-resolve-dialog.tsx`.
- **Изменения**: `app/c/[slug]/settings/page.tsx` (searchParams + баннер), `components/encounter/tag-cell.tsx` (показ всех suggestions), `components/encounter/encounter-grid.tsx` (floating toast + RowActionsMenu), `components/encounter/statblock/statblock-panel.tsx` (flow picker→resolve), `components/encounter/encounter-page-client.tsx` (handleActionUsed → handleActionResolved с урон-логикой).
- **Контракт StatblockPanel**: prop `onActionUsed(action, targetIds)` заменён на `onActionResolved(action, targets, result)`. `result` содержит `perTarget: {id, hit, damage, note}[]` + `comment`.

### Build + commit

- `npm run build` — чисто. TypeScript 0 ошибок.
- Миграция не нужна — только UI/logic.

## Что сделано в этом чате (chat 15, 2026-04-19)

### 4 UX-правки: семантика счётчиков + инспект-флоу + i18n ✅

1. **Счётчики = ресурс-пул.** `CounterChip` переделан: показывает `remaining/max` (например, «Легендарки 2/3»). `−` — первичная кнопка, тратит заряд. `+` — вторичная, восстанавливает (undo / длинный отдых). Иконка/числа сереют когда `remaining === 0`. Подпись ARIA и `title` по-русски («Потратить», «Восстановить», «Легендарки: осталось N из M»). Схема в БД не менялась — поле остаётся `*_used`, UI-преобразование через `remaining = max − used`. Это универсальная структура на будущее (sorcery points, ци, second wind, заряды предметов). Prop rename: `onDec/onInc` → `onSpend/onRestore`. Все три вызова в `StatblockPanel` обновлены.

2. **Клик по имени → инспект чужого статблока без смены хода.** В `encounter-page-client.tsx` состояние разделено: `turnId` (источник — грид, при `setNext`) и `inspectedId` (user override, null = следуем за ходом). `active = participantsSnap.find(id === (inspectedId ?? turnId))`. **Критично**: сбросы реакций/легендарок теперь слушают `turnId`, не `activeId` — инспект никогда не триггерит reset чужих счётчиков. Новый компонент `components/encounter/name-cell.tsx`: одиночный клик = inspect (deferred 220ms), двойной клик = переименовать. Старая eye-иконка убрана. Когда `inspectedId !== turnId`, между табами и панелью появляется амбер-баннер «👁 Смотришь: X, ход сейчас не его · ← К ходящему»; клик — вернуться к ходящему. Смена хода в гриде автоматически очищает `inspectedId`.

3. **Layout не прыгает при пустом статблоке.** Правый контейнер получил `minWidth: 440` в дополнение к `width: 440`. Карточка «Нет активного участника» получила `w-full` (у `StatblockPanel` empty-state уже было).

4. **«Условия» → «Состояния».** Заголовок колонки в гриде. В коде остаётся `conditions`. Тип ноды в каталоге уже имел правильный label «Состояние» с миграции 003 — трогать не пришлось.

### Новое / изменённое

- **Новый файл**: `components/encounter/name-cell.tsx` (single=inspect, double=rename, с disambiguation timer).
- **Переписан**: `components/encounter/statblock/counter-chip.tsx` (resource-pool семантика, `onSpend/onRestore`).
- **Правки**: `components/encounter/encounter-page-client.tsx` (split turnId/inspectedId, follow-turn banner, width lock 440px), `components/encounter/encounter-grid.tsx` (NameCell instead of EditableCell for name, column header «Состояния»), `components/encounter/statblock/statblock-panel.tsx` (updated CounterChip calls).

### Build + commit

- `npm run build` — чисто, TS 0 ошибок.
- Миграция не нужна.

## Что сделано в этом чате (chat 16, 2026-04-19)

### Полировка энкаунтера перед «закрытием» фичи ✅

1. **Bulk-статусы работают.** Две проблемы исправлены:
   - `TagCell` теперь делает `e.stopPropagation()` на клик по ячейке — открытие тэг-редактора больше не триггерит `toggleSelect` на уровне строки и не сбрасывает мульти-выделение.
   - `onConds` / `onEffects` в `hooks/use-participant-actions.ts` переписаны: diff (`added` / `removed`) применяется ко **всем** выделенным через `getTargets(id)`, с optimistic updates, per-target DB writes и per-target auto-events.

2. **Бургер-меню → явные кнопки.** `RowActionsMenu` (⋯ dropdown) убран из грида. Вместо него две inline-кнопки в колонке: `⧉ Клон` (серый hover) и `✕ Удал.` (красный hover). Высота `h-7`, с подписями, `stopPropagation` на обёртке. Кнопка «Убрать из боя» убрана — пустая инициатива = скамейка, `is_active` toggle больше не торчит в UI (сам хук `onToggle` в коде остался как dead-code на будущее). Колонка переименована «⚙» → «Действия», ширина расширена под две кнопки.

3. **Header bar вынесен из таблицы.** Инфо-панель (название / Петля / День / Раунд / контролы хода / SaveTemplate / Стоп) больше не сидит в `<thead>` с `colSpan` — теперь это отдельный `<div>` с `flex flex-wrap` над таблицей. Ширина контролов не диктуется колонками таблицы.
   - Добавлено поле **«Сессия»** рядом с «Петля» / «День». Пишется в `encounters.details.session` (существующий JSONB, миграция не нужна).
   - Кнопки крупнее: раундовые `h-7 w-7` с border, стрелки хода `h-9 w-9`, Стоп — border + красный hover.
   - Новый локальный компонент `DetailField` (в конце encounter-grid.tsx) объединяет повторяющийся паттерн «label + EditableCell» для Сессия/Петля/День.
   - Колонка «Временные хиты» (`Вр.`) сужена `w-14` → `w-10`.

### Изменённые файлы

- `components/encounter/encounter-grid.tsx` (header bar rewrite + action buttons + narrow temp-hp)
- `components/encounter/tag-cell.tsx` (stopPropagation)
- `hooks/use-participant-actions.ts` (bulk onConds/onEffects)

### Build + commit

- `npm run build` — чисто после одной правки (случайно потерял `<tr>` при рефакторинге thead — починил).
- Миграция не нужна.

## Wrap-up фичи «трекер энкаунтера»

Основной боевой флоу закрыт. Что именно работает:
- Инициатива, раунды, порядок хода, смена хода стрелками/хоткеями.
- HP / Temp HP / inline редактирование, bulk-изменения по выделению.
- Conditions / Effects с временной привязкой + dropdown каталога + bulk.
- Правая панель со статблоком: header (CR/AC/HP/HD/Скорость), 6 ability scores, спасы, навыки, senses (darkvision/blindsight/truesight/tremorsense), иммунитеты/резисты/уязвимости/condition_immunities/языки, footer с источником.
- Счётчики-ресурсы: Реакция / Легендарки / Сопротивления (resource-pool семантика, `−` тратит, `+` возвращает).
- Tooltip на creature type (14 типов с русскими описаниями).
- PB чип (explicit или по CR).
- Настройки кампании с 4 методами HP (avg/max/min/roll), применяется при добавлении из каталога.
- Action resolve flow: клик по действию → picker (для area/single) → resolve dialog с полями per-target hit/damage/note + общий комментарий → структурированные события в лог + автоурон.
- Инспект-режим: клик по имени показывает чужой статблок без смены хода, амбер-баннер «смотришь X · К ходящему».
- Selection toast внизу, row actions «Клон / Удал.», 5 полей в инфо-баре (название, Сессия, Петля, День, Раунд, контролы хода).

Что сознательно не сделано и ждёт отдельных чатов:
- Общая панель «кто может среагировать» (spec-007 этап 3).
- Excel-like polish грида (spec-007 этап 4).
- Homebrew/canon бейдж (IDEA-033).
- Death saves для PC.
- Логины + RLS + мобильная вьюха для игроков (spec-006-auth).

## Что сделано в этом чате (chat 17, 2026-04-19)

### QA-фиксы после chat 16 ✅

1. **Dropdown обрезается `overflow-x-auto`** — починено через portal. `TagCell` теперь рендерит выпадающий список через `createPortal(..., document.body)` с `position: fixed` + computed coords через `getBoundingClientRect`. Позиция пересчитывается на `scroll` (capture phase — ловит и скролл таблицы) и `resize`. Outside-click обработчик игнорирует клики внутри dropdown'а (помечен `data-tag-dropdown`). **Правило на будущее**: любые inline dropdown'ы/меню внутри таблицы с `overflow-x-auto` или любого overflow-контейнера должны порталиться в body, иначе клипаются.

2. **Кнопки хода крупнее с подписями** — "Предыдущий" / "Следующий". Было `h-9 w-9` с одним символом → стало `h-10` + `px-3.5` + иконка-символ + текст. Title теперь показывает только хоткей, без дублирования.

3. **Маленькая "1" в состояниях — удалена.** Раньше `TagCell` рендерил `{tag.round > 0 && <span>{tag.round}</span>}` рядом с именем тэга — это номер раунда наложения. Теперь это число не показывается в UI, но сохраняется в `tag.round` и отображается в `title=` (hover тултип): `"Истощён — с раунда 3 (клик — убрать)"`. Информация не теряется, не мозолит глаза.

4. **Истощение 1–6 как отдельные состояния.** Миграция 022:
   - Удалён общий `"Истощённый"` из каталога (и из `encounter_participants.conditions` arrays, если где-то был применён).
   - Вставлены 6 отдельных нод: `Истощение 1`, `Истощение 2`, … `Истощение 6` с точным описанием эффектов каждого уровня.

### Файлы

- `components/encounter/tag-cell.tsx` — полный rewrite: portal dropdown, без raw-цифры раунда в UI.
- `components/encounter/encounter-grid.tsx` — новые подписи + размеры у кнопок хода.
- `supabase/migrations/022_exhaustion_levels.sql` — 6 новых condition-нод, удаление старой.

### Build + commit

- `npm run build` — чисто, TS 0 ошибок.
- **Миграция 022** обязательна — без неё состояния выглядят как раньше (один "Истощённый"), но UI не сломается.

## ⚠️ Действия для пользователя (chat 17)

1. **Применить миграцию 022** в Supabase SQL Editor (`022_exhaustion_levels.sql`, отдал через present_files).
2. **Деплой авто** через Vercel.
3. **QA:**
   - Открыть ячейку "Состояния" у нижней строки таблицы → список полностью виден, ничем не обрезается. Скроллить страницу → dropdown едет вместе с ячейкой.
   - Кнопки хода над таблицей: большие, с текстом "← Предыдущий" и "Следующий →".
   - Применённое состояние: цифра раунда справа от имени **не** видна, но при hover в тултипе написано "с раунда N".
   - В dropdown условий видны "Истощение 1" … "Истощение 6" вместо одного "Истощённый".

## ⚠️ Действия для пользователя (chat 16)

1. **Деплой авто** через Vercel.
2. **QA:**
   - Выдели 3 строки (Ctrl+Click) → открой Условия у одной из них → выбери "Отравлен" → **он применяется ко всем трём**, выделение сохраняется.
   - Та же история с Эффектами.
   - Колонка «Действия» теперь шире, видны две подписанные кнопки «Клон» и «Удал.», без ⋯.
   - Header бар над таблицей: название слева, рядом Сессия/Петля/День/Раунд, справа контролы хода — всё крупнее и не зажато колонками таблицы.
   - Ввести номер в поле «Сессия» → перезагрузить страницу → число сохранилось.
   - Колонка «Вр.» (временные хиты) заметно уже.

## ⚠️ Действия для пользователя (chat 15)

1. **Деплой авто** через Vercel.
2. **QA на проде:**
   - Счётчики: реакция/легендарка/сопротивление показывают остаток, `−` тратит, `+` возвращает. Исчерпанный серый.
   - Клик по имени любого участника → статблок справа меняется на него, ход/жёлтая подсветка в гриде **не** меняется, внизу-сверху панели амбер-баннер «смотришь X, ход сейчас не его · К ходящему».
   - Клик «К ходящему» → возврат.
   - Двойной клик по имени → редактирование имени (как было).
   - Следующий ход → баннер исчезает, панель показывает нового активного.
   - Добавить участника без статблока (например, манёвром «Добавить вручную») → панель показывает «У этой ноды нет статблока», грид слева не уезжает вширь.
   - Колонка называется «Состояния», не «Условия».

## ⚠️ Действия для пользователя (chat 14, если ещё не прокачал)

1. **Деплой авто** через Vercel, миграции не нужно накатывать.
2. **QA:**
   - Настройки: сохранить → зелёная плашка `✓ Сохранено` видна.
   - Кликнуть в первый столбец строки → таблица не едет вниз, внизу экрана pill "Выделено: N".
   - Кликнуть в ячейку "Состояния" → сразу выпадает список всех condition'ов кампании.
   - Правый столбец → `⋯` → меню с тремя понятными пунктами.
   - Атака моба: клик по "Bite" → picker цели → после выбора **resolve dialog** с полями урона/заметки → Apply → запись в логе + HP у цели уменьшилось без reload.
   - Self-action (Spellcasting и т.п.) → сразу resolve без picker.

## Что сделано в этом чате (chat 19, 2026-04-19)

### Spec-007 этап 4 — stage 2: AC + death saves + # column + role dot возле имени ✅

Продолжение рестайла грида. Новые столбцы для ДМа: класс доспеха (на все роли) и
спасброски от смерти (только для PC на 0 HP). Левая колонка теперь показывает
номер строки с индикатором выделения — раньше там висел пустой слот. Role dot
переехал из отдельной ячейки к имени, где он естественнее смотрится и не
крадёт ширину таблицы.

**Миграция 023** (`023_ac_and_death_saves.sql`):
- `encounter_participants.ac int` (nullable) — класс доспеха per-encounter.
  Обоснование в комменте: AC может меняться от заклинаний/предметов, хранить
  на ноде каталога нельзя — испортит исходник. Сидится из `node.fields.ac`
  при добавлении из каталога.
- `encounter_participants.death_saves jsonb NOT NULL DEFAULT
  '{"successes":0,"failures":0}'::jsonb` — прогресс спасбросков от смерти.
  Локально для энкаунтера, не тащится между боями. Автосброс в 0 когда
  игрока подлечили выше 0 HP (в `onHp` hook).

**`lib/encounter-actions.ts`**:
- `updateAc(id, ac)`, `updateDeathSaves(id, saves)` + тип `DeathSaves`.
- `addParticipantFromCatalog` теперь принимает `ac: number | null = null`
  параметром — при добавлении из каталога сидится из `fields.ac`.

**`Participant` type** (в `encounter-grid.tsx`): +`ac`, +`death_saves`.

**`hooks/use-participant-actions.ts`**:
- `onAc(id, v)` — парсит int, bulk-aware через `getTargets`.
- `onDeathSaveTick(id, 'successes' | 'failures')` — клик по пустому кружку,
  капается на 3. При успехе/провале пишет event в лог.
- `onDeathSavesReset(id)` — ПКМ = сброс в 0/0.
- `onHp` расширен: если у участника было 0 HP и отхилили > 0 —
  автоматически чистит `death_saves` (и в стейте, и в БД).
- `addFromCatalog` — сидит AC из `cat.fields.ac` (и строка, и число).
- `addManual` — возвращает дефолты `ac: null, death_saves: {0,0}`.

**Новый `components/encounter/death-saves-cell.tsx`**:
- Три зелёных + три красных кружка, разделитель `|` между.
- Клик по пустому — прогресс, ПКМ на ячейке — reset.
- `visible` prop: показывать только если `node.type.slug === 'character'`
  и `current_hp === 0 && max_hp > 0` (т.е. только PC в down-state). Иначе
  короткий em-dash чтобы не ломать выравнивание.

**`encounter-grid.tsx`** — перерисовка таблицы:
- Новая колонка `#` (w-10) слева: порядковый номер + стрелочка ▶ у текущего
  хода. Номер жирнее и синий когда строка выделена — явный сигнал bulk-select.
  Раньше тут висела пустая ячейка с role-dot, что путало.
- Role dot переехал в начало ячейки «Имя», как маркер принадлежности.
  Клик по нему так же циклит enemy→pc→ally→neutral.
- Новая колонка **AC** (w-12) между Ин. и Имя. Inline EditableCell, моно-шрифт.
- Новая колонка **Смерть** (w-[120px]) между Вр. и Действия.
- `colSpan` пустого ряда → 10. `minWidth` таблицы 960 → 1120.

### Build + commit
- `npm run build` — 29.3s, TS 0 ошибок, с первого раза.
- Коммит `b19-stage-2-ac-death-saves-index-column` в main, push.

## ⚠️ Действия для пользователя (chat 19)

1. **Применить миграцию 023** (`023_ac_and_death_saves.sql`, отдаю через
   present_files). Добавляет `ac` и `death_saves` в `encounter_participants`.
   **БЕЗ этой миграции продакшн упадёт** — код читает эти колонки.
2. **Деплой авто** через Vercel.
3. **QA на проде:**
   - Добавить SRD-моба в энкаунтер → в новой колонке AC подтянулось
     значение из статблока (например, у кобольда 12).
   - Клик по AC → inline edit → вбить 17 → сохранилось.
   - Выделить 3 строки → поменять AC в одной → все три обновились (bulk).
   - У PC опустить HP до 0 → в колонке «Смерть» появились 3+3 кружка.
     Клик по красному → заполнился, лог: «Спасбросок от смерти: провал (1/3)».
     ПКМ → сброс в 0/0.
   - Полечить этого же PC → death saves автоматически очистились.
   - У моба HP=0 → в колонке «Смерть» прочерк (фича только для PC).
   - Левая колонка: номера строк, у выделенных — синие и жирнее, у текущего
     хода — стрелочка ▶ слева от номера.
   - Role dot теперь рядом с именем (клик циклит роль). Ячейка `#` стала
     чисто номером.

## Что сделано в этом чате (chat 20, 2026-04-19)

### Spec-007 этап 4 — stage 3: PillEditor ✅

ClickUp-style контекст-попап для пилюль условий/эффектов. Было:
клик по пилюле → немедленное удаление (семантика неявная, легко
случайно «потерять» условие). Стало: клик → попап с метаданными
и явной кнопкой «Убрать».

**Новый файл `components/encounter/pill-editor.tsx`:**
- Portal в `document.body`, `position: fixed`, не клипается
  `overflow-x-auto` обёрткой таблицы (правило chat 17).
- Позиционирование: под пилюлей, левый край совпадает. Flip наверх
  если снизу нет места.
- Пересчёт координат на `scroll` (capture phase) и `resize` —
  попап едет за якорем.
- API расширяемый: `actions: PillAction[]` где каждый action =
  `{ label, onClick, tone?: 'default' | 'danger' }`. В stage 5+
  можно накинуть «Переименовать», «Сменить цвет» без ломания
  контракта — просто добавить элементы в массив.
- Outside-click: закрывает, если клик не внутри попапа И не внутри
  `anchorEl`. Ключевая тонкость: `anchorEl.contains(t)` вместо
  абстрактного `[data-pill-anchor]` — это позволяет корректно
  переключаться между пилюлями (клик в другую пилюлю закрывает
  первый попап и открывает второй).
- Escape закрывает.
- `setTimeout(..., 0)` на регистрацию listener'ов — чтобы клик,
  открывший попап, не закрыл его тем же event loop'ом.

**Переписан `components/encounter/tag-cell.tsx`:**
- Вместо inline-removeTag на клике пилюли — `setOpenPill({name, el})`,
  где `el = e.currentTarget`. State локальный per-cell.
- Открытая пилюля визуально выделена: `background: blue-50`,
  `color: blue-700`, `box-shadow: 0 0 0 1px blue-400`.
- Toggle: повторный клик по той же пилюле — `setOpenPill(null)`.
- При открытии попапа гасится режим редактирования (`editing=false`)
  — попап и dropdown-suggestions не перекрываются.
- Обработчик клика по контейнеру ячейки игнорирует клики по пилюле
  (`t.closest('[data-pill-anchor]')`) — чтобы клик по пилюле не
  открывал одновременно editing mode.
- Убраны старые `onMouseEnter/Leave` с красной подсветкой при hover
  (подсказка «сейчас удалю» больше не нужна). Теперь hover = gray-200,
  нейтрально — пилюля превратилась в обычный кликабельный элемент,
  а не кнопку самоуничтожения.

**Интерфейс `TagCell` наружу не изменился** — `encounter-grid.tsx`
не трогал.

### Build + commit
- `npm run build` — 20.2s, TS 0 ошибок, с первого раза.
- Миграции не нужны — чистый UI.
- Коммит `b20-stage-3-pill-editor` в main, push.

## ⚠️ Действия для пользователя (chat 20)

1. **Деплой авто** через Vercel. Миграций нет.
2. **QA на проде:**
   - Добавить условие («Отравлен», «Оглушён») → нажать на пилюлю →
     под ней появляется попап: имя тэга жирно, серым текстом
     «с раунда N» (или «до боя»), красная кнопка «Убрать».
   - Сама пилюля во время открытого попапа выделена синим контуром.
   - Клик «Убрать» → условие пропало, попап закрылся.
   - Клик в ту же пилюлю повторно → попап закрылся (toggle).
   - Клик в другую пилюлю (в той же или другой строке) → первый
     попап закрылся, второй открылся.
   - Escape → закрыть.
   - Клик в пустое место ячейки условий (не по пилюле) → открывает
     dropdown для добавления, как раньше.
   - Ctrl+Click по нескольким строкам → выбрать условие → применилось
     ко всем. Потом клик по пилюле у одного — попап открывается
     именно у этого, не сбрасывает выделение.
   - Скролл страницы при открытом попапе → попап едет за пилюлей,
     не отстаёт и не уезжает вверх.

## Что сделано в этом чате (chat 21, 2026-04-19)

### Spec-006 инкремент 1: фундамент auth ✅ (код)

Принято решение пересмотреть направление. Stage 4 трекера (трекер трат)
и общая панель реакций отложены — они закрывают «удобства для ДМа»,
но без auth невозможно двигаться к мобилке игрока (spec-007 этап 5),
realtime (IDEA-009), флоу «игрок заявляет» (IDEA-015).

**Spec-006 переписан (v2)**: auth без email. ДМ выдаёт логин+пароль
устно, игрок меняет пароль при первом входе, password reset только
через ДМа. Внутри Supabase Auth юзеры живут как `{login}@mol.local`
(синтетический email, в UI невидим).

**4 инкремента**, каждый играбельный. В этом чате сделан инкремент 1
(фундамент).

### Что написано

**Миграция 024** (`024_auth_profiles_members_rls.sql`):
- `user_profiles` (user_id PK → auth.users, login UNIQUE с regex-чеком,
  display_name, must_change_password, created_at).
- `campaign_members` (campaign+user+role, UNIQUE(campaign,user),
  PARTIAL UNIQUE где role=owner — ровно один владелец per-campaign).
- `nodes.owner_user_id` — nullable FK на auth.users, smysl только для
  type=character.
- Helper функции `is_member(uuid)`, `is_dm_or_owner(uuid)`, `is_owner(uuid)`
  с SECURITY DEFINER — чтобы RLS на campaign_members не давала рекурсии
  при проверках доступа.
- RLS ENABLE + policies на все 17 существующих таблиц: campaigns,
  node_types, edge_types, nodes, edges, encounters, encounter_participants,
  encounter_templates, encounter_template_participants, encounter_log,
  encounter_events, loops, chronicles, party, party_members, sessions,
  user_profiles, campaign_members. Паттерн: SELECT — члены кампании,
  модификация — owner/dm.

**`scripts/seed-owner.ts`** + `"seed-owner": "tsx scripts/seed-owner.ts"`
в package.json + tsx в devDeps:
- CLI с `--login --password --campaign`.
- Читает `.env.local` если переменные не в shell.
- Идемпотентный: повторный запуск с тем же логином обновляет пароль,
  не создаёт дубль.
- Owner сидится с `must_change_password=false` (сам вводил пароль).
- Через Supabase admin API (`createUser` + `email_confirm: true`) —
  email-верификация пропускается.

**Lib слой:**
- `lib/supabase/admin.ts` — service role client с `import 'server-only'`,
  чтобы не попал в клиентский бандл.
- `lib/supabase/middleware.ts` — helper `updateSession(request)` для
  обновления Supabase-cookies в middleware.
- `lib/auth.ts` — `getCurrentUser`, `getCurrentUserAndProfile`,
  `requireAuth`, `requireMembership`, `loginToEmail`.

**Middleware `middleware.ts` в корне mat-ucheniya:**
- Unauth на `/c/*` → `/login`.
- Auth с `must_change_password=true` на любой странице (кроме
  `/onboarding` и `/auth/*`) → `/onboarding`.
- Auth на `/login` → `/`.
- Session refresh на каждом запросе.
- Matcher исключает `_next/static`, `_next/image`, картинки, favicon.

**Страницы:**
- `/login` — форма «Логин + Пароль», error display. `signInAction` через
  useActionState. Ошибка «Неверный логин или пароль» без различения,
  что именно не так.
- `/onboarding` — принудительная смена пароля. Валидация: ≥8 символов,
  подтверждение совпадает, пароль отличается от текущего. После успеха
  сбрасывает `must_change_password` и редиректит на `/`.
- `/account` — self-service смена пароля. Требует ввод текущего
  (проверяется через signInWithPassword). Зелёный баннер «✓ Пароль
  сменён» на успехе.
- `/auth/signout` POST — signOut + 303 на `/login`.
- `/` — Server Component: не залогинен → `/login`; одна кампания →
  `/c/[slug]/catalog`; несколько → список; ни одной → stub «Нет доступа»
  с кнопкой «Выйти» (чтобы юзер не застрял).

**Campaign layout (`app/c/[slug]/layout.tsx`):**
- `requireAuth()` + `getMembership(campaign.id)` в начале. Если не
  участник — редирект на `/`.
- В хедер добавлен `<UserMenu />` (логин + «Выйти»).

**Компонент `components/user-menu.tsx`:**
- Server Component: читает profile, показывает display_name или login
  (моно-шрифт), ссылку на `/account`, POST-форму «Выйти» на
  `/auth/signout`.

**Инструкция `supabase/migrations/024_DEPLOY_GUIDE.md`:**
- Пошаговая инструкция: настройка Supabase → ENV в Vercel → миграция
  → seed-owner → проверка → деплой.
- Предупреждение про окно недоступности (~30 сек) между миграцией
  и seed-owner.
- Откат (disable RLS).

### Build + commit

- `npm run build` — 24.8s, TS 0 ошибок.
- Middleware зарегистрирован (`ƒ Proxy (Middleware)` в выводе build'а).
- Новые роуты: `/`, `/account`, `/auth/signout`, `/login`, `/onboarding`.
- Коммит: `b21-spec-006-increment-1-auth-foundation` в main, push.

## ⚠️ Действия для пользователя (chat 21)

**Порядок критичен. Пока не дойдёшь до шага 5, прод НЕДОСТУПЕН.**

1. **Supabase Dashboard**:
   - Auth → Providers → Email → `Confirm email`: **выключить**.
2. **Vercel Settings → Environment Variables**:
   - Добавить `SUPABASE_SERVICE_ROLE_KEY` = service_role key из
     Supabase Dashboard (API → service_role, secret). Не
     `NEXT_PUBLIC_*`.
   - Убедись, что этот же ключ есть в локальном `.env.local`.
3. **Применить миграцию 024** через Supabase SQL Editor или
   `supabase db push`. С этого момента прод не принимает анонов.
4. **Локально запустить seed-owner**:
   ```
   cd mat-ucheniya
   npm install
   npm run seed-owner -- --login admin --password mol42totalpartykill --campaign mat-ucheniya
   ```
   Owner создаётся с must_change_password=false (ты сам пароль
   вводил).
5. **Деплой**: git push (уже сделан в этом чате) → Vercel соберёт.
6. **QA на проде**:
   - `https://mother-of-learning.vercel.app` → редирект на `/login`.
   - Войти как `admin` + пароль → попасть на `/c/mat-ucheniya/catalog`.
   - Все 150+ существующих нод на месте.
   - Клик по имени «admin» в хедере → `/account` → можно сменить пароль.
   - «Выйти» → `/login`.
   - Открыть приватное окно → `/c/mat-ucheniya/catalog` → редирект
     на `/login`.

Подробности в `mat-ucheniya/supabase/migrations/024_DEPLOY_GUIDE.md`.

## Что сделано в этом чате (chat 22, 2026-04-19)

### Spec-006 инкремент 2: страница /members для owner'а ✅

Owner'ы теперь создают ДМов через UI, не через CLI. Без секции настроек
Supabase и без консоли. Пароль, введённый owner'ом при создании, — это
**одноразовый одноразовый пароль**: `must_change_password=true`
выставляется автоматически, и при первом логине middleware отправит
пользователя на `/onboarding`.

**Новое:**

- **`app/c/[slug]/members/actions.ts`** — 4 Server Actions за
  `requireOwner(slug)`-гейтом:
  - `createMemberAction(slug, prev, fd)` — создаёт auth-юзера через
    `admin.auth.admin.createUser({ email_confirm: true })`, профиль с
    `must_change_password=true`, инсертит `campaign_members` с `role='dm'`.
    В инкременте 2 UI разрешает только 'dm'. Если login уже существует
    (юзер в другой кампании) — не перезаписываем пароль, просто
    добавляем membership.
  - `resetPasswordAction(slug, prev, fd)` — admin.updateUserById +
    set `must_change_password=true` в user_profiles. Next login →
    onboarding.
  - `removeMemberAction(slug, prev, fd)` — delete из campaign_members.
    Auth-юзер не удаляется (может быть в других кампаниях). Блокирует
    self-removal и удаление owner'а.
  - `updateMemberRoleAction(slug, prev, fd)` — смена роли dm↔player.
    Запрещает менять роль owner'а. UI пока не подключён (пригодится
    в инкременте 3 для превращения dm→player).

- **`app/c/[slug]/members/page.tsx`** — Server Component. Gate:
  `requireAuth()` + `getMembership()` → если `role !== 'owner'`
  редирект на `/c/[slug]/catalog`. Загружает список через service-role
  client (чтобы видеть всех, а не только себя через RLS). Джоин
  `campaign_members × user_profiles` с обработкой обеих форм (Supabase
  иногда возвращает embed как массив).

- **`app/c/[slug]/members/members-client.tsx`** (~380 строк):
  - Блок «Добавить ДМа» — useActionState, форма login+password, ресет
    на success, role скрытый = 'dm'.
  - Таблица с роль-бейджами (Владелец/ДМ/Игрок), флагом
    «сменит пароль», меткой «это вы».
  - Кнопка «Сбросить пароль» раскрывает inline-форму в
    расширенной строке (<tr colSpan=4>).
  - Кнопка «Удалить» → confirm-inline форма (Да/Нет).
  - Все формы на `useActionState`, error/success плашки, revalidate
    через `revalidatePath` в actions.

- **`components/nav-tabs.tsx`** — TABS расширен полем `ownerOnly?`.
  `NavTabs` принимает `isOwner` проп и фильтрует вкладки. «Участники»
  (👥) и «Настройки» (⚙️) помечены ownerOnly.

- **`app/c/[slug]/layout.tsx`** — передаёт
  `isOwner={membership.role === 'owner'}` в NavTabs.

### Важно про безопасность

- Все 4 Server Actions вызывают `requireOwner(slug)` в начале. Даже
  если кто-то подделает form submit без хождения по UI, без owner-роли
  action вернёт «Нет прав».
- Страница `/members` сама по себе 403 для не-owner'а (редирект на
  catalog).
- Service-role client используется **только** на сервере (импорт
  `import 'server-only'` в `lib/supabase/admin.ts` крашит билд при
  утечке в клиентский бандл).
- Уникальный индекс `idx_campaign_members_one_owner` в миграции 024
  гарантирует, что через UI нельзя создать второго owner'а даже если
  action бы пропустил.

### Build + commit

- `npm run build` — чисто. Turbopack, TS 0 ошибок.
- Новый роут: `ƒ /c/[slug]/members`.
- Коммит: `b22-spec-006-increment-2-members` в main, push (пойдёт после
  подтверждения пользователя).

## ⚠️ Действия для пользователя (chat 22)

Миграций нет, новых env vars нет. Только деплой и ручное тестирование.

1. **Pull + deploy** → Vercel авто-соберёт.
2. **QA на проде** (`https://mother-of-learning.vercel.app`):
   - Залогинься как `admin` → в навбаре появилась вкладка 👥 «Участники».
   - Открой `/c/mat-ucheniya/members` → таблица на 1 строку (сам owner).
     Кнопок действий на себя нет, метка «это вы».
   - Создай ДМа: логин `test_dm`, пароль `testpass123` → успех, в
     таблице появилась строка с бейджем «ДМ» и тегом «сменит пароль».
   - Выйди, войди как `test_dm` / `testpass123` → автоматический
     редирект на `/onboarding`. Смени пароль на что-то своё.
   - Вернись в админ-аккаунт → зайди в `/members` → у `test_dm`
     тега «сменит пароль» больше нет.
   - Нажми «Сбросить пароль» у `test_dm`, введи новый одноразовый →
     успех, тег «сменит пароль» вернулся.
   - Нажми «Удалить» → «Да» → строка исчезла.
   - Попробуй зайти в `/c/mat-ucheniya/members` как не-owner (через
     приватное окно с другого логина, если есть) → редирект на catalog.

## Что сделано в этом чате (chat 23, 2026-04-19)

### Spec-006 инкремент 3: игроки + привязка к PC ✅

Третий инкремент auth-блока. Теперь в кампании может быть и игрок. Владелец/ДМ
создают игрока одним шагом и опционально сразу привязывают к существующей
PC-ноде. На карточке персонажа появилась секция «Владелец» с тремя режимами
видимости. Страницы `/members` и `/settings` открыты всем членам read-only.

**Миграций нет.** Колонка `nodes.owner_user_id` и RLS уже были в миграции 024.
Жёсткие RLS-гейты на edit и `/api/nodes/[id]` специально НЕ ставятся — придут
в инкременте 4 одним пакетом с `visibility='public'|'dm_only'` и флипом
`canEdit` в page.tsx.

### Что написано

- **`components/nav-tabs.tsx`** + **`app/c/[slug]/layout.tsx`** — снят флаг
  `managerOnly` с вкладок «Участники» и «Настройки», удалён проп `isManager`.
  Все 6 вкладок видны всем членам кампании. Write-гейты переехали внутрь
  страниц.

- **`app/c/[slug]/members/actions.ts`**:
  - `createMemberAction` теперь принимает `role='player'` и опциональный
    `bind_pc_id`. Если `player + bind_pc_id` — после insert в
    `campaign_members` делает UPDATE `nodes.owner_user_id` с валидацией
    (type=character, campaign_id совпадает, owner был NULL). Partial-success:
    если bind упал, пользователь создан и в success-плашке префикс `⚠`
    с причиной.
  - Новый **`bindPcOwnerAction(slug, _prev, fd)`**: поля `node_id` +
    `user_id` (либо `__none__`/'' для unbind). Гейт `requireManager`.
    Валидация: нода найдена в этой кампании, `type.slug === 'character'`;
    если binding — target user член этой кампании.
    `revalidatePath(\`/c/[slug]/catalog/[node_id]\`)`.

- **`app/c/[slug]/members/page.tsx`** — снят редирект для player'а; только
  `requireAuth + getMembership` → если не член, `notFound()` (layout уже
  защитил). `canManage = role in (owner,dm)`. `unboundPcs` подгружается
  только для менеджеров: через `node_types.slug='character'` → `nodes`
  с `type_id` и `owner_user_id IS NULL`. В заголовок/подзаголовок
  два варианта текста в зависимости от canManage.

- **`app/c/[slug]/members/members-client.tsx`**:
  - `CreateMemberBlock` рендерится только при `canManage`.
  - В форме `<select name="role">` c опциями `dm`/`player`. При role=player
    под формой во второй строке `<select name="bind_pc_id">` с опцией
    «— не привязывать —» (`__none__`) + список `unboundPcs`. Если список
    пуст — подсказка «Нет свободных PC-нод».
  - `ChangeRoleButton` — новая кнопка dm↔player через
    `updateMemberRoleAction`. Показывается только для не-owner и не-self
    строк. Заголовок кнопки меняется: «Сделать ДМом» / «Сделать игроком».
  - Таблица: колонка «Действия» полностью скрыта если `!canManage`
    (и в `<thead>`, и в `<tbody>`). `colSpan` раскрывающейся строки
    reset-password динамический.

- **`components/node-owner-section.tsx`** (новый, client) — секция
  «Владелец» для PC-карточек. Три режима по роли:
  - **`manage`** (owner/dm): карточка с текущим владельцем и кнопкой
    «Назначить»/«Сменить». По клику — inline-форма с `<select>` игроков
    кампании + «не назначен», submit через `bindPcOwnerAction`.
  - **`self-read`** (player на своём PC): login владельца + бейдж «это вы»,
    без редактирования.
  - **`hidden`** (player на чужом PC): `return null` до рендера.

- **`components/node-detail.tsx`**:
  - Импорт `NodeOwnerSection` + `OwnerContext`.
  - Новые пропы `ownerContext?: OwnerContext` и `canEdit?: boolean`
    (default true — инфраструктура на инкр. 4).
  - Рендер `<NodeOwnerSection>` между fields-блоком и markdown-контентом
    при `node.type.slug === 'character' && ownerContext`.
  - Обёртки `{canEdit && ...}`:
    - кнопки «Редактировать» / «Удалить» в хедере;
    - крестики удаления на тегах и поле `+ тег` (пилюли тегов остаются
      видимыми read-only);
    - кнопка «+ Добавить связь» и раскрывающаяся `CreateEdgeForm`.
  - В инкременте 3 из всех call-site'ов приходит `canEdit={true}`, флаг
    пока не активируется — это задел под инкр. 4.

- **`app/c/[slug]/catalog/[id]/page.tsx`**:
  - `requireAuth()` + `getMembership()` + `redirect('/')` если не член.
  - В select ноды добавлен `owner_user_id`.
  - Если `type.slug === 'character'` — через `createAdminClient`
    загружается `ownerLogin` (по `owner_user_id`) и список `players`
    (campaign_members с role='player' + профили, отсортированы по login).
    Собранный `ownerContext` уходит в `<NodeDetail>`.
  - Передаётся `canEdit={true}` — всем членам (блокировка для игроков — в
    инкр. 4).

- **`app/c/[slug]/settings/page.tsx`** + **`actions.ts`**:
  - Page: `requireAuth` + `getMembership` + `redirect('/')` если не член.
    `canEdit = role in (owner,dm)`. У radio-опций `disabled={!canEdit}`,
    cursor `not-allowed` при !canEdit. Кнопка «Сохранить» скрыта; вместо
    неё подпись «Только для чтения. Изменениями занимается владелец или ДМ».
  - Actions: `updateCampaignHpMethod` теперь вызывает
    `getCurrentUserAndProfile` + `getMembership` и silent-return'ит если
    не owner/dm (defence in depth — UI уже спрятал кнопку). `requireAuth`
    не используется, т.к. он бросает `redirect()` — в server action это
    нежелательно, silent-fail предпочтительнее.

### Что НЕ трогали (сознательно — ждёт инкр. 4)

- `app/c/[slug]/catalog/[id]/edit/page.tsx` — открыт всем членам.
- `app/api/nodes/[id]/route.ts` — RLS защитит, но в инкр. 3 RLS для
  players ещё открыт (они в кампании → is_member → полный доступ).
- Игрок в инкр. 3 видит и использует весь остальной функционал: каталог,
  создание/редактирование/удаление нод, связи, теги, энкаунтеры,
  трекер. Блокировки придут пакетом в инкр. 4.

### Build + commit

- `npm run build` — 32.1s Turbopack, TypeScript 15.9s, 0 ошибок.
- Routes: `ƒ /c/[slug]/members`, `ƒ /c/[slug]/settings`, `ƒ /c/[slug]/catalog/[id]` — все на месте.
- Коммит: `b23-spec-006-increment-3-players-pc-ownership` в main, push.

## ⚠️ Действия для пользователя (chat 23)

**Миграций нет, новых env vars нет.** Только pull + deploy + ручное QA.

1. **Pull + deploy** → Vercel авто-соберёт.
2. **QA на проде** (`https://mother-of-learning.vercel.app`):
   - Залогинься как `admin` → `/members`.
   - Создай игрока: логин `test_player`, пароль `playpass123`, роль
     «Игрок». Если в кампании есть свободные PC-ноды — появится второй
     select «Привязать к PC». Выбери «— не привязывать —» и создай.
   - В таблице появилась строка с бейджем «Игрок» и тегом «сменит пароль».
     Кнопки: «Сделать ДМом», «Сбросить пароль», «Удалить».
   - Открой любую PC-ноду в каталоге (character-тип) → между fields-блоком
     и markdown'ом появилась секция «Владелец». Если владельца нет —
     «— не назначен —» + кнопка «Назначить». Нажми → выбери `test_player`
     → «Сохранить» → строка сменилась на `test_player`. Нажми «Сменить» →
     выбери «— не назначен —» → Сохранить → unbind.
   - Снова назначь владельцем `test_player`. Выйди, войди как
     `test_player` / `playpass123` → попал на `/onboarding` → смени пароль.
   - После онбординга:
     - Каталог доступен, список нод виден.
     - `/c/mat-ucheniya/members` доступен, но кнопок создания/изменения
       НЕТ (колонка «Действия» скрыта, блок «Добавить участника» тоже).
       Таблица на месте.
     - `/c/mat-ucheniya/settings` доступен, radio показывают текущий
       метод HP, но задизэйблены и нет кнопки «Сохранить» — вместо неё
       подпись «Только для чтения…».
     - На «своём» PC (на который назначили владельцем) секция «Владелец»
       видна: логин + бейдж «это вы», без редактирования.
     - На чужих PC-нодах секция «Владелец» НЕ появляется (return null).
   - Важно: в инкр. 3 игрок всё ещё может нажать «Редактировать»,
     «Удалить», править теги, создавать связи, лазить в trackerы —
     это ОЖИДАЕМО. Жёсткие гейты придут в инкр. 4 (RLS + условный UI
     + `canEdit={false}` для игроков).
3. **Вернись в admin** → на PC, где выставил владельцем `test_player`,
   секция «Владелец» показывает `test_player` без бейджа «это вы».
   Нажми «Сменить» → можно переприсвоить или снять.

## Что сделано в этом чате (chat 23.5, 2026-04-19)

### Spec-006 инкр. 3.5: переход на many-to-many PC ownership ✅

После инкремента 3 выяснилось, что single-owner не покрывает кейсы: «общий»
персонаж (Зак — за него может играть любой, кто читал книгу) и временное
одалживание PC (Миша дал Варваре на сессию). Вместо усложнения со
«claim-ами на сессию» — перешли на простую many-to-many модель. ДМ рулит
всеми владельцами: хоть 1, хоть 10.

### Миграция 027

**`supabase/migrations/027_node_pc_owners.sql`**:
- Таблица `node_pc_owners (node_id uuid FK nodes, user_id uuid FK auth.users,
  created_at, PK(node_id,user_id))` с каскадным DELETE.
- Индексы по user_id и node_id.
- Data migration: `INSERT SELECT id, owner_user_id FROM nodes WHERE
  owner_user_id IS NOT NULL ON CONFLICT DO NOTHING` — существующие
  владельцы переезжают без потерь.
- Удаляется колонка `nodes.owner_user_id` (идемпотентно через
  information_schema check).
- RLS: `SELECT` — все члены кампании (игрок видит соигроков), `MODIFY` —
  только owner/dm (через `is_dm_or_owner` по `nodes.campaign_id`).

### Код

- **`app/c/[slug]/members/actions.ts`**:
  - `bindPcOwnerAction` → **удалён**.
  - Новые **`addPcOwnerAction`** / **`removePcOwnerAction`**:
    гейт requireManager, валидация (type=character, campaign совпадает,
    target — член кампании), idempotent upsert на `node_pc_owners`.
  - `createMemberAction` с `bind_pc_id` теперь делает upsert в
    `node_pc_owners` (вместо UPDATE `nodes.owner_user_id`).

- **`app/c/[slug]/members/page.tsx`** + **`members-client.tsx`**:
  `unboundPcs` → `availablePcs` (показываем все PC, ведь у них теперь
  может быть любое число владельцев, концепта «свободный» больше нет).

- **`components/node-owner-section.tsx`** переписан:
  - `OwnerContext` теперь `{ viewerRole, viewerUserId, owners[], players[] }`
    вместо `ownerUserId/ownerLogin` (без единственного числа).
  - Три режима:
    - **manage** (owner/dm): список владельцев с крестиком «×» на каждом
      (removePcOwner), плюс форма «+ Добавить владельца» с dropdown
      игроков, которые ещё не в списке.
    - **self-read** (player, который среди владельцев): тот же список,
      бейдж «это вы» на своей строке, без крестиков.
    - **hidden** (player, которого нет в owners): `return null`.
  - Заголовок секции динамический: «Владелец» / «Владельцы» по длине.
  - Пустой список: курсивное «— не назначен —».

- **`app/c/[slug]/catalog/[id]/page.tsx`**:
  - `nodes.owner_user_id` из select убран (колонки больше нет).
  - Для character-нод грузятся `node_pc_owners → user_profiles` +
    players кампании, объединённый в `owners[]` и `players[]`
    через один запрос `user_profiles.in(profileIds)`.

### Build + commit

- `npm run build` — чисто, 0 TS ошибок.
- Коммит `b23-spec-006-increment-3.5-many-to-many-ownership` в main, push.

## ⚠️ Действия для пользователя (chat 23.5)

**Миграция 027 обязательна!** Без неё код сломается — он ожидает таблицу
`node_pc_owners` и отсутствие `nodes.owner_user_id`.

1. **Применить миграцию 027** через Supabase SQL Editor или
   `supabase db push`. Миграция идемпотентна: создаст таблицу, перенесёт
   существующих владельцев (их пока 0–1 после chat 23), удалит старую
   колонку.
2. **Deploy** — git push уже сделан, Vercel соберёт автоматически.
3. **QA на проде**:
   - Открой любой PC в каталоге → секция «Владельцы» (или «Владелец»).
   - Если уже назначал владельца в chat 23 — он должен быть на месте
     (перенос данных в миграции).
   - Нажми «+ Добавить владельца» → выбери игрока → Сохранить → появляется
     вторая строка.
   - Нажми «×» напротив любого → владелец снят.
   - Добавь того же игрока повторно через форму — должен исчезнуть из
     dropdown'а (он уже владелец).
   - Войди как player, который co-owner → на этом PC видит секцию
     с обоими владельцами + бейдж «это вы» на своей строке, крестиков нет.
   - Открой PC, где этот player НЕ владелец → секции «Владельцы» нет.

## Что сделано в этом чате (chat 24, 2026-04-19)

### Spec-006 инкр. 4 (финал): игрок не правит чужое ✅

Закрываем spec-006. Игроки могут всё читать, но править — только свои
PC-ноды (там, где они в `node_pc_owners`). Ноды типа npc/location/spell/
encounter и чужие PC — read-only. Создавать/удалять ноды могут только
owner/dm. Идея «скрытые DM-зоны» отправлена в бэклог — сейчас у проекта
секретов нет.

### Миграция 028

**`supabase/migrations/028_player_edit_own_pc.sql`**:
- SQL-хелпер `can_edit_node(p_node_id uuid)` → true если (owner/dm)
  ИЛИ (player состоит в `node_pc_owners` и нода — `character`).
  SECURITY DEFINER, search_path=public.
- **nodes**: старая `nodes_modify` заменена на раздельные политики
  `nodes_update` (через `can_edit_node`), `nodes_insert` и `nodes_delete`
  (оба — только `is_dm_or_owner`). Итого: player правит свои PC, не
  удаляет и не создаёт.
- **edges**: раздельные INSERT/UPDATE/DELETE. Разрешены если
  `is_dm_or_owner` ИЛИ `can_edit_node(source_id)` ИЛИ
  `can_edit_node(target_id)`. Игрок строит связи от/к своим PC.
- **chronicles**: аналогично. Разрешены если `is_dm_or_owner` ИЛИ
  `node_id is not null AND can_edit_node(node_id)`. Campaign-wide
  хроники (`node_id IS NULL`) — только менеджеры.

### Код

- **`lib/auth.ts`** — функция `canEditNode(nodeId, campaignId, userId, role)`
  как server-side зеркало SQL-хелпера. Используется для чистых 403
  в API-роутах и скрытия UI до любого запроса к БД.

- **`app/c/[slug]/catalog/[id]/page.tsx`**: `canEdit` вычисляется из
  роли + списка владельцев (для character-нод). Не нужен лишний запрос —
  ownerContext уже всё знает. Передаётся в `<NodeDetail>` — обёртки
  `{canEdit && ...}` из инкр. 3 активируются для player'ов.

- **`app/c/[slug]/catalog/[id]/edit/page.tsx`**: перед рендером формы
  зовёт `canEditNode`. Если false → `redirect(view)`. Player не может
  открыть `/edit` для чужой ноды, даже если перешёл по прямой ссылке.

- **`app/c/[slug]/catalog/new/page.tsx`**: `requireAuth + getMembership`,
  player → `redirect(catalog)`.

- **`app/c/[slug]/layout.tsx`**: `isManager` вычислен, кнопка «+ Создать»
  в хедере обёрнута в `{isManager && ...}`. Игрок не видит её.

- **`app/api/nodes/[id]/route.ts`**: PATCH зовёт `canEditNode`, DELETE
  — `role in (owner,dm)`. 401 если не аутентифицирован, 403 если нет
  прав, 404 если ноды нет.

- **`app/api/nodes/[id]/content/route.ts`**: PUT зовёт `canEditNode`.

- **`app/api/chronicles/route.ts`**: POST — менеджер ИЛИ player с
  `canEditNode(node_id)`. Привязка к node_id обязательна для
  игроков (campaign-wide только менеджерам).

- **`app/api/chronicles/[id]/route.ts`**: PUT/DELETE через общий
  gate-хелпер `gateChronicle(id)` — подтягивает `campaign_id`+`node_id`,
  проверяет членство и права, возвращает 401/403/404 либо allowed.

### Что осталось НЕ закрыто (осознанно)

- **Визибилити `dm_only`** — в бэклог (IDEA-034). В проекте пока нет
  секретов, добавим когда понадобится.
- **Encounter tables** (`encounters`, `encounter_participants`, …) —
  остались owner/dm-only. Игрок не ведёт бой через UI. Если в будущем
  понадобится «player-view трекера» — это spec-007 этап 5 (мобилка).
- **Edit-страница других типов** (loops, sessions) — гейты на запись
  через RLS срабатывают, но UI-кнопки не обёрнуты в `canEdit`. Игроки
  просто получат ошибку при попытке сохранить. Приведём к единой
  модели когда перенесём эти страницы на тот же паттерн (следом за
  мобилкой).

### Build

- `npm run build` — чисто, 22.6s, 0 TS ошибок.
- Коммит `b24-spec-006-increment-4-player-rls` в main, push.

## ⚠️ Действия для пользователя (chat 24)

**Миграция 028 обязательна до деплоя** — без неё код клиента будет
работать (UI-гейты чистые), но игрок теоретически сможет слать прямые
запросы без серверной защиты. Запустить в Supabase SQL Editor.

1. **Применить миграцию 028**. Идемпотентна: drop+create policies.
2. **Deploy** — git push уже сделан, Vercel соберёт автоматически.
3. **QA на проде** (войди как admin и как player):
   - **Admin**: всё работает как раньше. Кнопка «+ Создать» видна.
     `/members`, `/settings` с управлением.
   - **Player, у которого есть PC в `node_pc_owners`**:
     - Кнопка «+ Создать» в хедере отсутствует.
     - Открой `/catalog/new` по прямому URL → редирект на `/catalog`.
     - Открой **чужой** PC → кнопки «Редактировать»/«Удалить» нет,
       пилюли тегов без крестиков, поля «+ тег» нет, кнопки
       «+ Добавить связь» нет. Секция «Владельцы» НЕ отображается.
     - Открой **свой** PC → все кнопки на месте, можно править
       теги/описание/связи/хроники. Секция «Владельцы» показана
       с бейджем «это вы» на своей строке, без крестиков (removePcOwner
       — только для менеджеров).
     - Попробуй `/catalog/[чужой-id]/edit` по прямому URL → редирект
       на view.
     - Open DevTools → сделай руками `fetch('/api/nodes/{id-чужой}',
       { method: 'DELETE' })` → 403.
     - Open DevTools → `fetch('/api/nodes/{id-чужой}', { method: 'PATCH',
       body: JSON.stringify({fields: {tags: ['хак']}}), headers:
       {'Content-Type': 'application/json'} })` → 403.
   - **Player без PC**: всё read-only, никаких кнопок редактирования
     нигде. Секция «Владельцы» на всех PC скрыта.

На этом **spec-006 закрыта** полностью. Auth + роли + ownership + гейты
на запись — всё готово.

## Следующая задача

### Priority 1: spec-006 инкремент 4 — RLS для игроков + condition UI
- Миграция: добавить `nodes.visibility enum('public','dm_only')` DEFAULT
  'public' для секретных DM-зон. Обновить `nodes_select` policy:
  player видит ноды со `visibility='public'` ИЛИ где он owner.
  Owner/dm видят всё.
- `nodes_modify` policy для player'а: UPDATE только своей character-ноды
  (where `owner_user_id = auth.uid() and type=character`). Никакого
  INSERT/DELETE.
- В `app/c/[slug]/catalog/[id]/page.tsx` вычислять `canEdit` на сервере:
  `canEdit = isManager || (isPlayer && node.owner_user_id === user.id)`.
  Передавать в `<NodeDetail>`.
- `app/c/[slug]/catalog/[id]/edit/page.tsx`: гейт по canEdit, иначе 403.
- `api/nodes/[id]/route.ts`: явный server-side check по роли/owner'у,
  даже если RLS пропустит.
- UI: скрыть кнопку «Создать» в хедере у игроков (кроме случая, когда
  мы решим разрешить создавать что-то — в v4 пока не разрешаем).

После инкр. 4 spec-006 закрыта. Играбельная игра для игроков.

### Priority 1: spec-006 инкремент 2 — приглашение ДМов
Страница `/c/[slug]/members` для owner'а. Server Actions:
- `createMember(login, password, role)` — через admin API, роль
  ограничена 'dm' в этом инкременте (игроки в инкременте 3).
- `resetPassword(user_id, new_password)` — сброс с установкой
  must_change_password=true.
- `removeMember(user_id)` — удаляет из campaign_members (auth-юзер
  остаётся, т.к. может быть в других кампаниях).
- `updateMemberRole(user_id, role)` — смена роли.

UI: таблица членов (логин, роль, дата добавления, действия),
форма добавления. Блок удаления owner'ом самого себя.

### Priority 2: spec-006 инкремент 3 — игроки + привязка к PC
Расширение /members ролью player + выбор PC-ноды при создании.
UI на карточке PC: секция «Владелец» с dropdown.

### Priority 3: spec-006 инкремент 4 — RLS для игроков + условный UI
Жёсткие политики (владелец PC может UPDATE свою character-ноду).
UI прячет create/edit/delete от игроков. Настройки/участники
скрыты от не-owner'ов. После этого spec-006 закрыт.

### Priority 4: spec-007 этап 5 — мобилка игрока
Строится на готовой модели ролей и PC-ownership.

### Отложено (вернуться после auth-блока)
- **Stage 4 трекера** (трекер трат action/bonus/movement) — по
  решению пользователя отложено, «ДМу пока тяжело контролить».
- **Этап 3 трекера** (общая панель реакций/легендарок) — отложено,
  возвращаемся в следующую доработку трекера после мобилки.

## Что сделано в этом чате (chat 18, 2026-04-19)

### Spec-007 этап 4 — stage 1: рестайл таблицы энкаунтера на design tokens ✅

Чисто визуальная переделка — без миграций, без новых колонок, без изменений логики. Цель была: привести грид к единому стилю с правой панелью статблока (которая уже на токенах), до того как добавлять AC/saves/SaveCounter и общую панель реакций.

**Затронутые файлы:**
- `components/encounter/encounter-grid.tsx` — таблица + header bar
- `components/encounter/editable-cell.tsx`
- `components/encounter/hp-cell.tsx`
- `components/encounter/tag-cell.tsx`

**Ключевые визуальные изменения:**
- Все цвета/тени/радиусы/focus-кольца через `var(--…)` токены из `globals.css`, Tailwind-arbitrary-values на токенах.
- **Turn row**: убрал `bg-yellow-50` → теперь `var(--blue-50)` + левый stripe 3px `var(--blue-500)` (через `box-shadow: inset 3px 0 0`). Жёлтый теперь зарезервирован под warning-семантику.
- **Selected row**: та же конструкция с `var(--blue-400)` stripe.
- **Down row**: `var(--red-50)` bg + line-through + red-700 name.
- **Inactive**: opacity 0.35.
- **Hover**: `var(--gray-50)` для обычных строк, не затирает turn/selected/down.
- **Density**: строки `py-1`, шрифт body `13px`, header `10px uppercase tracking-wider`. Числа — `font-mono` + `tabular-nums` (`.tabular` класс из globals).
- **HP bar**: высота уменьшена с 4px до 3px, цвета semantic (`--green-500` / `--amber-400` / `--red-500` / `--gray-300`), HP-числа `font-mono tabular`, slash мельче и мутнее.
- **Tag pills**: уменьшены до `11px`, `py-[1px]`, `var(--gray-100)` bg, red hover на удаление.
- **Tag dropdown**: токены + `var(--shadow-lg)`.
- **Editable-cell focus**: `1px var(--blue-500)` border + `var(--shadow-focus)` halo (blue-100 3px glow).
- **Table card**: всё обёрнуто в `rounded-[var(--radius-lg)]` border вокруг, внутренние borders — только `border-bottom` между строк через `var(--gray-100)`. Ячейки без собственных границ.
- **Header bar**: primary синий `var(--blue-600)` на «Следующий →», secondary серый `var(--gray-100)` на «← Предыдущий». Кнопка «Стоп» — border с красным hover.

**Что осталось работать без изменений** (проверено QA-чеклистом):
- Inline-редактирование имени / инициативы / HP (smart parse -10/+7/30/60) / temp HP
- Click по имени = inspect, double-click = rename (NameCell)
- Ctrl+Click / Shift+Click = bulk selection, изменения пропагируются
- TagCell portal-dropdown (не клипается overflow-контейнером)
- Кнопки «Клон / Удал.» в последнем столбце
- Floating «Выделено: N» pill
- Header bar с Сессия/Петля/День/Раунд/контролами хода

### Build + commit
- `npm run build` — 22.4s, TS 0 ошибок.
- Коммит `b18-restyle-encounter-grid-stage-1` в main, push.

## ⚠️ Действия для пользователя (chat 18)

1. **Деплой авто** через Vercel. Миграции не нужны.
2. **QA на проде** (`/c/mat-ucheniya/encounters/{id}` с живыми участниками):
   - Поехай между ходами стрелками → подсветка turn row теперь blue-50 + синий левый stripe (был жёлтый).
   - Ctrl+Click по нескольким строкам → все выделенные имеют blue-400 stripe слева, плюс floating pill внизу.
   - Нанеси урон через HP-клетку (`-10`) → бар стал тоньше (3px), цифры моно+tabular.
   - Добавь состояние → пилюля меньше, при hover становится красной.
   - Убей кого-нибудь (HP=0) → red-50 bg, имя перечёркнуто красным.
   - Статблок-панель справа и таблица визуально **в одной системе** (раньше панель была Clean-стайл, таблица — старый gray-200 + yellow).
3. Если что-то выглядит криво или функционал сломался — бекапы в `/tmp/backup-*.tsx` (в этой сессии), но файлы также в git до коммита `c553078`.

## Приоритеты

1. ~~Каталог~~ ✅
2. ~~Трекер v3~~ ✅
3. ~~Консоль событий инкр. 1-3~~ ✅
4. ~~UniversalSidebar~~ ✅
5. ~~Рефакторинг монстров-файлов~~ ✅
6. ~~Spec-007 этап 1: фундамент статблоков~~ ✅
7. ~~Spec-007 этап 2: правая панель~~ ✅
8. ~~Spec-007 этап 4 stage 1: рестайл на design tokens~~ ✅
9. ~~Spec-007 этап 4 stage 2: AC + death saves + # + role dot~~ ✅
10. ~~Spec-007 этап 4 stage 3: PillEditor~~ ✅
11. ~~Spec-006 инкремент 1: auth фундамент~~ ✅
12. ~~Spec-006 инкремент 2: /members для owner~~ ✅
13. ~~Spec-006 инкремент 3: игроки + привязка к PC~~ ✅
14. ~~Spec-006 инкремент 3.5: many-to-many ownership~~ ✅
15. ~~Spec-006 инкремент 4: RLS для игроков~~ ✅
16. **→ Импорт таблицы «Факультативы» из Excel** (следующий чат)
17. Spec-007 этап 5: мобилка игрока
15. Spec-007 этап 5: мобилка игрока
16. Spec-007 этап 4 stage 4: трекер трат на ход (отложено по решению)
17. Spec-007 этап 3: общая панель реакций/легендарок (отложено)
18. Spec-007 этап 4 stage 5: расширение PillEditor (rename, color)
19. IDEA-029 Spells + slots (ждёт auth, большая фича)
20. Импорт из Google Sheets (таблицы персонажей)
21. Лог вне боя (IDEA-026 инкремент 4)

## Файлы памяти

- `.specify/memory/constitution-v3-draft.md` — черновик конституции v3
- `.specify/memory/encounter-tracker-v1-retrospective.md`
- `.specify/memory/character-sheet-excel-system.md`
- `mat-ucheniya/scripts/README.md` — как пользоваться parse_srd.py

## Стек и окружение

- Next.js 16 (App Router) + Supabase + Tailwind v4
- Vercel: https://mother-of-learning.vercel.app/
- GitHub: https://github.com/Novoandrey/mother-of-learning
- Кампания: slug `mat-ucheniya`
- Рабочая директория в репо: `mat-ucheniya/`
- **Новые зависимости (chat 10)**: `lucide-react`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать
- СДВГ: одна задача за раз, выбирай лучший вариант сам
- Файлы миграций: отдавать пользователю через present_files
- В конце чата: обновить NEXT.md и backlog.md, закоммитить
- Правило переноса: если есть система — сначала перенеси как есть, потом улучшай
- Хардкод-аудит: при любом новом компоненте проверять на строковые константы
  под конкретную кампанию; выносить в функции с TODO-ссылкой на backlog

# NEXT — контекст для следующего чата

> Этот файл обновляется в конце каждого чата. Всегда актуален.
> Last updated: 2026-04-19 (chat 14 — UX-правки + action resolve flow)

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

## ⚠️ Действия для пользователя

1. **Деплой авто** через Vercel, миграции не нужно накатывать.
2. **QA:**
   - Настройки: сохранить → зелёная плашка `✓ Сохранено` видна.
   - Кликнуть в первый столбец строки → таблица не едет вниз, внизу экрана pill "Выделено: N".
   - Кликнуть в ячейку "Условия" → сразу выпадает список всех condition'ов кампании.
   - Правый столбец → `⋯` → меню с тремя понятными пунктами.
   - Атака моба: клик по "Bite" → picker цели → после выбора **resolve dialog** с полями урона/заметки → Apply → запись в логе + HP у цели уменьшилось без reload.
   - Self-action (Spellcasting и т.п.) → сразу resolve без picker.

## Следующая задача

### Priority 1: spec-007 этап 3 (общая панель реакций/легендарок)
Агрегат по всем живым не-активным участникам: "кто может среагировать". Секция над правой панелью или внизу грида.

### Priority 2: spec-007 этап 4 (Excel-like grid polish — редизайн грида)
По дизайну Claude Design — 9 колонок (# | Ин. | Имя | HP | Врем | AC | Состояния | Эффекты | Спасы), `#` = bulk-select, inline-редактирование всех ячеек, PillEditor ClickUp-style для conditions/effects, SaveCounter для death saves. **Требует миграцию** для `ac` и `saves` в `encounter_participants` (или взять `ac` из `node.fields`), и big refactor `encounter-grid.tsx`.

## Приоритеты

1. ~~Каталог~~ ✅
2. ~~Трекер v3~~ ✅
3. ~~Консоль событий инкр. 1-3~~ ✅
4. ~~UniversalSidebar~~ ✅
5. ~~Рефакторинг монстров-файлов~~ ✅
6. ~~Spec-007 этап 1: фундамент статблоков~~ ✅
7. ~~Spec-007 этап 2: правая панель~~ ✅
8. **→ Spec-007 этап 3: общая панель реакций/легендарок**
9. Spec-007 этап 4: Excel-like grid polish (редизайн грида по дизайну Claude Design)
10. Логины + RLS (spec-006-auth)
11. Spec-007 этап 5: мобилка игрока (IDEA-017)
12. IDEA-029 Spells + slots (ждёт логины, большая фича)
13. Импорт из Google Sheets (таблицы персонажей)
14. Лог вне боя (IDEA-026 инкремент 4)

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

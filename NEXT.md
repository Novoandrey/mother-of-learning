# NEXT — контекст для следующего чата

> Этот файл обновляется в конце каждого чата. Всегда актуален.
> Last updated: 2026-04-19 (chat 10 — дизайн-хэндофф spec-007 этап 2)

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

## ⚠️ НЕ ДОПИСАНО в этом чате

1. **В `encounter-grid.tsx`** prop `onParticipantsChange` добавлен в тип, но НЕ задестрактурен в сигнатуре и НЕ подключён к useEffect. Без этого панель будет показывать **stale HP/conditions** — надо обновлять страницу руками. Исправить в первую очередь:
   ```ts
   // В destructuring props:
   onAutoEvent,
   onActiveChange,
   onParticipantsChange,
   }, ref) {

   // После `setParticipants` definition, рядом с useEffect для turnId:
   useEffect(() => {
     onParticipantsChange?.(participants)
   }, [participants, onParticipantsChange])
   ```
2. **`npm run build` не запускался** — могут быть TS-ошибки.
3. **Миграции 018, 019, 020 — применить в Supabase** через SQL Editor. Все идемпотентны.

## ⚠️ Действия для пользователя

1. **Применить миграцию 020** в Supabase SQL Editor (счётчики реакций/легендарок).
2. Убедиться, что 018 и 019 уже применены (если нет — применить).
3. Открыть `/c/mat-ucheniya/encounters/[id]` с активным SRD-монстром — проверить правую панель.

## Следующая задача

### Priority 1: закрыть недоделку + build + deploy
1. Исправить `encounter-grid.tsx` (см. блок "НЕ ДОПИСАНО").
2. `npm run build` — починить типы.
3. Ручной QA: панель показывает активного участника, HP-бар живой, Tooltip работает, TargetPicker открывается на area actions, клик по action пишет запись в лог, counter сбрасывается при смене хода.
4. Deploy на Vercel, показать друзьям.

### Priority 2: spec-007 этап 3 (общая панель реакций/легендарок)
Агрегат по всем живым не-активным участникам: "кто может среагировать". Секция над правой панелью или внизу грида.

### Priority 3: spec-007 этап 4 (Excel-like grid polish — редизайн грида)
По дизайну Claude Design — 9 колонок (# | Ин. | Имя | HP | Врем | AC | Состояния | Эффекты | Спасы), `#` = bulk-select, inline-редактирование всех ячеек, PillEditor ClickUp-style для conditions/effects, SaveCounter для death saves. **Требует миграцию** для `ac` и `saves` в `encounter_participants` (или взять `ac` из `node.fields`), и big refactor `encounter-grid.tsx`.

## Приоритеты

1. ~~Каталог~~ ✅
2. ~~Трекер v3~~ ✅
3. ~~Консоль событий инкр. 1-3~~ ✅
4. ~~UniversalSidebar~~ ✅
5. ~~Рефакторинг монстров-файлов~~ ✅
6. ~~Spec-007 этап 1: фундамент статблоков~~ ✅
7. ~~Spec-007 этап 2: правая панель~~ ✅ (с недоделкой — см. выше)
8. **→ Закрыть недоделку + QA + deploy**
9. Spec-007 этап 3: общая панель реакций/легендарок
10. Spec-007 этап 4: Excel-like grid polish (редизайн грида по дизайну Claude Design)
11. Логины + RLS (spec-006-auth)
12. Spec-007 этап 5: мобилка игрока (IDEA-017)
13. IDEA-029 Spells + slots (ждёт логины, большая фича)
14. Импорт из Google Sheets (таблицы персонажей)
15. Лог вне боя (IDEA-026 инкремент 4)

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

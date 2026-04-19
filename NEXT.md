# NEXT — контекст для следующего чата

> Этот файл обновляется в конце каждого чата. Всегда актуален.
> Last updated: 2026-04-19 (chat 9, этап 1 трекера v4)

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

## Что сделано в этом чате (chat 9, 2026-04-19)

### Spec-007 этап 1: Фундамент статблоков ✅

Подготовка к трекеру энкаунтера v4 с полным статблоком справа.

- **Миграция 018**: расширен `default_fields` у `creature` и `npc` под полную структуру статблока. GIN-индекс `idx_nodes_fields_gin` на `nodes.fields` для фильтр-запросов.
- **Скрипт `scripts/parse_srd.py`**: парсит open5e-api SRD-2014 данные в наш формат. Классификация: `CreatureAction.action_type` маппится напрямую; traits с "as a bonus action" → bonus_actions, "its reaction" → reactions, "can use its action to" → actions; остальное в passives. Targeting детектится из desc ("each creature"/"cone"/"radius" → area).
- **Миграция 019**: seed 10 SRD монстров. Идемпотентный (ON CONFLICT DO UPDATE), стабильные UUID v5 от slug. Монстры: Goblin, Orc, Giant Spider, Troll, Mage, Medusa, Young Red Dragon, Adult Red Dragon (3 легендарки), Lich (4 легендарки), Vampire (3 легендарки + 5 passives). Теги `["srd", "canon", <type>]`.
- **scripts/README.md**: как перегенерить seed, как добавить монстров.

### Решения по spec-007 (трекер v4)

5 этапов, каждый играбелен:

1. ✅ **Этап 1 (фундамент)** — модель + данные
2. **Этап 2 (правая панель)** — actions/bonus/reactions/legendary/passives как кнопки, мульти-таргет пикер для area, hover-тултип с источником, счётчики used_reactions + legendary_used
3. **Этап 3 (общая панель реакций/легендарок)** — агрегат по всем живым не-активным участникам
4. **Этап 4 (Excel-like grid)** — клик=выделение, Tab/Enter, input без видимых рамок
5. **Логины + RLS** — инфра для мобилки (spec-006)
6. **Этап 5 (мобилка игрока)** — та же панель, персонифицированная

### Claude Design в процессе

Запускать ДО написания кода на этапах 2 и 4. Подключить к репе → мокап в слайдерах → handoff. Экономия — дни итераций UI.

## ⚠️ Действия для пользователя

1. **Применить миграцию 018** в Supabase SQL Editor (структура полей + GIN-индекс)
2. **Применить миграцию 019** в Supabase SQL Editor (10 SRD монстров). Идемпотентно.
3. **Проверить**: `/c/mat-ucheniya/catalog?type=creature` — должны появиться 10 SRD монстров с тегами `srd`, `canon`.

## Следующая задача

### Этап 2: Правая панель статблока в энкаунтере

**Перед кодом**: подключить Claude Design к репе, собрать мокап правой панели + мульти-таргет пикера + hover-тултипов. Итерировать в слайдерах. Только потом — код.

**Компоненты:**
- `components/statblock-panel.tsx` — контейнер справа от encounter-grid
- `components/statblock-section.tsx` — секция (Actions / Bonus / Reactions / Legendary / Passives) со сворачиванием
- `components/action-button.tsx` — кнопка действия с desc-тултипом и hover-источником
- `components/target-picker-dialog.tsx` — пикер целей для area/multi (чекбоксы участников)
- `hooks/use-statblock.ts` — агрегирует actions из node + предметов + эффектов

**Миграция 020** (возможно): `used_reactions`, `legendary_used` в `encounter_participants`. Сброс: used_reactions → начало хода, legendary_used → начало раунда.

**Интеграция с event log**: клик по кнопке → `logEvent({type:'action_used', actor, action_name, targets?})`.

## Приоритеты

1. ~~Каталог~~ ✅
2. ~~Трекер v3~~ ✅
3. ~~Консоль событий инкр. 1-3~~ ✅
4. ~~UniversalSidebar~~ ✅
5. ~~Рефакторинг монстров-файлов~~ ✅
6. ~~Spec-007 этап 1: фундамент статблоков~~ ✅
7. **→ Spec-007 этап 2: правая панель** (Claude Design → код)
8. Spec-007 этап 3: общая панель реакций/легендарок
9. Spec-007 этап 4: Excel-like grid polish
10. Логины + RLS (spec-006-auth)
11. Spec-007 этап 5: мобилка игрока (IDEA-017)
12. Импорт из Google Sheets (таблицы персонажей)
13. Лог вне боя (IDEA-026 инкремент 4)

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

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать
- СДВГ: одна задача за раз, выбирай лучший вариант сам
- Файлы миграций: отдавать пользователю через present_files
- В конце чата: обновить NEXT.md и backlog.md, закоммитить
- Правило переноса: если есть система — сначала перенеси как есть, потом улучшай

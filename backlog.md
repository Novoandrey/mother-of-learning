# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Feature-specific items live in `.specify/specs/NNN-*/backlog.md`.

Updated: 2026-04-15

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

### ~~IDEA-003~~ ✅ DONE Каталог-дерево в сайдбаре (Chronicler-style)
- Левый сайдбар: типы → ноды → вложенность через `contains`

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

### IDEA-019 Excel-горячие клавиши для трекера (Shift, Ctrl, массовое выделение)
- **Feature**: 005-encounter-tracker-v2 (расширение)
- Shift+Click: выделить диапазон строк
- Ctrl+Click: выделить несколько строк
- Массовое действие: урон всем выделенным, удалить выделенных, сменить роль
- Ctrl+Z: undo последнего действия (требует history stack)
- Ctrl+C / Ctrl+V: копировать/вставить участника
- Приоритет: после базового тестирования трекера v2

### IDEA-020 Широкий интерфейс ДМа (full-width layout)
- **Feature**: ui
- Трекер энкаунтера и рабочий стол ДМа должны занимать весь экран
- Убрать ограничение max-width для ДМ-режима
- Сайдбар слева (каталог), основная область — таблица во всю ширину
- Mobile: стандартный одноколоночный layout
- Связь: конституция v3 — "два режима" (ДМ = desktop-first, рабочий стол)

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

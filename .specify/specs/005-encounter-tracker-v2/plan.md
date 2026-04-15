# Implementation Plan: Трекер энкаунтера v2 — Excel-first

**Branch**: `005-encounter-tracker-v2` | **Date**: 2026-04-15 | **Spec**: spec.md

## Summary

Полная замена UI трекера энкаунтера. Схема БД и server actions
сохраняются. 13 компонентов (~2125 LOC) заменяются новым набором
с единой парадигмой "каждая ячейка — инпут". Ключевая идея:
editable grid вместо набора виджетов.

## Technical Context

**Stack**: Next.js 16 (App Router) + Supabase + Tailwind v4 (из spec-001)
**Storage**: Supabase Postgres — существующие таблицы, без миграций
**Testing**: Ручное тестирование по quickstart-сценариям
**Constraints**: Optimistic UI, автосохранение при blur/Enter/Tab

## Constitution Check

- ✅ Атомарность: encounter и participant — отдельные сущности (не меняем)
- ✅ Данные-первичны: та же модель данных, новый UI — просто другая линза
- ✅ Каждый релиз играбелен: после Phase 2 уже можно вести бой
- ✅ Простота стека: те же технологии, ничего нового
- ✅ Правило переноса: Excel = знакомая система, приближаемся к ней
- ✅ Единообразие UI: трекер перестаёт быть "особенным", использует STYLE.md

## Key Design Decisions

### 1. Editable Cell — единый примитив

Один компонент `EditableCell` — базовый кирпичик. Props: value,
onCommit, type (text/number/tags). По умолчанию показывает значение
как текст. По клику — становится инпутом. Enter/blur/Tab — commit.

### 2. Delta notation для HP

В ячейке HP пользователь вводит:
- `45` → прямая установка (current_hp = 45)
- `-14` → урон (current_hp -= 14, clamp к 0)
- `+7` → лечение (current_hp += 7, clamp к max_hp)

Парсинг: если строка начинается с `-` или `+` → дельта, иначе → прямое значение.

### 3. Tag Input для условий и эффектов

Ячейки условий и эффектов — это tag input. Показывают бейджики,
по клику открывают инпут с автокомплитом. Backspace удаляет
последний тег. Свободный ввод через Enter.

### 4. Табличный layout вместо flex-row

HTML `<table>` (или CSS grid с ролями `role="grid"`) для правильной
семантики и Tab-навигации. Каждая ячейка имеет tabIndex.

### 5. Сохраняем server actions

`lib/encounter-actions.ts` и `lib/template-actions.ts` переиспользуются.
Рефакторим минимально: если нужна новая функция — добавляем, старые
не трогаем пока работают.

## Source Structure

### Удаляемые файлы (v1 components)

```
components/
├── combat-tracker.tsx           # REPLACE → encounter-grid.tsx
├── participant-row.tsx          # REPLACE → встроено в grid
├── hp-control.tsx               # REPLACE → editable-cell с delta logic
├── initiative-input.tsx         # REPLACE → editable-cell type=number
├── condition-picker.tsx         # REPLACE → tag-cell с autocomplete
├── effect-picker.tsx            # REPLACE → tag-cell с autocomplete
├── role-selector.tsx            # REPLACE → editable-cell type=select
├── temp-hp-input.tsx            # REPLACE → editable-cell type=number
├── inline-add-row.tsx           # REPLACE → add-row в grid
├── catalog-panel.tsx            # REPLACE → встроено в add-row
├── encounter-details-card.tsx   # KEEP (переиспользовать)
├── encounter-list-page.tsx      # KEEP (минимальные правки)
├── save-as-template-button.tsx  # KEEP (переиспользовать)
```

### Новые файлы

```
components/encounter/
├── encounter-grid.tsx           # Главный компонент: таблица + состояние + handlers
├── editable-cell.tsx            # Универсальная редактируемая ячейка
├── hp-cell.tsx                  # Ячейка HP: delta notation + bar
├── tag-cell.tsx                 # Ячейка с тегами: условия, эффекты
├── add-participant-row.tsx      # Строка добавления с автокомплитом из каталога
└── encounter-header.tsx         # Заголовок: раунд, статус, кнопки
```

### Сохраняемые файлы (без изменений или минимально)

```
components/
├── encounter-details-card.tsx   # Перенести как есть
├── encounter-list-page.tsx      # Минимальные правки стилей
├── save-as-template-button.tsx  # Перенести как есть
├── party-bar.tsx                # Перенести как есть

lib/
├── encounter-actions.ts         # Переиспользуем все функции
├── template-actions.ts          # Переиспользуем все функции

app/c/[slug]/encounters/
├── page.tsx                     # Минимальные правки
└── [id]/page.tsx                # Импортировать EncounterGrid вместо CombatTracker
```

## Component Design

### EditableCell

```
Props:
  value: string | number
  onCommit: (newValue) => void
  type: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  className?: string

Behavior:
  Display mode: render value as text/span
  Click → Edit mode: render <input>, autoFocus, select all
  Enter / Tab → commit(value), switch to display mode
  Escape → revert, switch to display mode
  Blur → commit(value)
  Tab → commit + focus next cell (via native tabIndex)
```

### HpCell

```
Props:
  currentHp: number
  maxHp: number
  onHpChange: (newHp) => void
  onMaxHpChange: (maxHp, currentHp) => void
  disabled?: boolean

Behavior:
  Display: "45 / 60" + mini bar
  Click on current → edit with delta parsing
  Click on max → edit max directly
  Delta: "-14" → Math.max(0, current - 14)
          "+7" → Math.min(max, current + 7)
          "45" → set to 45 (clamp 0..max)
```

### TagCell

```
Props:
  tags: string[]
  suggestions: string[]
  onChange: (tags) => void
  placeholder?: string
  disabled?: boolean

Behavior:
  Display: badge chips
  Click → input appears at end, autocomplete dropdown
  Type → filter suggestions
  Enter → add tag (from suggestion or freetext)
  Backspace on empty → remove last tag
  Click badge → remove tag
```

### EncounterGrid

```
Props: same as current CombatTracker

State: encounter, participants (optimistic)
Handlers: all from encounter-actions.ts (reuse pattern)

Render:
  <EncounterHeader />
  <table> with CSS grid for alignment
    <thead> column headers
    <tbody> sorted participants
      Each row: role | initiative | name | conditions | effects | hp | temp_hp | actions
      Each cell: EditableCell / HpCell / TagCell
    </tbody>
    <tfoot> <AddParticipantRow />
  </table>
```

## Quickstart Scenarios

### Scenario 1: Полный бой (US1 + US2)
1. Открыть `/c/mat-ucheniya/encounters`
2. Создать "Бой в таверне"
3. В строке добавления вписать "Тролль" → автокомплит → выбрать → ×3
4. Добавить вручную "Бандит" (Enter без выбора из каталога)
5. Кликнуть на ячейку инициативы первого → 18 → Tab → 14 → Tab → ...
6. Кликнуть на HP Тролля-1 → ввести "-14" → HP уменьшается
7. Нажать "Следующий ход" → выделение перемещается
8. Повторить 3 раунда
9. Завершить бой

### Scenario 2: Условия и эффекты (US3)
1. Открыть существующий энкаунтер
2. Кликнуть на ячейку условий участника
3. Ввести "осл" → выбрать "Ослеплённый"
4. Кликнуть на ячейку эффектов → ввести "Щит Веры" → Enter
5. Бейджики видны в таблице
6. Кликнуть на бейджик → удалить

### Scenario 3: Обратная совместимость
1. Открыть существующий энкаунтер из v1 (с данными)
2. Все участники, HP, условия, эффекты отображаются корректно
3. Можно продолжить редактирование без проблем

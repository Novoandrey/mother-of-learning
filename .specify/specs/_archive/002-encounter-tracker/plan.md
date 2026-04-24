# Implementation Plan: Трекер энкаунтера — MVP

**Branch**: `002-encounter-tracker` | **Date**: 2026-04-13 | **Spec**: spec-002

## Summary

Добавить к существующему Next.js + Supabase приложению трекер боевых
энкаунтеров: две новые таблицы в Postgres, новый раздел UI с таблицей
участников, inline-редактированием инициативы и ХП.

## Technical Context

**Stack**: Next.js 14 (App Router) + Supabase + Tailwind (из spec-001)
**Storage**: Supabase Postgres — 2 новые таблицы
**Testing**: Ручное тестирование по quickstart-сценариям
**Constraints**: Optimistic UI для ХП/инициативы, автосохранение

## Constitution Check

- ✅ Атомарность: encounter и participant — отдельные сущности
- ✅ Данные-первичны: вся логика через SQL, UI — линза
- ✅ Каждый релиз играбелен: после Phase 3 уже можно вести бой
- ✅ Простота стека: те же Supabase + Next.js, ничего нового
- ✅ Универсальность: ничего специфичного для "Мать Учения" в коде

## Data Model

### encounters

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| campaign_id | uuid FK campaigns | NOT NULL |
| title | text | NOT NULL |
| status | text | 'active' / 'completed', DEFAULT 'active' |
| current_round | int | DEFAULT 0 |
| current_turn_id | uuid FK encounter_participants | nullable, кто ходит |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### encounter_participants

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| encounter_id | uuid FK encounters | CASCADE, NOT NULL |
| node_id | uuid FK nodes | nullable — привязка к каталогу |
| display_name | text | NOT NULL |
| initiative | numeric | nullable — null = скамейка |
| max_hp | int | DEFAULT 0 |
| current_hp | int | DEFAULT 0 |
| sort_order | int | DEFAULT 0, тайбрейкер |
| is_active | boolean | DEFAULT true |
| created_at | timestamptz | DEFAULT now() |

**Indexes**: encounter_id, node_id, (encounter_id, initiative DESC NULLS LAST, sort_order)

## Source Structure

```
app/c/[slug]/
├── layout.tsx                    # UPDATE: добавить навигацию "Энкаунтеры"
├── catalog/...                   # existing
└── encounters/
    ├── page.tsx                   # список энкаунтеров
    └── [id]/
        └── page.tsx              # страница боя

components/
├── ... existing ...
├── encounter-list-page.tsx       # список с кнопкой "Создать"
├── combat-tracker.tsx            # главная таблица боя + скамейка
├── participant-row.tsx           # строка участника: имя, инициатива, ХП, контролы
├── hp-control.tsx                # ввод урона/лечения
├── initiative-input.tsx          # inline-edit инициативы
└── add-participant-dialog.tsx    # поиск по каталогу + ручной ввод + количество
```

## Key Design Decisions

1. **current_turn_id** хранит id участника, а не индекс — устойчиво
   к добавлению/удалению участников в середине боя.

2. **initiative: numeric** (не int) — позволяет +0.1 для тайбрейкера
   без drag-n-drop.

3. **Optimistic UI**: ХП и инициатива обновляются в React state мгновенно,
   Supabase update в фоне. Ошибка — rollback + toast.

4. **Клонирование** — это просто INSERT нескольких participants
   с одним node_id и display_name + порядковый номер. Никакой
   специальной таблицы клонов.

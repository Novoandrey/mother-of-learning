# Plan: Вылазки (spec-055)

Ветка `claude/spec-055-expeditions` (от `origin/main`). Реализует игроцкую
/tg-модель из spec.md v2.

## Модель данных — решение: **таблицы, не нода-тип**

Меню-шаблон вылазки — **выделенная таблица `expeditions`** (как `encounters`), а НЕ
`node_type='expedition'`. Причины: это /tg-игроцкая фича, которой не место в
десктоп-каталоге/сайдбаре; нода тянула бы sidebar-cache-инвалидацию (AGENTS.md) и
навигацию. `encounters` — прецедент кампанийной операционной сущности вне графа.

### `expeditions` (меню доступных вылазок)
```
id            uuid pk
campaign_id   uuid not null → campaigns(id) on delete cascade
title         text not null            -- цель/название («Лес теней»)
description   text not null default ''
default_consumables jsonb not null default '[]'  -- [{itemNodeId|name, qty}]
default_duration_ticks int              -- опц. локальная длительность
created_by    uuid → auth.users(id)     -- кто добавил (любой член)
created_at / updated_at  timestamptz
```
RLS: `select`/`insert` — члены кампании; `update`/`delete` — автор строки ИЛИ
owner/dm. Индекс по `campaign_id`.

### `expedition_runs` (прогон = один поход)
```
id            uuid pk
expedition_id uuid → expeditions(id) on delete set null
campaign_id   uuid not null → campaigns(id) on delete cascade
loop_number   int not null            -- «дата» = (loop, day), как в transactions
day_in_loop   int not null            --   (богаче — spec-057)
participant_node_ids uuid[] not null default '{}'  -- кто ходил (нарратив/таймлайн)
reward_money_gp      numeric not null default 0
reward_items         jsonb   not null default '[]'
consumables_cost_gp  numeric not null default 0
consumables_items    jsonb   not null default '[]'
created_by    uuid → auth.users(id)
created_at    timestamptz
```
RLS: `select`/`insert` — члены. Даёт историю прогонов + участников для будущего
таймлайна (spec-057). «Дата» v1 = `(loop_number, day_in_loop)` — консистентно с
леджером; календарная дата — 057.

**Финансы прогона** = реальные строки в `transactions` на ноде общака (баланс
корректен), создаются тем же авто-апрув-путём, что `app/actions/stash.ts`. Строки
не бэк-референсят run в v1 (append-only; ДМ правит вручную по модели доверия).

## Слои

- **Миграция** `NNN_expeditions.sql` — 2 таблицы + RLS + индексы. (Прогнать на
  staging руками при тесте — AGENTS.md.)
- **`lib/queries/expeditions-tg.ts`** — read: `listExpeditions`, `listRuns`.
- **`app/actions/expeditions.ts`** — write (auth: членство кампании):
  - `addExpedition` — новая доступная вылазка в меню.
  - `updateExpedition` / `deleteExpedition` — автор/DM.
  - `runExpedition` — применить: списать расходники (−общак, деньгами по цене
    каталога spec-052), зачислить награду (+общак), создать `expedition_runs`,
    послать событие ленты. Авто-апрув, never-throws на ленте.
- **Леджер-событие `'expedition'`** — `lib/telegram/ledger-format.ts` (тип +
  форматтер) + `ledger-feed.ts` (resolve имён участников). Одно сообщение
  «участники · цель · получили · потратили».
- **/tg UI** — новый экран в `app/tg/_components/ledger-app.tsx`: View
  `expeditions` (меню: список + «Добавить») и `expedition-run` (выбрать → пачка +
  расходники + награда → «Готово»). Кнопка входа — из корня /tg.

## Порядок сборки (tasks)

1. **T1 Леджер-событие `'expedition'`** — чистый форматтер + resolve + тест.
   (Первый: self-contained, риск 0, виден результат.)
2. **T2 Миграция** — `expeditions` + `expedition_runs` + RLS.
3. **T3 Read-слой** — `lib/queries/expeditions-tg.ts`.
4. **T4 Экшены** — `app/actions/expeditions.ts` (add/run + gating + тесты логики).
5. **T5 /tg UI** — меню + экран хода.
6. **T6 Prod-хвост** — миграция на staging/прод; ручной проход.

## Развилки (взяты дефолтами, spec.md §Открытые Plan-детали)

- B расходники деньгами (авто-покупка по цене каталога).
- C одношаговая (лог завершённой вылазки).
- D любой член отмечает фактический состав.
- Награду вписывают игроки; ДМ видит в ленте, правит.

## Out of scope (v1)

Двухфаза pending+cron; таблицы добычи; списание item-стока общака; раздача на PC;
десктоп-поверхность; полный таймлайн/tick-миграция (spec-057).

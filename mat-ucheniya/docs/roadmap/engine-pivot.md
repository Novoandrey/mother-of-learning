# Engine pivot — миграция к движку с контент-паками

> Карта инженерного pivot'а: от D&D-flavored MVP к универсальному RPG-движку.
> Это не одна спека — это порядок выполнения десятков спек, сгруппированных по
> зависимостям. Детали каждой опоры — в соответствующей статье этого раздела.

Текущий прод — рабочий инструмент для одной конкретной кампании, с жёстко
захардкоженным D&D-контентом в схеме, без модель времени-пространства и без
версионирования. Цель — движок, который не знает о Wizards of the Coast:
D&D 5e изолируется в портабельный контент-пак, а ядро становится пригодным
для любой west-marches кампании с петлёй.

Общая карта видения — [`north-star.md`](../concepts/north-star.md), §3–4.
Глоссарий «в коде сейчас ↔ HANDOFF» — [`concepts/README.md`](../concepts/README.md).

---

## Что уже в проде

До pivot'а в проде работают спеки 001–019, 023–029, 043–044, 046:

- Граф нод+рёбер (спека 001) — фундамент хранения всех сущностей.
- Транзакционный леджер `transactions` (спека 010) — деньги и предметы.
- Общак, складчина, approval flow (011, 014, 017).
- Каталог предметов + инвентарь v2 (015, 016, 018).
- Encounter tracker v3 (002/005), чарник статблоки (007).
- Self-hosted Supabase + CI/CD + staging (023–029, 043).
- Telegram Mini App: мобильный кошелёк/бухгалтерия (044), auth + карточка PC (046).

Pivot начинается **поверх** работающего прода — не взамен. Каждая группа
сохраняет обратную совместимость с предыдущими фичами.

---

## Группа A — Фундамент

**Что:** универсальная таблица `events`, soft-delete, audit log, persistence scope.

**Зачем:** всё остальное — tick-время, NPC, visibility — пишет события в этот лог.
Без этого фундамента нельзя корректно реализовать петлю времени.

| Задача | Спека / ссылка |
|---|---|
| `transactions` → `events` (добавить `event_type`, `at_tick`, `visibility`, `persistence_scope`, `actor_id`, `location_id`, `payload`, `deleted_at`) | [`generic-events-table.md`](generic-events-table.md) |
| `event.deleted_at` вместо hard DELETE | [`audit-log-and-safety.md`](audit-log-and-safety.md) |
| Таблица `dm_audit_log` | [`audit-log-and-safety.md`](audit-log-and-safety.md) |
| Версии контент-сущностей (`item_version` и т.д.) | [`audit-log-and-safety.md`](audit-log-and-safety.md) |

**Зависимости:** всё последующее. Группа A — блокер для B, C, D, E.

---

## Группа B — Время и пространство

**Что:** tick-модель времени, типизированные локации, modifier stack.

**Зачем:** без `at_tick` нельзя ни корректно позиционировать NPC, ни считать
стоимость перемещения, ни реализовать петлю с per-actor clock.

| Задача | Спека / ссылка |
|---|---|
| `(loop_number, day_in_loop)` → `(loop_id, at_tick)`; `tick_unit_seconds` per-кампания | [`tick-time-model.md`](tick-time-model.md) |
| Типизированные `Location` (hex/point/…) + `Connection` с `base_traversal_ticks` | [`locations-hex-and-point.md`](locations-hex-and-point.md) — спека 031 |
| `ModifierStack`, `ActionCost.compute`, `WeatherResolver.at(tick)`, calendar config | [`time-and-modifiers.md`](time-and-modifiers.md) |

**Зависимости:** A завершена; B-элементы можно делать параллельно между собой,
если не трогать production-данные без feature flag.

---

## Группа C — Мир и активности

**Что:** NPC movement, encounter rework (designed + procedural), `LocationSnapshot`.

**Зачем:** когда есть тики и локации, DM может описывать намерения NPC, а движок
знает, где кто находится на любой момент времени.

| Задача | Спека / ссылка |
|---|---|
| `NPCGroup` с clock + `MovementPlan` + tick resolver | [`npc-movement-and-encounters.md`](npc-movement-and-encounters.md) |
| `EncounterDefinition` (designed) + `EncounterTable` (procedural weighted) | [`npc-movement-and-encounters.md`](npc-movement-and-encounters.md) — спека 032 |
| `LocationSnapshot` (append-only, `observed_at_tick`) | [`locations-hex-and-point.md`](locations-hex-and-point.md) |

**Зависимости:** B (нужны `at_tick` и `Location`).

---

## Группа D — Мульти-юзер

**Что:** visibility + sandbox, west marches multi-DM, live broadcast, spectator.

**Зачем:** для открытой трансляции и управляемого тумана войны нужна таблица
`events` с полем `visibility` и RLS-политика, которая его читает.

| Задача | Спека / ссылка |
|---|---|
| `event.visibility` ({mode: 'all'/'dm_only'/'characters'}) + RLS | [`visibility-and-sandbox.md`](visibility-and-sandbox.md) — спека 033 |
| Роль `spectator`, `participants.see_all` | [`visibility-and-sandbox.md`](visibility-and-sandbox.md) |
| DM session control: день/движение пачки | спека 035 |
| Pack/PC movement timeline | спека 036 |
| West marches multi-DM конфигурация | [`west-marches.md`](west-marches.md) |

**Зависимости:** A (нужен `events` + `deleted_at`); B желательна для 035/036.

---

## Группа E — Контент-паки

**Что:** изоляция D&D-специфики из схемы в портабельный JSON-формат `content_pack`.

**Зачем:** сделать движок независимым от конкретной игровой системы и дать
возможность переносить персонажей между кампаниями.

Машинерия паков строится в **эпике «RPG-движок»** — спеки 045–051
(Engine Core → спеллы → форк → фиты → пирамида → классы → конструктор).
Спека 045 Engine Core — ближайший элемент этой группы.

| Задача | Спека / ссылка |
|---|---|
| Движок: модули, эффекты, ресурсы (слой-0, прозрачность, реалтайм) | спека 045 |
| Формат pack: JSON Schema, версии, импорт/экспорт | [`content-packs.md`](content-packs.md) |
| База спеллов (машинерия баз dnd.su) | спека 046 |
| Форк нод (`forked_from`, хоумбрю) | спека 047 |
| База фитов + бэкграундов | спека 048 |
| Пирамида прогрессии (level-up) | спека 049 |
| База классов / мана-максимум (DMG Spell Points) | спека 050 |
| Конструктор хоумбрю (effect-блоки) | спека 051 |

**Зависимости:** A (нужен `events`); желательны B и C.

---

## Параллелизм и freeze-окна

Группы A и E (Engine Core, спека 045) можно начинать независимо — 045 не трогает
существующий транзакционный слой. Внутри группы B элементы параллелятся при
условии feature flags. Миграция времени (B: `at_tick`) — единственное место,
где потребуется согласованный freeze production-данных: старые `(loop_number,
day_in_loop)` должны быть конвертированы атомарно.

Не требуют freeze: группы C, D, E (добавляются новые таблицы поверх существующих).

---

## Связи с другими разделами

- Концептуальная основа: [`concepts/north-star.md`](../concepts/north-star.md), [`concepts/engine-vs-content.md`](../concepts/engine-vs-content.md)
- Текущий прод (что есть): [`features/README.md`](../features/README.md)
- Детали каждой опоры: статьи этого же `roadmap/`
- Эпик RPG-движка: `.specify/epics/rpg-engine/constitution.md`

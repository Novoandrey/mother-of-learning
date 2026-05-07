# Концепты

Фундамент проекта: философия и ключевые архитектурные идеи. Если
хочется понять «почему сделано именно так» — читайте отсюда.

Большинство принципов уже частично реализованы в проде; раздел
[`roadmap/`](../roadmap/README.md) описывает, что ещё предстоит,
чтобы реализация догнала принципы. Для общей карты направления см.
[`north-star.md`](north-star.md) — короткое распиленное видение
проекта.

---

## Порядок чтения

Если только что попали в проект и не знаете, с чего начать — этот
порядок:

1. **[`north-star.md`](north-star.md)** — куда движется проект
   целиком. Без этого все остальные статьи разваливаются на
   несвязные куски.
2. **[`pillars.md`](pillars.md)** — выжимка дизайн-пилларз из
   `constitution.md`. Что считается «нашим продуктом», а что нет.
3. **[`tool-first.md`](tool-first.md)** — главный принцип: инструмент,
   не симулятор. Объясняет, почему мы не строим автономных NPC и
   мир, который «идёт сам».
4. **[`loop-as-core.md`](loop-as-core.md)** — петля как ядро
   прогрессии. Без этого не понятна структура времени.
5. **[`time-as-resource.md`](time-as-resource.md)** — время как
   первоклассный ресурс. Текущая (грубая) и целевая (тики) модели.
6. **[`world-as-observation-log.md`](world-as-observation-log.md)** —
   мир до наблюдения не существует.
7. **[`event-sourcing.md`](event-sourcing.md)** + **[`persistence-scope.md`](persistence-scope.md)** —
   как лог событий технически реализует петлю.
8. **[`visibility.md`](visibility.md)** — кто что видит и почему
   видимость не должна быть прибита к партиям.
9. **[`dm-as-demiurge.md`](dm-as-demiurge.md)** — полная власть DM
   + safety через следы.
10. **[`two-modes.md`](two-modes.md)** + **[`roles-and-clients.md`](roles-and-clients.md)** —
    игрок vs DM как разные UX, multi-DM, spectator.
11. **[`node-graph.md`](node-graph.md)** — универсальная схема:
    nodes + edges + scoped attrs.
12. **[`engine-vs-content.md`](engine-vs-content.md)** — D&D как
    контент-пак, движок без знания о WotC.

Каждая статья — самодостаточная. Перекрёстные ссылки ведут вглубь.

---

## Глоссарий: HANDOFF ↔ код в проде

Документ-видение HANDOFF (см. [`north-star.md`](north-star.md))
использует терминологию **целевой архитектуры**. Текущий код
использует другую терминологию — то, что мы реально написали к этому
моменту. Эта таблица соответствует им друг с другом, чтобы при
чтении исходников и при чтении видения не было путаницы.

В большинстве статей используется **терминология кода** (как реально
написано), потому что код важнее красивых слов. Когда статья ссылается
на целевую модель явно — там стоит пометка «в HANDOFF — X».

| Термин в HANDOFF | В коде сейчас | Где обсуждается |
|---|---|---|
| `Actor` (всё, что имеет clock) | PC-нода (`node_type='pc'`); NPC — обычная нода | [`roles-and-clients`](roles-and-clients.md) |
| `at_tick: int` (тики от точки отсчёта) | `(loop_number, day_in_loop)` целые числа | [`time-as-resource`](time-as-resource.md), [`roadmap/tick-time-model`](../roadmap/tick-time-model.md) |
| `tick_unit_seconds` per-кампания | нет; день — фиксированная атомарная единица | [`roadmap/tick-time-model`](../roadmap/tick-time-model.md) |
| `loop_id` (UUID на event) | `loop_number` (целое) на ноде типа `loop` | [`loop-as-core`](loop-as-core.md) |
| `branch_id` для веток петель | нет; одна линия | [`persistence-scope`](persistence-scope.md) |
| `events` (универсальный append-only лог) | `transactions` (только money/items) | [`event-sourcing`](event-sourcing.md), [`roadmap/generic-events-table`](../roadmap/generic-events-table.md) |
| `event.persistence_scope` | неявно через привязку к loop-ноде | [`persistence-scope`](persistence-scope.md) |
| `event.visibility` (`all`/`dm_only`/`characters[]`) | нет; всё открыто | [`visibility`](visibility.md), [`roadmap/visibility-and-sandbox`](../roadmap/visibility-and-sandbox.md) |
| `Location` (типизированная сущность) | нода с `node_type='location'` | [`roadmap/locations-hex-and-point`](../roadmap/locations-hex-and-point.md) |
| `Connection` (с `base_traversal_ticks`) | `edge` (не типизированное ребро между нодами) | [`roadmap/locations-hex-and-point`](../roadmap/locations-hex-and-point.md) |
| `LocationSnapshot` (наблюдение) | нет; ноды как актуальный snapshot | [`world-as-observation-log`](world-as-observation-log.md) |
| `EncounterDefinition` / `EncounterTable` | encounter-нода + ad-hoc на месте; никаких таблиц с весами | [`features/encounters`](../features/encounters/README.md), [`roadmap/npc-movement-and-encounters`](../roadmap/npc-movement-and-encounters.md) |
| `NPCGroup` со своим clock | NPC-нода без clock и без `movement_plan` | [`roadmap/npc-movement-and-encounters`](../roadmap/npc-movement-and-encounters.md) |
| `MovementPlan` (`route` + `dwell_ticks`) | нет | [`roadmap/npc-movement-and-encounters`](../roadmap/npc-movement-and-encounters.md) |
| `WeatherResolver.at(tick)` | нет | [`roadmap/time-and-modifiers`](../roadmap/time-and-modifiers.md) |
| `ModifierStack` / `ActionCost.compute` | нет; стоимости неявные у DM в голове | [`roadmap/time-and-modifiers`](../roadmap/time-and-modifiers.md) |
| `dm_audit_log` | нет | [`roadmap/audit-log-and-safety`](../roadmap/audit-log-and-safety.md) |
| `event.deleted_at` (soft delete) | hard `DELETE` на чувствительных таблицах | [`roadmap/audit-log-and-safety`](../roadmap/audit-log-and-safety.md) |
| `content_pack` (портабельный) | item / monster / spell таблицы как часть схемы | [`engine-vs-content`](engine-vs-content.md), [`roadmap/content-packs`](../roadmap/content-packs.md) |
| `spectator` (роль наблюдателя) | нет; роли только `owner` / `dm` / `player` | [`roles-and-clients`](roles-and-clients.md) |
| `participants.see_all` | нет | [`roles-and-clients`](roles-and-clients.md) |
| `parties` как UI-агрегация | нет; пачки выводятся через `session.participants` | [`features/loops-and-sessions`](../features/loops-and-sessions/README.md) |
| `dm_overwrite_hex`, `dm_inject`, `dm_correction` (DM-операции как события) | DM пишет напрямую в таблицы через server actions | [`dm-as-demiurge`](dm-as-demiurge.md) |
| Версии контента (`item_version`, `monster_version`) | нет; правка перезаписывает | [`roadmap/audit-log-and-safety`](../roadmap/audit-log-and-safety.md) |

Если столкнулись с термином, которого нет в таблице, — это либо
обычное D&D-понятие, либо что-то локальное (например, **«общак»** —
наша внутренняя переменная, не из HANDOFF и не из D&D). Локальные
термины описаны в соответствующих фича-доках.

---

## Что **не** считается концептом

Чтобы раздел не превратился в свалку, есть граница: концепт — это
**фундаментальная идея, на которую опирается архитектура**. Если
вопрос звучит как «как именно реализовано Z в коде» — это не концепт,
а:

- **`features/`** — описание реальной фичи (что делает, как
  пользоваться, как устроено внутри).
- **`architecture/`** — кросс-cutting технические темы (стек, кэш,
  тесты, дизайн-токены).
- **`roadmap/`** — то, что ещё не сделано, но запланировано.

Если статью можно переписать на любую другую кампанию / любой другой
TTRPG-движок без потери смысла — она, скорее всего, концепт. Если она
завязана на конкретные таблицы / компоненты / endpoint'ы — это
features или architecture.

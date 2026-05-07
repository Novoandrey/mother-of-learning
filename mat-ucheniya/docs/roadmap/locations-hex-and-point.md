# [draft] Локации, hex- и pointcrawl

> Заглушка. Содержание будет наполняться постепенно.

Целевая схема локаций из HANDOFF. Абстрактный `Location` с `type: 'hex' | 'point' | 'street' | 'dungeon_room'` и иерархией (`parent_location_id`). Отдельная таблица `Connection` с `base_traversal_ticks`, направлением, типом террейна, флагом `hidden`. На старте — Hex (wilderness, соседи по 6 направлениям, hex-математика по redblobgames) и Point (города/регионы/данжи с явным графом). Многоуровневость: глобальная hex-карта мира → внутри гекса pointcrawl поселения → внутри точки depthcrawl данжа.

## Что планируется в статье

- Схема Location (поля, индексы, RLS)
- Схема Connection (base_traversal_ticks, direction, terrain, hidden)
- Hex-математика (axial coords, neighbors, distance)
- Pointcrawl: explicit graph с именованными edges
- LocationSnapshot: append-only, observed_at_tick, observed_by
- Многоуровневость: parent_location_id рекурсивно
- Будущие типы: Street (procedural), DungeonRoom
- UI: canvas, пины, travel edges, фильтры

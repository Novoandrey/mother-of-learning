# [draft] NPC движение и encounter rework

> Заглушка. Содержание будет наполняться постепенно.

Бухгалтерия движения, не AI: DM заявляет намерение, система тикает, игроки видят туман войны. `NPCGroup` со своим `current_tick`, `movement_plan` (список location_id с dwell_ticks), DM-scratchpad. Resolver на каждый tick advance пересчитывает позиции, проверяет пересечения с активным игроком → encounter check. Encounter rework: разделение на `EncounterDefinition` (designed, основа петли — встречаешь то же самое, потому что петля) и `EncounterTable` (procedural, weighted, для wandering и подсказок DM при заполнении новых локаций).

## Что планируется в статье

- NPCGroup: схема, clock, movement_plan, dm_notes, visibility
- Resolver tick advance: алгоритм
- DM override и pause: интерфейсы
- EncounterDefinition: tick_window, composition, auto_resolvable
- EncounterTable: weighted entries, tick_modifiers (время суток, погода)
- EncounterInstance: source, location_snapshot, resolution
- Пропуск автобоем (когда игроки уже знают решение)

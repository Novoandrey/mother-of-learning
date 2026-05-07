# [draft] Engine pivot — миграция к движку с контент-паками

> Заглушка. Содержание будет наполняться постепенно.

Большой долгосрочный pivot от D&D-flavored MVP к универсальному движку. Включает: tick time model, generic events table, локации hex+point, modifier stack, погоду, NPC movement, audit log, west marches multi-DM, content packs. Это десятки спек, не одна. Этот файл — порядок миграции с грубой группировкой по volume и зависимостям, чтобы pivot не делался хаотично.

## Что планируется в статье

- Группа A — фундамент (events table, persistence_scope, audit log, soft-delete)
- Группа B — время и пространство (tick model, locations hex/point, modifier stack)
- Группа C — мир и активности (weather, NPC movement, encounter tables)
- Группа D — мульти-юзер (west marches, spectator, live broadcast)
- Группа E — контент-паки (формат, импорт/экспорт, изоляция D&D)
- Зависимости между группами (что блокирует что)
- Что параллелится с обычной разработкой, что требует freeze фич

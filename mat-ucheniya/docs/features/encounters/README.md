# Энкаунтеры

> Excel-style грид инициативы для боёвки D&D 5e. DM управляет всем; игрок
> фиксирует урон и броски по своему PC. Завершённый энкаунтер переходит в
> режим read-only; лут генерируется через бухгалтерию.

---

## Создание энкаунтера

DM создаёт энкаунтер из вкладки `app/c/[slug]/encounters/`. При создании
автоматически создаётся зеркальная нода типа `encounter` в каталоге — через
BEFORE INSERT триггер `trg_encounter_create_mirror` (миграция
`039_encounter_mirror_and_loot_drafts.sql`). Зеркало нужно как якорь для
лута и летописи; в самом каталоге и сайдбаре оно не отображается.

---

## Участники и грид инициативы

После создания DM добавляет участников двумя способами:

- **Из каталога** — выбирает ноду (PC, NPC, monster). `max_hp` и `ac`
  сидируются из `node.fields`. Монстров можно добавить несколькими
  экземплярами с одной ноды (`addParticipantFromCatalog` в
  `lib/encounter-actions.ts` принимает массив HP).
- **Вручную** — произвольное имя и HP без ноды-источника.

Грид строится компонентом `components/encounter/encounter-grid.tsx`.
Столбцы: инициатива, имя, HP (текущий/макс), AC, условия и эффекты (пилл-редактор),
смерть-бросок. Порядок строк определяется `initiative DESC NULLS LAST, sort_order`.

---

## HP и урон

**`current_hp`** и **`max_hp`** — колонки `encounter_participants`. Временные
HP (`temp_hp`) добавлены миграцией `004_participant_role_temp_hp.sql`. Ячейка
HP — компонент `components/encounter/hp-cell.tsx`. Изменение HP доступно:

- DM — для любого участника.
- Игрок — только для своего PC (`canEdit` из `lib/auth.ts`, зеркалит
  SQL-функцию `can_edit_node`).

---

## AC и спасброски смерти

Миграция `023_ac_and_death_saves.sql` добавила два поля на `encounter_participants`:

- **`ac int`** — класс доспеха для этого энкаунтера. Nullable; сидируется
  из `node.fields.ac` при добавлении из каталога; после этого живёт отдельно
  (может меняться в бою).
- **`death_saves jsonb`** — `{"successes": 0..3, "failures": 0..3}`. Локальное
  состояние только для этого боя; сбрасывается при HP > 0 или по завершении
  энкаунтера. Компонент: `components/encounter/death-saves-cell.tsx`.

---

## Условия и эффекты (пилл-редактор)

Условия (Poisoned, Stunned, …) и эффекты на каждом участнике хранятся в JSONB
(миграции `003_conditions.sql`, `005_effects_and_encounter_details.sql`,
`016_conditions_temporal.sql`). Пилл-редактор — `components/encounter/pill-editor.tsx`:
список цветных пилюль с quick-add и inline-delete. Текущее состояние пиллов
видно всем участникам в реальном времени.

---

## Лог боя

Таблица `encounter_log` (миграция `015_encounter_log.sql`) — хронологический
лог текстовых записей DM о ходах. Поля: `author_name`, `content`, `meta jsonb`
(структурированные данные в будущем), `status`. Компонент:
`components/encounter/encounter-log.tsx`.

---

## Status gate: active vs read-only

Поле `encounters.status`: `'active'` или `'completed'`. Только активные
энкаунтеры показывают кнопки действий (`encounter-controls.tsx`). Завершённый
энкаунтер — просмотр лога без редактирования. DM переключает статус вручную.

---

## Лут энкаунтера

После завершения энкаунтера DM генерирует лут через таблицу
`encounter_loot_drafts` (миграция `039`). Черновик лута — `lines jsonb`
с записями вида `{kind: 'coin' | 'item', ...}` плюс `loop_number`, `day_in_loop`.
После утверждения лут конвертируется в транзакции бухгалтерии.
Подробнее — [`accounting/README.md`](../accounting/README.md).

---

## Mirror-нода и технические детали

Устройство mirror-триггеров, pill-редактора и auth-гейтинг DM/player
расписаны в [`technical.md`](technical.md).

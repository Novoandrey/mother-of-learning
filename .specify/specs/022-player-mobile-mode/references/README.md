# spec-022 reference artifacts (handed over by Andrey, chat 93, 2026-06-10)

## stasyan-sheets-2026-06-10.xlsx
Export of Стасян's Google sheet «Лучшие мальчики для НРИ 2». **Primary
fixture for US3 import (FR-014..016) and SC-1/SC-3 parity checks.**
Tabs: Маркус (canon, monk 9), Никандр (drifted layout, fighter 8),
Бальтазар, Дамбиниус, Лист5 (empty).

Layout matches `.specify/memory/character-sheet-excel-system.md` with
extras not in the memory-doc (record during Plan):
- attunement columns next to items: `Предмет / Нуж настр / Настр` (E10:G17 on Маркус);
- currency split `С собой / Дома` (E24:G29);
- spells in two column-pairs `Уровень/Заклинание/Источник` (N13:S20+);
- Никандр drift: full-word labels («Восприятие», «Знание магии»), class in E1
  instead of F1, no name in B1, hit dice as text «6д10», per-level slot rows
  `Ячейка/Имеется/Осталось`.

## lss-character-export-sample.json
Export from longstoryshort.app (character «Миряна», created 2026-06-10 as a
format sample — **mostly empty skeleton**, `wizardStep: "initial"`; filled
shapes of `spells`/`text`/`resources`/`coins` are NOT visible in it).
Role: field-model reference for `data-model.md` (their production breakdown:
`info`, `stats.score`, `saves.isProf`, `skills.baseStat`, `vitality`,
`attunementsList`, `weaponsList`, `resources`, `conditions`, `coins`,
edition flag). **Not an import source** — US3 imports Стасян xlsx only.
Anti-pattern to avoid: `data` field is a double-serialized JSON string.

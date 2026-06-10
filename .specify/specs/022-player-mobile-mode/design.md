# spec-022 — Player Mobile Mode: UX/UI Design Document

**Status**: Design draft v1 — awaiting Andrey's review
**Created**: 2026-06-10 (chat 93) · **Author**: Claude
**Upstream**: `spec.md` (Clarified) · `.specify/memory/character-sheet-excel-system.md` (formula canon) · `references/` (fixtures)
**Downstream**: feeds Plan phase (`plan.md`, `data-model.md`, parser contract). This document owns *what the player sees and touches*; Plan owns *how it is built*.

---

## 0. How to review this document

- **D-01 … D-15** are design decisions. Each lists options, a recommendation, and a one-line rationale. Review = approve, override, or comment per number. The full log is in §17; decisions are also inlined where they occur.
- **★** marks deliberately open creative slots (naming, flavor, celebration moments). §18 collects them. These are yours.
- Two decisions **change the spec** if approved: **D-07** (prepared spells) and **D-08** (conditions). They are flagged `[SPEC]`.
- Wireframes are ASCII at ~phone proportions (390 px logical width). All quoted UI text is **proposed Russian microcopy v0**, edit freely.
- Fast pass: §2 (principles) → §5 (sheet anatomy) → §8 (dice) → §17 (decision log). Deep pass: everything, §6 is the longest.
- Visual direction image probes were skipped (no native image generation in this environment); direction is specified through tokens (§10) and wireframes instead.

---

## 1. Context digest

What we are building, compressed from `spec.md` v2 and chat-90 usage data:

- **Audience**: ~20 players, 31 PCs, weekly west-marches sessions. Sheets currently live in Стасян's Google sheet (4 reference tabs in `references/stasyan-sheets-2026-06-10.xlsx`) and on paper. 0 of 31 PC sheets edited in our app over 30 days: the product has data surfaces but no *play* surface.
- **Phase 1 scope (this design)**: US1 live sheet + US2 dice + US3 xlsx import. US4 money / US5 items / US6 feed are P2; US7 encounter is P3. Compendium is Phase 2, builder is Phase 3. No realtime, no push, no portraits (spec-030).
- **System canon**: Стасян's reactive formula graph. Player inputs: stats, level, skill multipliers {0, 0.5, 1, 2}, save proficiencies, current HP, resource remainders. Everything else derives: модификатор = ⌊(стат−10)/2⌋, БМ = ⌊(ур−1)/4⌋+2, навык = мод + ⌊БМ×множ⌋, спас = мод [+БМ], спас-DC = 8 + мод + БМ. Class-dependent values (КД, попадание, инициатива, макс HP) are **formula by default + manual override**.
- **Homebrew is the norm, not the exception**: sources like «Ильза», «ГМ дал», «Факультатив»; renamed spells; «…24» rule-version marks. The sheet must be fully usable with free text + source and zero compendium.
- **Platform**: PWA at `/m/...`, standalone, no UA sniffing. Desktop DM chrome unchanged. Same data, same auth (`canEditNode` / `isPcOwner`), same server actions.
- **Existing visual identity**: «warm-white spreadsheet with a single blue accent», Manrope + JetBrains Mono, flat shadows, tabular numerals (`mat-ucheniya/STYLE.md`, `app/globals.css`).

---

## 2. Product stance & design principles

The character sheet is the one artifact a player touches every single session. Phase 1 succeeds if opening the PWA at the table is *faster and more pleasant than reaching for the paper sheet*. That single comparison drives every principle below.

**P1 — Стол важнее дивана (table-first).** Design for the in-session moment: dim light, one hand, the DM waiting. Every per-turn action (roll, damage, spend a slot) completes in ≤ 2 taps from a resting sheet. Glanceable from arm's length: the numbers that matter are the biggest things on screen.

**P2 — Лист — поверхность игры, а не форма.** Numbers are buttons. A modifier you can see is a check you can roll. The sheet is not a database view with a dice app bolted on; rolling *is* reading the sheet.

**P3 — Бумага прощает — и мы прощаем.** Free text is first-class: any name, any source, any «Лечение ран 24». No validation walls, no required fields, no silent data loss (the import-report ethos extends to the whole product). If the player wrote it, the sheet keeps it.

**P4 — Считает приложение, решает игрок.** Derived values recompute instantly and show their provenance; every class-dependent value accepts a manual override that is visibly marked and reversible. Trust comes from being auditable, not from being locked.

**P5 — Тихий интерфейс, громкие кубы.** The entire animation/delight budget is spent on one moment: the roll. Everything else is calm, flat, and instant. (Register: product UI; the tool disappears into the task.)

**P6 — Одна линза, те же данные.** Mobile mode is a lens over the same nodes, rights, and actions as desktop, per the constitution. No mobile-only entities, no forked state.

**Anti-goals**: not a VTT, not a character builder, not a rules reference (Phase 1), not a social/realtime surface. The biggest risk named in spec context: building another value-without-consumption-surface warehouse. The counter-risk for design: copying D&D Beyond's paged card UI and losing the «всё на одном листе» mental model players already have from Стасян's table and paper.

---

## 3. Users & contexts of use

| # | Context | State of mind | Top tasks | Design response |
|---|---------|---------------|-----------|-----------------|
| C1 | **Мой ход в бою** | rushed, DM waiting | roll attack/check, take damage, spend slot/ки | sticky vitals, rollable chips, HP numpad, pips, ≤2 taps |
| C2 | **Проверка вне боя** | relaxed | roll a skill/save, read a feature | tap skill row; expandable feature rows |
| C3 | **Отдых / учёт** | bookkeeping mode | short/long rest, spend hit dice, re-prepare spells | rest buttons with confirm summary, prepared toggles |
| C4 | **Дома между сессиями** | unhurried, two hands | fix stats after level-up, edit lists, import | explicit «Редактировать» mode, import flow |
| C5 | **ДМ заглядывает** | checking | read any sheet, occasionally fix | same sheet read-only/editable per rights, desktop too |

Device baseline: mid-range Android + iPhone, 390×844 logical viewport, portrait, one-handed. C1 dominates frequency; C4 dominates duration. The interface optimizes C1 and tolerates C4 (edit mode may be slower, never confusing).

---

## 4. Information architecture

### 4.1 App map (Phase 1)

```
/m                          → resolver: 0 PC → empty state
                                        1 PC → redirect /m/pc/[id]
                                        N PC → /m/pcs (switcher)
/m/pcs                      список моих персонажей
/m/pc/[id]                  ЛИСТ (the app, 95% of time)
/m/pc/[id]/import           импорт из таблицы (stepper, US3)
/m/pc/[id]/settings         о листе: последний импорт, тема, выход
```

Campaign choice follows the existing cookie; switching campaigns is an explicit action in `/m/pcs` and settings (inherited from spec v1).

### 4.2 D-01 — Navigation model `[recommended: single scroll + section chips]`

| Option | For | Against |
|---|---|---|
| **A. Single scrollable sheet + sticky section-jump chips + collapsible sections** ✅ | matches the «один лист» mental model of Стасян's table and paper; no information amnesia between tabs; chips give O(1) jumps; collapse handles length | long DOM page (mitigated: sections collapsed by default below the fold remember state) |
| B. Bottom tab bar (the uploaded sketch: 5 tabs) | familiar app pattern | fragments one entity across screens; resources needed on two tabs at once (the sketch already duplicated Ци on «Магия» — the symptom); mid-turn tab-hopping violates P1 |
| C. Paged cards (D&D Beyond mobile app) | thumb-paging | DDB's own tablet users beg for the dense web sheet instead of the card view; weakest pattern for «where is X» |

Rationale: a sheet is one document, and our players' muscle memory is a one-page spreadsheet. Bottom bar stays **reserved** for US6 («Лента») and later; until a second destination ships, no bottom nav, the dice tray owns the bottom edge.

### 4.3 Entry flows

- **0 PC**: empty state «Пока у тебя нет персонажа в этой кампании. Напиши ДМу — он привяжет твоего PC.» + campaign switcher if applicable.
- **1 PC**: straight to the sheet (≤ 1 tap from app icon, beats spec's ≤ 2).
- **N PC** (Andrey: 3+): switcher list, each row = name, «класс · уровень», portrait placeholder circle, last-touched first. Tap → sheet. Sheet app-bar shows the PC name as a button back to the switcher.
- **DM**: same `/m/pcs` lists all campaign PCs (rights already allow), grouped «Мои / Остальные».
- **Desktop link onto a DM page from phone** (FR-017): top banner «Эта страница не оптимизирована для телефона → Открыть мобильный режим», no layout crash. Mechanics in Plan.

---

## 5. The sheet — anatomy

Three persistent zones; everything else scrolls.

```
┌──────────────────────────────────────┐
│ ① App bar: Миряна Кастиль        ⋮  │  ← name = back to /m/pcs; ⋮ = menu
│    Изобретательница 1 · Волшебница 8 │
├──────────────────────────────────────┤
│ ② VITALS (sticky while scrolling)    │
│  ❤ 57/88 +5врем   🛡 21✎   ⚡Иниц +7 │
│  [Концентрация ×] [Death Ward]  +    │  ← conditions chips (D-08)
├──────────────────────────────────────┤
│ ③ Section chips (sticky, h-scroll):  │
│  Статы · Навыки · Бой · Ресурсы ·    │
│  Магия · Умения · Снаряж. · Прочее   │
├──────────────────────────────────────┤
│                                      │
│   ④ SECTION STACK (scrolls)          │
│   1. Характеристики и спасброски     │
│   2. Навыки                          │
│   3. Боевой блок                     │
│   4. Ресурсы и отдых                 │
│   5. Атаки и заклинания              │
│   6. Умения и особенности            │
│   7. Снаряжение и настройка          │
│   8. Владения и языки                │
│   9. Валюта (плейсхолдер)            │
│  10. Заметки                         │
│  11. Черновик импорта (если есть)    │
│                                      │
├──────────────────────────────────────┤
│ ⑤ DICE TRAY (docked, 48px)           │
│  ⬡ d20   последний: Магия 23   ⚖ Пре│
└──────────────────────────────────────┘
```

### D-02 — Sticky vitals contents `[recommended: HP + AC + Init + conditions]`

Always visible while scrolling: **HP capsule** (the most-touched number), **AC** (the most-asked number: «попал?»), **Initiative** (rollable: combat starts while you're anywhere on the sheet), **conditions chips** (if D-08 approved). Speed, попадание, спас-DC live in the Боевой блок section, one flick away. Alternative (everything from Стасян's top row sticky) rejected: 7 numbers in a sticky band shrink all of them below glanceability, violating P1.

### D-03 — Section order `[recommended: play-frequency order, as listed above]`

Стасян's grid order is an artifact of spreadsheet geometry, not of play. Proposed order follows roll frequency (checks/saves → skills) then turn economy (combat → resources → spells), with reference material (features, gear, proficiencies) below the fold and collapsed by default. Counter-option «mirror the table layout for import familiarity» rejected: the import *report* provides the mapping moment; daily play should not pay a navigation tax for it. Section collapse state is remembered per device.

### Section defaults

Expanded on open: Характеристики, Навыки (collapsed to «top» — see 6.5), Боевой блок, Ресурсы. Collapsed: everything below. A returning player lands on exactly the C1 toolkit.

---

## 6. Block-by-block specification

Every block below states: content → interactions (play / edit) → Стасян-fixture mapping → empty state. Blocks are documented in reference order; the on-screen order is §5 (D-03). Formula notation: `ƒ` = computed, `✎` = manual override.

### 6.1 Шапка (identity)

Name (h1), class string («Изобретательница 1 / Волшебница 8» — multiclass is just a string in Phase 1), level, race, background, inspiration star.

- Play: tap **★ Вдохновение** toggles it (it is a 0/1 resource; FR-007 lists it). Subtle fill animation, no confetti.
- Edit: name, class, race, background free text; level = stepper 1–20 (drives БМ recompute everywhere, so the stepper shows «БМ +4» live beside it).
- Fixture: B1 name, F1 class, H1 level; Никандр drift (class in E1, no name) lands as ⚠️ in the import report.
- Portrait: 40 px placeholder circle with initials; spec-030 will fill it. No upload UI in Phase 1.

### 6.2 Боевой блок

Tiles: КД `ƒ/✎`, Инициатива `ƒ/✎` (rollable), Скорость `✎-number`, Попадание `ƒ/✎` (rollable), Спас-DC `ƒ/✎`, Пассивная внимательность `ƒ`.

- Play: tap Инициатива → roll d20+mod. Tap Попадание → roll d20+mod (generic attack; named attacks live in 6.7). КД / DC / Скорость are not rollable: tap does nothing in play mode (no fake affordances; only rollable chips get the d20 tick mark, §10.5).
- Edit: each `ƒ` tile opens a small sheet: computed value + formula breakdown + «Ввести вручную» → becomes `✎` with «вернуть формулу ƒ» action (FR-006).
- Fixture: E3 КД, F3 иниц, G3 скорость, E9 попадание, J1 спас-DC, C29 пасс. внимание. Миряна's paper DC 18 vs computed 17 is the override case this block exists for.

### 6.3 HP capsule & HP sheet

Vitals capsule: `57/88` big tabular numerals, thin bar underneath (green > 50% → yellow > 25% → red), `+5 врем` chip when temp > 0.

Tap capsule → **HP bottom sheet**:

```
┌──────────────────────────────────────┐
│ Хиты                57 / 88   +5 врем│
│ ████████████░░░░░░░░░                │
│                                      │
│        ┌─────────────┐               │
│        │     14      │  ввод         │
│        └─────────────┘               │
│   [ 1 ][ 2 ][ 3 ]                    │
│   [ 4 ][ 5 ][ 6 ]      [⌫]          │
│   [ 7 ][ 8 ][ 9 ]                    │
│        [ 0 ]                         │
│                                      │
│  [− Урон]   [+ Лечение]   [Врем. ХП] │
│                                      │
│  Кости хитов  ●●●●●○○○○  8×d8 1×d6   │
│  [Потратить кость]   Полные хиты ⟳   │
└──────────────────────────────────────┘
```

- Damage flow: type 14 → «− Урон» → temp absorbs first, rest from current, snackbar «−14 хитов · Отменить» (5 s undo). Heal caps at max. «Врем. ХП» sets (not stacks) temp.
- **At 0 HP** the capsule swaps to death saves: `Успехи ○○○ · Провалы ○○○` pips, tappable; any heal > 0 clears them. Fixture: Успехи/Провалы cells exist in Стасян's grid (E6:G6 row), so import carries them.
- «Потратить кость» = pick die (if mixed pools, e.g. Миряна d8/d6) → rolls die + мод Тл via the standard roll card → heals result → decrements pool. One tap chains roll and bookkeeping: this is P2 (numbers are actions) at its best.
- Max HP: `ƒ` (среднее×уровень + Тл×уровень) with `✎` override, edited in edit mode, not here.
- Fixture: E4/F4/G4 макс/тек/врем, E7 кость хитов (Никандр's «6д10» text parses to pool).

### 6.4 Характеристики и спасброски

### D-04 — Saves co-located with abilities `[recommended: one tile per ability, two rollable zones]`

Six tiles in a 3×2 grid. Each tile: ability name, **modifier large** (tap = ability check), score small, and a save chip «Спас +7 ●» (tap = saving throw; ● = proficiency).

```
┌───────────┐ ┌───────────┐ ┌───────────┐
│ СИЛА      │ │ ЛОВКОСТЬ  │ │ ТЕЛОСЛОЖ. │
│   −1      │ │   +2      │ │   +3      │
│    8      │ │    14     │ │    16     │
│ Спас −1 ○ │ │ Спас +2 ○ │ │ Спас +7 ● │
└───────────┘ └───────────┘ └───────────┘
```

The sketch split saves into a separate list on another tab; paper and Стасян keep them with the stats, and the 2024 official sheet doubles down on grouping by ability. Co-location wins: one spatial anchor per ability. Edit mode: score becomes a stepper (8–30), save dot toggles.

### 6.5 Навыки

18 fixed rows, alphabetical RU (spatial memory beats smart sorting; **D-14**). Row = multiplier dot, name, base-stat tag, modifier chip (rollable):

```
◉  Анализ          ИНТ   +9   🎲
●  Внимательность  МДР   +3   🎲
○  Выживание       МДР    0   🎲
◐  Скрытность      ЛВК   +4   🎲
```

- Dots: ○ 0 · ◐ 0.5 · ● 1 · ◉ 2 (legend in section footer). Color + fill differ, not color alone.
- Header right: «Пасс. внимательность 13» (ƒ).
- Play: tap row anywhere = roll. Edit: tap the dot cycles 0 → 0.5 → 1 → 2 → 0; modifier recomputes live.
- Default presentation: section shows **all 18** (a 18×44 px list ≈ 800 px is acceptable mid-sheet; hiding zero-multiplier skills was considered and rejected: «can I even try X?» is a real table question).
- Fixture: A10:D27, exact multiplier semantics from memory-doc.

### 6.6 Ресурсы и отдых

One card per resource: name, restore-flag badge, track.

- **Track form**: ≤ 12 units → pips (●●●●○○); > 12 → counter `7 / 15` with − / + steppers. Pips: tap pip N sets remaining (sketch's logic, adopted: tap last filled = spend one, tap empty = refill to there). Spell slots render in 6.7 next to their levels, but they are the same resource model.
- **Restore badge**: «К» (короткий) / «Д» (длинный) per FR-007 flag; edit mode sets it and the total.
- **Rest buttons** (D-05): section footer, full-width pair «Короткий отдых» / «Длинный отдых» → confirm sheet listing exactly what will restore («Восстановится: Ци 12, Ячейки 2-го круга 2; Хиты → 88; Кости хитов +4»), then one tap applies. Also duplicated in app-bar ⋮ menu for C3. Rationale for confirm: rest is the only multi-write tap on the sheet; the summary doubles as a rules reminder.
- Fixture: N2:Q9 area (Ци, Кость БИ, Ячейки всего/осталось); Никандр's per-level «Ячейка/Имеется/Осталось» drift maps to the same model.
- Empty state: «Ресурсов пока нет · + Добавить» (edit mode).

### 6.7 Атаки и заклинания

**Attacks** (top of section): rows from the sheet's attack list. Row = name, hit chip `+9 🎲` (rolls d20+mod), damage chip `1d8+5` (**D-06**: stored as free text; if it parses as XdY±Z the chip is rollable and opens pre-filled in the dice tray; if not, it renders as plain text). Per-attack `✎` hit override in edit mode. Fixture: attacks are weakly structured in the table (E10-area items + попадание), so most arrive via draft + manual touch-up; paper Миряна's potions list lands here as non-rollable rows.

**Spells**: grouped by level; the group header carries the slot pips:

```
─ Магия ──────────────  Атака +10 · DC 18✎
  Заговоры (7)
   ▸ Указание            Ильза
   ▸ Огненный снаряд     Волшебница
  1 круг   ●●○   ▾
   ✓ Щит                 Волшебница    R
   ✓ Доспех Агатиса      Ученик стихий
   ○ Падение пёрышком    Изобр.
  2 круг   ●●●   ▾
   ✓ Туманный шаг        Фея-крёстная
```

- **Slot pips in the level header**: spending a slot happens where you cast from (DDB/Foundry pattern). Tap pip = spend/refill, same as 6.6.
- **`[SPEC]` D-07 — prepared toggle** `[recommended: yes]`: leading ✓/○ per spell toggles «подготовлено», live in play mode (re-preparation is exactly a rest-time table action; Fight Club 5 ships the same «prepared for the day» toggle). Spells with always-on sources can leave it ✓; import defaults all to ✓ (reference sheets have no such column, so SC-1/SC-3 are unaffected). A filter chip «Только подготовленные» appears when any spell is ○. *Spec impact*: one sentence added to FR-008. Fallback if rejected: markers in the name (per Q7 logic), losing the daily-toggle use case.
- Ritual / version marks («R», «…24») stay part of the name text (Q7, decided).
- Spell row tap → expandable detail: source line, free-text notes («Заметки к заклинанию», player-owned). No compendium text in Phase 1; in Phase 2 a link affordance appears on matched names, text never migrates.
- «Атака +10 · DC 18» chips: `ƒ` from a casting-stat selector (Инт/Мдр/Хар, edit mode) + `✎` override (Миряна: DC 18✎). Attack chip rollable.
- Slots are **manual totals** in Phase 1: no multiclass slot table math (that is class-derived → Phase 3). Import reads totals from the table; edit mode sets them.
- Fixture: N13:S20+ two column-pairs «Уровень/Заклинание/Источник».

### 6.8 Умения и особенности

Grouped by source (sketch's idea, adopted), each group collapsible with count: «Раса · Калаштар (4)», «Класс · Волшебница (6)», «Черты (5)», «ГМ дал (2)». Row = name; tap → expandable free-text description/notes. **Not chips** (the sketch's chips truncate «Посвящённый в боевые искусства» and give no detail surface). Edit: add/rename/move-between-groups, sources are free text with autocomplete from existing values. Fixture: K2:M32 «Умения + источник».

### 6.9 Снаряжение и настройка

- **Настройка** sub-block first (it is the rules-relevant part): counter «Настроено 2 / 3» + rows with toggle tag `настроен / не настроен` (live in play mode: attuning at a rest is a table action). Discovered in the fixture (E10:G17 «Предмет / Нуж настр / Настр»), absent from the memory-doc: the import parser must map it (noted in `references/README.md`).
- **Снаряжение**: plain rows, name + optional note line. No quantities/weight model in Phase 1 (US5 will bring the real inventory; these rows are the sheet's own free list, per Стасян H-column).
- Empty states: «Снаряжение пусто · + Добавить».

### 6.10 Владения и языки

Two free-text-list rows groups: «Оружие и инструменты», «Языки». Fixture: B30:B32 + scattered cells. Collapsed by default.

### 6.11 Валюта (плейсхолдер, FR-010)

Card: «Деньги переезжают сюда позже. Пока — у ДМа и в /accounting.» Muted, no zeros pretending to be data, no dead inputs. When US4 ships, this card becomes the live balance + last transactions.

### 6.12 Заметки (D-15 `[recommended: include]`)

One free-form multiline text block («Заметки»), autosaved. Paper sheets have margins; players will write *somewhere*, better here than in spell-note fields. Cost: one text field; no structure, deliberately.

### 6.13 Черновик импорта

Appears only when the last import produced ❌/unmapped values (FR-015): raw «cell → text» rows the player can copy out into proper fields, then dismiss per-row. Badge on the section chip until emptied. This is the «ничего не теряем молча» principle made visible.

---

## 7. Editing model

### D-09 — Two-layer editing `[recommended]`

| Layer | What | How |
|---|---|---|
| **Play state** — always live | HP, врем. ХП, death saves, pips/counters, prepared ✓, attunement tag, conditions, inspiration, dice | direct tap, optimistic write, undo snackbar |
| **Build state** — behind «Редактировать» | stats, level, multipliers, save dots, overrides, names/lists/sources, resource totals & flags | app-bar ⋮ → «Редактировать»; sheet gets a thin blue frame + «Готово» button; rollable chips stop rolling and become editable |

Rationale: in C1 a mis-tap must never change a stat; in C4 nothing should be more than one mode-switch away. Single global mode (vs per-field pencils) keeps the play sheet visually clean and the rule learnable in one sentence: «крутишь персонажа — включи Редактировать».

- **Override pattern** (FR-006): `ƒ` badge on computed values; in edit mode tapping a `ƒ` value opens: breakdown line («+9 = +5 Инт +4 БМ»), «Ввести вручную» → `✎` badge; `✎` values show «вернуть формулу». Long-press on any `ƒ` value in *play* mode shows the same breakdown read-only (provenance on demand, the DiceCloud lesson, without its complexity).
- **Writes**: per-field commit on change, optimistic UI, server action with `canEditNode`, `cleanFields` semantics (FR-004). Failure → field reverts + toast «Не сохранилось · Повторить».
- **D-10 — Offline**: dice and history work fully offline (FR-013); the sheet renders the last cached snapshot **read-only** with a banner «Офлайн · изменения недоступны». Offline write-queueing rejected for Phase 1: west-marches sheets are co-edited by DM, and silent conflict resolution is worse than an honest banner. (Plan owns the caching mechanics.)
- Concurrent edits: last-write-wins per field + the sheet revalidates on focus; flagged for Plan, no UX beyond the revert toast.

---

## 8. Dice — interaction & feel (US2)

The one place the product is allowed to be loud (P5).

### 8.1 Roll sources

Every rollable modifier is a **chip with a tiny d20 glyph**: ability check, save, skill, initiative, попадание (generic and per-attack), spell attack, hit-die spend, parseable damage. One visual language = one learnable rule: «вижу кубик — могу бросить».

### 8.2 Roll card

Tap a chip → card slides over the dice tray (never a modal; the sheet stays scrollable):

```
┌──────────────────────────────────────┐
│ Магия · проверка                  ✕  │
│                                      │
│            🎲 14 + 9                 │
│               23                     │   ← 44px, mono
│                                      │
│ [ Обычный ] [ Преимущество ] [Помеха]│
│ повторить ⟳            история ▴     │
└──────────────────────────────────────┘
```

- Breakdown always shown (die face + modifier), total dominant. Advantage shows both dice: «(14, 7) + 9», the kept one bold.
- **Adv/dis** (Clarify US2-2): segmented control on the card; tapping re-rolls as a pair instantly. **D-11**: the tray also has a pre-arm toggle ⚖ for «я знаю заранее»; it applies to exactly one roll, then resets to Обычный (a sticky advantage is a lie waiting to happen at the table).
- **Crit treatment**: nat 20 → total turns gold + one 400 ms shimmer + «Критический успех!» tag; nat 1 → ink-red + short shake + «Критический провал». Word + color + icon (colorblind-safe). ★ the celebration is an open creative slot (§18): confetti? d20 spin? Andrey's call.
- Card lingers 5 s, swipe-down or ✕ to dismiss, new roll replaces it. No backdrop, no blocked UI (the sketch's full-screen overlay rejected).

### 8.3 Dice tray & pad (FR-012)

Docked 48 px bar: d20 glyph (opens pad), last result mini-text, ⚖ pre-arm. Swipe-up / tap →

```
┌──────────────────────────────────────┐
│ Свободный бросок                  ✕  │
│  [d4][d6][d8][d10][d12][d20][d100]   │
│   −  2  +      модификатор  −  +3  + │
│  2d20 + 3              [ Бросить ]   │
│ недавнее: 8d6 · 1d8+5 · 3d6+3        │
│ ── История ──────────────────────────│
│ 23  Магия ✓Пре      14:32            │
│ 7   1d8+5 урон      14:31            │
│ 2   Лвк спас ✗      14:29            │
└──────────────────────────────────────┘
```

- Builder: tap die chip sets Y, count and modifier steppers, formula line live. Multi-die sums show per-die faces in the result breakdown («8d6: 4+2+6+1+3+5+2+6 = 29»).
- «Недавнее»: last 5 distinct formulas as one-tap chips (damage re-rolls are the #1 repeat).
- **History** (FR-013): last ~20 rolls, device-local (`label · breakdown · time`), survives reload, never leaves the device; a one-line footnote says so («история хранится только на этом устройстве»). Shared/visible rolls are explicitly out of scope (bridge to spec-032).

### 8.4 Feel spec

- Tap → result < 100 ms. Number does a 300 ms scramble-settle (mono digits cycling), then breakdown fades in 150 ms. No physics, no waiting for a tumble.
- Haptics: one light tick on roll, double tick on crit — Android only (`navigator.vibrate`; iOS Safari has no vibration API, visual feedback carries it there).
- Sound: **off by default** (table courtesy); optional single die-click in settings ★.
- `prefers-reduced-motion`: instant numbers, no scramble/shimmer/shake.
- **D-12 — 3D dice**: deferred. Evidence: dice-box (the best open 3D roller) ships BabylonJS + Ammo physics in workers — megabytes of engine against a < 100 ms feedback budget and battery at a 4-hour session. The roll card is designed so a 3D layer can be added behind it later without changing the interaction contract. ★ dice skins live here too.

### 8.5 Honesty model

Client RNG, no server echo, no tamper-proofing — by design for Phase 1 (the table trusts itself; paper dice were not notarized either). Stated here so it is a decision, not an omission.

---

## 9. Import flow (US3)

Entry points: empty/draft sheet CTA «Импортировать из таблицы», app-bar ⋮, and the same route on desktop (operators may prefer a mouse; the flow is responsive, not mobile-only).

Stepper (one screen per step, progress dots):

1. **Файл**: drop/pick xlsx. Errors here are file-level («не похоже на xlsx»).
2. **Вкладка**: tab list from the workbook; the tab whose name matches the PC node is pre-selected («Маркус ↔ Маркус Грейсон»); empty tabs (Лист5) greyed out.
3. **Отчёт** (the heart, FR-015):

```
┌──────────────────────────────────────┐
│ Отчёт распознавания  · Маркус        │
│ ✅ 41   ⚠️ 3   ❌ 2   ◌ золото        │
├──────────────────────────────────────┤
│ ▾ Характеристики          ✅ 6/6     │
│ ▾ Навыки                  ✅ 18/18   │
│ ▾ Боевой блок             ⚠️ 1       │
│    Кость хитов  «6д10»               │
│    → пул: 6 × d10        [править ✎] │
│ ▾ Ресурсы                 ❌ 1       │
│    N8 «Ур. Ячейки» → не распознано   │
│    → попадёт в «Черновик импорта»    │
│ ◌ Валюта — пропущено по решению (Q4) │
├──────────────────────────────────────┤
│ ⚠ Лист правился после прошлого       │
│   импорта (08.06). Импорт перезапишет│
│   значения.        [Отмена][Перезап.]│
└──────────────────────────────────────┘
```

- Grouped by sheet section; ✅ rows collapsed by default, ⚠️ expanded with «source cell → parsed value» and inline edit, ❌ rows show raw text and their destination (draft bucket). «Золото» renders as ◌ «пропущено по решению», never as a failure (Clarify Q4).
- Apply = overwrite with confirm; the edited-after-import warning (FR-014/Q1b) is inline in the footer when triggered, with both timestamps.
4. **Готово**: snackbar «Импортировано: 44 поля» + «Открыть лист»; report persists in `/settings` («Последний импорт: 10.06, 44/46») for the FR-016 honesty audit.

Failure tone throughout: the parser is the junior here, the table is canon; copy never blames the spreadsheet («не распознано», not «ошибка в таблице»).

---

## 10. Visual language

### D-13 — Theme direction `[recommended: same family, dark-capable]`

The player mode is a lens over the same product, so it speaks the same visual language: Manrope + JetBrains Mono, flat surfaces, hairline borders, one blue accent («warm-white spreadsheet»). What it adds is a **true dark theme**, default `system`, switchable in settings: C1 happens in dim rooms, and a white screen at the table is a flashlight in everyone's eyes. Rejected directions: parchment-and-dragons cosplay (first reflex of the category; fights legibility and the existing brand) and a separate «gamer dark neon» identity (mobile and desktop are one product; D&D Beyond's app/web identity split is a documented user complaint, not a feature). Character comes from the numerals, the dice moment, and per-PC accents (★), not from texture.

### 10.1 Tokens — additions to `STYLE.md` (light values exist; dark column is new)

| Token | Light (existing) | Dark (proposed) | Used for |
|---|---|---|---|
| `--bg-0` | `#fafafa` | `#0f1115` | app canvas |
| `--bg-1` | `#ffffff` | `#16181d` | cards, sheets |
| `--bg-2` | `#f3f4f6` | `#1e2127` | chips, pressed |
| `--border-1` | `#e5e7eb` | `#2a2e36` | hairlines |
| `--fg-1` | `#111827` | `#f2f3f5` | primary text (≥ 12:1) |
| `--fg-2` | `#4b5563` | `#b4b9c2` | secondary (≥ 7:1) |
| `--fg-3` | `#6b7280` | `#8b909a` | tertiary (≥ 4.5:1) |
| `--accent` | `#2563eb` | `#60a5fa` | actions, selection |
| `--roll` | `#2563eb` | `#60a5fa` | rollable chips, d20 glyph |
| `--hp-ok / warn / low` | `#16a34a / #ca8a04 / #dc2626` | `#22c55e / #eab308 / #f87171` | HP bar & numbers |
| `--crit` | `#b45309` | `#fbbf24` | nat 20 |
| `--fumble` | `#b91c1c` | `#f87171` | nat 1 |
| `--slot` | `#7c3aed` | `#a78bfa` | spell-slot pips |
| `--manual` | `#9a3412` | `#fdba74` | `✎` override badge |

Contrast verified ≥ 4.5:1 for all text-bearing pairs; HP/state colors are never the only carrier (always paired with number, icon, or word).

### 10.2 Typography

One family for UI (Manrope), **mono for every game number** (JetBrains Mono, tabular): modifiers, HP, pips counts, roll results. The mono numerals are the product's voice — the sheet reads like an instrument, and numbers never jitter when they change.

| Style | Spec | Where |
|---|---|---|
| `num-roll` | mono 44/1 bold | roll card total |
| `num-hp` | mono 32/1 bold | HP capsule |
| `num-stat` | mono 24/1 semibold | ability modifiers |
| `num-chip` | mono 16/1 semibold | skill/save/attack chips |
| `h-name` | sans 20/1.2 bold | PC name |
| `body` | sans 14/1.5 | rows, notes |
| `label` | sans 12/1.2 semibold caps | section labels (existing token) |
| `micro` | sans 11/1.3 | sources, timestamps |

Scale ratio ≈ 1.2 (product register); root rem-based so OS font scaling works (§13).

### 10.3 Spacing & touch

4 px grid. Touch targets ≥ 44×44 px; **rollable chips ≥ 48 px** height (they are the most-used control and get the premium). Section rhythm: 24 px between cards, 12 px inside. List rows 44–52 px. Bottom content padding = tray height + safe-area.

### 10.4 Component inventory

| Component | Where | States to design |
|---|---|---|
| `ModChip` (rollable) | stats, saves, skills, attacks | default / pressed / rolling / edit / disabled-offline |
| `StatTile` | 6.4 | default / edit |
| `HPCapsule` + `HPSheet` | vitals | ok / warn / low / zero(death saves) / temp |
| `PipTrack` | resources, slots, hit dice, death saves | filled / empty / press / overflow(>12→counter) |
| `ResourceCard` | 6.6 | default / edit / empty |
| `SpellRow` | 6.7 | prepared / unprepared / expanded / edit |
| `SectionHeader` | all | expanded / collapsed / badge |
| `Badge` | `ƒ` `✎` `К` `Д` `R` | static |
| `ProfDot` | skills, saves | ○ ◐ ● ◉ (+edit cycling) |
| `RollCard` | dice | normal / adv / dis / crit / fumble |
| `DiceTray` + `DicePad` | dice | docked / expanded / history |
| `ConditionChip` (D-08) | vitals | active / add |
| `AttuneTag` | gear | настроен / не настроен |
| `ReportRow` | import | ✅ ⚠️(editable) ❌ ◌ |
| `Banner` | offline, FR-017, draft | info / warning |
| `EmptyState` | per §14 | static |
| `Snackbar` | undo, save errors | action / plain |

Every interactive component ships all standard states (default/press/focus-visible/disabled); no hover-dependent affordances (touch-first), hover styles exist only as desktop-responsive bonuses.

### 10.5 Iconography

Thin-line set, 20 px grid, ~10 icons total (menu, edit, dice-d20, rest-moon, rest-sun-half, import, settings, history, add, close). The **d20 tick** on rollable chips is the one custom glyph and the de-facto logo of the mode ★. No emoji in chrome (the sketch's tab emojis rejected); emoji allowed inside user free text, obviously.

---

## 11. Motion & feedback

| Event | Motion | Duration |
|---|---|---|
| Roll result | digit scramble → settle, breakdown fade-in | 300 + 150 ms |
| Crit / fumble | gold shimmer / 4 px shake | 400 ms, once |
| Pip toggle | scale 0.8→1 fill | 120 ms |
| HP change | bar width + color crossfade; number ticks | 180 ms |
| Section collapse | height + chevron | 180 ms |
| Sheets/tray | translateY, ease-out-quart | 220 ms |
| Save error revert | field flash `--fumble` 20% | 240 ms |

Existing `--dur/--ease` tokens reused; new `--dur-roll: 300ms`. Nothing else moves (P5). All of it collapses to instant under `prefers-reduced-motion` (already global in `globals.css`). No page-load choreography: the sheet appears as a skeleton (§14) and fills.

---

## 12. PWA & platform behaviors

- **Manifest**: `display: standalone`, portrait, `start_url: /m`, name ★ (working title «Лист» — see §18), `theme_color` per theme, maskable icon ★.
- **iOS**: A2HS has no install prompt → first-run hint screen with the share-sheet steps («Поделиться → На экран "Домой"»), shown once, skippable. `viewport-fit=cover` + safe-area insets (tray sits above the home indicator). No vibration API: haptics silently absent, visual feedback carries.
- **Offline scope**: app shell + dice + history fully offline; sheet = last snapshot, read-only + banner (D-10). Spec only mandates offline dice (FR-013); cached read is a cheap superset. Mechanics (SW strategy, cache keys) → Plan.
- **Open counter (FR-019)**: fire-and-forget ping on PWA open; `(user, date)` unique; nothing device-identifying; offline opens ping on reconnect (best-effort, not queued-forever).
- **Perf budget** (numbers for Plan to enforce): cold open → interactive sheet < 2.5 s on a mid-range Android; tap → roll feedback < 100 ms; formula recompute is synchronous (< 1 ms, it is twenty integers); `/m` shell JS target < 200 KB gz.
- Keyboard avoidance: bottom sheets with inputs (HP pad, edit fields) resize above the keyboard; the dice tray hides while any text input is focused.

---

## 13. Accessibility & ergonomics

- **Thumb map**: dice tray, roll card, HP sheet, rest confirms — all bottom-anchored (primary thumb arc). Section chips top (rare, two-hand tolerable). Nothing critical hides behind the top corners.
- **One-hand reach**: every C1 action reachable without grip change on a 6.1" phone; section jumps exist precisely so deep scrolling is never required mid-turn.
- Color never alone: crit = gold **+ word + glyph**; prof dots differ by fill **+ ring**; ⚠️/❌ have icons.
- Font scaling: rem-based; layout audited at 120% (chips wrap, rows grow, nothing truncates meaning). RU long labels measured: «Проницательность» (15 ch) fits a 44 px row at `body` size with the dot+tag+chip; worst case «Уход за животными» wraps to 2 lines gracefully.
- `focus-visible` rings on all interactives (the sheet is also used on desktop by the DM); ARIA: pips are `slider`-like groups with value text, roll chips announce «Магия, плюс девять, бросить».
- Screen-reader pass is a Plan-phase checklist item, not re-litigated here.

---

## 14. States catalogue

| Surface | State | What the player sees (copy v0) |
|---|---|---|
| `/m` | 0 PC | «Пока у тебя нет персонажа в этой кампании. Напиши ДМу — он привяжет твоего PC.» |
| `/m/pcs` | N PC | list; DM sees «Мои / Остальные» groups |
| Sheet | loading | skeleton: vitals band + 3 section ghosts (no spinner) |
| Sheet | legacy node, no structured sheet | draft mode: section ghosts + dual CTA «Импортировать из таблицы» / «Заполнить вручную» (edge case from spec US1) |
| Sheet | read-only (not owner/DM) | no edit affordances, dice still work, footer «Лист {имя} · только просмотр» |
| Sheet | offline | banner «Офлайн · изменения недоступны», chips still roll |
| Sheet | save failed | field reverts + snackbar «Не сохранилось · Повторить» |
| Section | empty | one-liner + «+ Добавить» (edit mode), dashed border (existing token) |
| Import | bad file / no tabs / parse crash | step-level message, never a dead end: «Назад» preserved; Никандр-grade drift **must not crash** (FR-016) — worst case is an all-❌ report |
| Desktop DM page on phone | FR-017 | top banner «Эта страница не оптимизирована для телефона → Открыть мобильный режим» |
| Roll history | empty | «Бросков пока не было — тапни любой модификатор» |
| Валюта | placeholder | §6.11 copy |

---

## 15. Future-fit (how P2/P3 stories dock in)

- **US4 деньги**: §6.11 card becomes live balance + last 3 transactions + «Все операции» → mobile ledger; the approval flow reuses bottom-sheet forms. No nav change.
- **US5 предметы**: gear rows gain item-card links and quantities; attunement stays where it is.
- **US6 лента**: the reserved bottom nav appears with two destinations «Лист / Лента» (D-01 already accounts for it); session recaps reuse the read-view typography.
- **US7 энкаунтер**: a live encounter pins a banner under the vitals («Бой · раунд 3 · твой ход») and the roll card gains a «отправить в энкаунтер» action — the dice bridge promised to spec-032.
- **Phase 2 компендиум**: matched spell/feature names get a chevron into reference cards; free text remains the storage, links are decoration (spec's no-migration promise).
- **Phase 3 билдер**: edit mode is the seam; the builder replaces *how* build-state changes, not the play sheet.

---

## 16. Research appendix

Each reference: what was examined → adopted → rejected. Repos were read directly (cloned at `--depth 1`, 2026-06-10).

1. **Таблица Стасяна** (`references/stasyan-sheets-2026-06-10.xlsx`, 4 tabs) — the canon. Adopted: the entire input/derived split, multiplier dots, «всего/осталось» resources, умения-with-source, спас-DC at top. Discovered beyond the memory-doc: attunement columns, валюта «С собой/Дома», two spell column-pairs, Никандр drift (full-word labels, class cell moved, «6д10» as text) — all folded into §6 and the import report design.
2. **Бумажная Миряна** (photos, chat 93) — the wizard stress-case: multiclass string, override DC (18 vs ƒ17), prepared «✓» and «R» marks (→ D-07), charge resources («Chronal Shift ✓✓✓✓✓», «стазис»), potions among attacks, homebrew features. The sheet must hold all of it with zero compendium: it does (§6.7/6.8 free text + source).
3. **Набросок `Чарлист.zip`** (React prototype, Маркус) — autopsy. Adopted: rollable rows everywhere, the pip tap-logic, HP bar color thresholds, attunement tags with counter, features grouped by source, app-token reuse. Rejected: 5-tab bottom bar (fragments the sheet; had to duplicate Ци on two tabs), full-screen modal roll overlay with auto-dismiss and no history, ±1-only HP buttons (damage 14 = 14 taps), spells/features as truncating chips, emoji tab icons, localStorage as the source of truth.
4. **D&D Beyond** (web sheet + mobile app; store pages, forums, release posts) — the genre gold standard and its cautionary tales. Adopted: tap-to-roll with auto math, slot pips at spell levels, HP damage/heal entry, rest buttons, conditions row, offline-sheet ambition. Cautionary: the mobile app is a paged card view that its own tablet users bypass for the dense web sheet; app lacked in-place editing for years («adjustments via in-app browser»); identity split between app and web themes. Confirms D-01/D-09/D-13.
5. **Fight Club 5 (Lion's Den)** — the at-table speed benchmark: fully offline, auto-calc with manual bonus overrides, spellbook with «prepared for the day» toggle and slot tracking, community import-file culture. Direct precedent for D-07 and for treating import as a first-class feature, not an admin tool.
6. **Foundry VTT dnd5e** (repo: `templates/actors/*`, rest dialogs, favorites in actor model) — adopted: short/long rest as distinct confirm dialogs, prepared toggles in the spellbook, slot pips, death-saves in the header area. Noted for later: the favorites/pin system (a curated quick bar) is the best answer if our single-scroll sheet ever feels long — candidate for a fast-follow, not Phase 1.
7. **Tidy 5e Sheets** (repo README/features) — community UX layer over #6: customizable sections, expand-to-detail rows, themes, an «all usable actions» tab grouped by action economy. The latter maps to backlog spec-040 (трекер трат на ход), not Phase 1. Validates expandable rows over chips (§6.8).
8. **DiceCloud** (repo: `app/imports/api/properties/*`, 30 property types) — the open-source proof of the «reactive dependency graph» idea the memory-doc names. Adopted in spirit: provenance («where does this number come from») as a long-press breakdown. Rejected for Phase 1: the full property/effect tree — that is the Phase 3 builder's territory, and DiceCloud's own README admits setup costs more than paper.
9. **dice-box** (repo) — best-in-class open 3D roller: BabylonJS + Ammo physics in web workers. Used as *evidence* for D-12 (3D = megabytes + battery vs a 100 ms budget), and as the integration path if 3D ever earns its way in.
10. **Long Story Short** (`references/lss-character-export-sample.json`) — RU-market reference for field modeling and terminology; its double-serialized `data` string is the documented anti-pattern for our import/export thinking.
11. **Официальный лист 2024** (WotC/DDB release coverage) — the 2024 redesign moves attunement onto the main sheet (we do too) and groups skills under their abilities; we deliberately keep the flat 18-row list (D-14) because both Стасян's table and the players' paper habit are flat lists, and a fixed alphabet builds spatial memory.
12. **Roll20 mobile** — anti-reference: a desktop form factor squeezed onto phones; tiny tap targets, form-first not play-first. The shape of failure P1/P2 exist to avoid.

---

## 17. Decision log

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D-01 | Navigation model | single scroll + sticky section chips; bottom bar reserved for US6 | ☐ |
| D-02 | Sticky vitals contents | HP + AC + Init + conditions | ☐ |
| D-03 | Section order | play-frequency order (§5), collapse below the fold | ☐ |
| D-04 | Saves placement | inside ability tiles, separately rollable | ☐ |
| D-05 | Rest buttons | resources-section footer + ⋮ menu; confirm sheet with restore summary | ☐ |
| D-06 | Attack damage | free text; parseable XdY±Z becomes a rollable chip | ☐ |
| D-07 `[SPEC]` | Prepared spells | per-spell ✓ toggle, live in play mode; import defaults ✓; +1 sentence to FR-008 | ☐ |
| D-08 `[SPEC]` | Conditions on sheet | vitals chip row: presets (RU 5e list) + free text; self-tracked, no rules engine; new FR | ☐ |
| D-09 | Editing model | two layers: play-state live, build-state behind «Редактировать» | ☐ |
| D-10 | Offline writes | read-only offline sheet + banner; dice fully offline | ☐ |
| D-11 | Adv/dis pre-arm | tray toggle applies to one roll, then resets; card re-roll always available | ☐ |
| D-12 | 3D dice | defer; 2D scramble-settle; contract kept 3D-compatible | ☐ |
| D-13 | Theme | inherit token family; add dark set; default = system | ☐ |
| D-14 | Skills order | fixed RU alphabet (spatial memory) over grouping/sorting | ☐ |
| D-15 | Заметки block | one free-form notes section on the sheet | ☐ |

D-08 detail (it is the only net-new feature proposed): a «Состояния» chip row in the vitals zone — tap «+» → preset list (Концентрация first, then the standard RU conditions, Истощение with a level) + free text; chips removable by tap-✕. No mechanical effects, purely a shared visible tracker, exactly like the pencil marks players make on paper today. Cost: one chip component + one array field. Value: concentration is the single most-forgotten table state for casters, and three of four reference PCs are casters. If rejected: nothing else in the design depends on it.

## 18. Open creative slots ★

| ★ | Slot | Seed ideas (non-binding) |
|---|---|---|
| ★1 | PWA name + icon | «Лист», «Чарник», «Гримуар»; icon = the d20 tick glyph |
| ★2 | Crit celebration | gold shimmer (spec'd) vs d20 burst vs subtle screen-edge glow |
| ★3 | Per-PC accent color | player-picked tint for portrait ring / chips: cheap ownership |
| ★4 | Dice sound | off by default; one «click» sample if ever |
| ★5 | Empty-state voice | dry vs in-world Cyoria flavor («Пока пусто — даже Зориан с этого начинал») |
| ★6 | Loading flavor | skeleton only (spec'd) vs one-line rotating table quotes |
| ★7 | Dark theme name | settings label: «Тёмная» vs «Подземелье» |

## 19. Next step

1. **Andrey's review pass** over this file: mark each D-01…D-15 «ок» or override (inline comments / chat list, either works), pick ★ where desired. The two `[SPEC]` items (D-07, D-08) decide whether `spec.md` gets a one-line amendment each before Plan.
2. Claude folds the review into **design v1.1** (same file, changelog section) and applies any spec amendments.
3. **Plan phase** (on explicit go): `plan.md` (routes, components, state/query strategy, SW), `data-model.md` (the sheet field model — §6 is its direct input), `contracts/` import parser spec with `references/stasyan-sheets-2026-06-10.xlsx` as the test fixture (Маркус/Бальтазар/Дамбиниус ≥ 90%, Никандр graceful), then Tasks.

**Designed but deferred** (explicit debt): desktop-responsive polish of `/m` routes, US7 encounter surface, favorites/pin bar, 3D dice, per-PC theming (★3 if not picked now), screen-reader deep pass (Plan checklist).

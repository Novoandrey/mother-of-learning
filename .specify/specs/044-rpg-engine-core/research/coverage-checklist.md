# Coverage checklist — pilot PC property inventory

**Spec**: 044-rpg-engine-core (research artifact, NOT a spec — no DoD, lives
as long as the epic; see spec.md "Companion artifact")
**Created**: 2026-06-12 (chat 95) · **Last audit pass**: — (none yet)

## Purpose

Living inventory of EVERY property / item / spell / cooldown of the three
pilot PCs, each classified by how the engine represents it. Drives:

1. the target/op dictionaries (FR-011, FR-014) — ops and keys are added
   because rows here demand them, not speculatively;
2. SC-001 (100% representable, text counts);
3. content-spec priorities (045/047/049 check rows off as canon bases land).

**Ratchet rule (FR-014)**: a new effect op enters the dictionary only when
≥ 3 rows here demand it. Tally below is the evidence.

## Representation classes

| Class | Meaning |
|---|---|
| `text` | name + free text + source; `effects: []` — valid forever |
| `effect:<op>` | numeric effect(s); list target keys in the Targets column |
| `resource` | uses with recharge (К / Д / рассвет / manual) |
| `grants` | bundles other modules (race traits, факультатив → trimmed feat) |
| `layer-0` | covered by base derivation / PC state, not a module |
| `❌ cannot` | engine cannot represent → spec gap, escalate to Andrey |

A property may need several classes (e.g. `resource` + `effect:add`).

## Pilots & sources

| PC | Sheet source | Status |
|---|---|---|
| Миряна Кастиль | paper photo (`../../022-player-mobile-mode/references/`, chat 93) + memory doc | ready to audit |
| Каэл | LSS JSON export | ⏳ awaiting export from Андрей |
| Британия Мерц | **source not fixed** — Андрей, укажи (таблица? бумага? LSS?) | blocked |

Reference tabs (Маркус / Бальтазар / Дамбиниус / Никандр,
`stasyan-sheets-2026-06-10.xlsx`) are secondary evidence — use them to
cross-check op demand, do not inventory them row-by-row unless a pilot is
ambiguous.

## Inventory

Columns: Property · Where on sheet · Class · Targets/ops needed · Notes.
Seed rows below validate the format — replace during the first audit pass.

### Миряна Кастиль

| Property | Where | Class | Targets/ops | Notes |
|---|---|---|---|---|
| Chronal Shift ✓✓✓✓✓ | paper, resources | resource | max 5, recharge TBD | seed example |
| Спас-DC 18 (ручной) | paper, header | layer-0 | override ✎ | sheet ƒ = 17; FR-008 case |
| _TODO: full pass_ | | | | |

### Каэл

⏳ blocked on LSS export.

### Британия Мерц

⏳ blocked on source.

## Op demand tally (ratchet evidence)

| Op | Demand count | Rows |
|---|---|---|
| add | 0 | |
| set | 0 | |
| override | 0 | |
| mult | 0 | |
| advantage (P2) | 0 | |
| when (P2) | 0 | |
| duration (P2) | 0 | |
| _proposed new op_ | — | needs ≥ 3 rows before entering FR-010 |

## Target keys demanded

Running list; feeds the final FR-011 dictionary at Clarify/Plan.

- (empty — fill during audit)

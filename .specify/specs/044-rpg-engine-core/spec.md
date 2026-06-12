# Feature Specification: RPG Engine Core — modules, effects, resources

**Feature Branch**: `044-rpg-engine-core`
**Created**: 2026-06-12 (chat 95)
**Status**: Specify draft — awaiting Clarify
**Epic**: `.specify/epics/rpg-engine/constitution.md` — binding principles
E1–E11 and decisions R1–R8; this spec must satisfy them.
**Revised**: 2026-06-12 (chat 95 review): UI/UX surfaces are IN scope (E1 —
UX dictates data); transparency decided (R6) — C-06 resolved.
**Input**: Pivot (chat 93) + epic breakdown (chat 95): «персонаж = пирамида
модулей по уровням (раса / класс-уровни / фиты / предметы / баффы); модуль
декларирует эффекты на параметры — одна система вместо хардкода спеллов;
MVP модуля = текстовое поле без эффектов; формулы Стасяна — слой-0 деривации;
канон-ноды прибиты; хоумбрю — через форк и конструктор».
**Depends on**: entity graph (spec-001), existing PC data (spec-007 +
migrations 112–113), item catalog (spec-015/018).
**Downstream consumers**: spec-022 v3 (mobile sheet — first), specs 045–050
(epic), spec-032 encounter rework (duration effects dock there).

## Context

spec-022 v2 specified the sheet against a fixed field model mirroring
Стасян's spreadsheet. That model hardcodes every property *category*: spells
would need a spells subsystem, feats a feats subsystem, факультативы a third —
each with its own storage, UI and rules. Chat 93 pivoted to one universal
mechanism instead.

**The model.** A character is a pyramid of modules acquired over levels:
race, class levels, feats, items, buffs, free-text properties. A module is a
node that *declares* what it does — effects on parameters, a resource with a
recharge — instead of the system hardcoding what each category does.
Patterns: Component (modules compose a PC), Type Object (template node /
per-PC instance), Prototype (fork = copy), data-driven design.

**Text-first.** The MVP module is name + free text + source with
`effects: []` — a fully valid module. The sheet lives immediately; structure
grows property by property, driven by the coverage checklist. Complex
properties may stay text forever; that is fine (design.md P3: «бумага
прощает»).

**Layer-0.** Стасян's formulas are not discarded — they are the derivation
base (mod, PB, skills, saves, DC per
`.specify/memory/character-sheet-excel-system.md`). Effects fold on top;
manual overrides stay.

Existing assets this builds on: nodes/edges graph with JSONB fields
(Constitution II), empty `spell` node_type, 64 факультатив nodes
(IDEA-037 already sketched `elective.effects jsonb` — this spec generalizes
it), 844 canon items (spec-018), PC `fields.stats` (migrations 112–113).
Encounter conditions/effects (specs 002/005) stay a separate system for now;
unification docks at spec-032.

## Epic map

Canon (map, ordering, principles E1–E11, decisions R1–R8):
`.specify/epics/rpg-engine/constitution.md`. Short form: 044 (engine +
module surfaces) → 022 v3 (sheet) → 045 (spells base) → 046 (fork) →
047 (feats/backgrounds) → 048 (pyramid) → 049 (classes) → 050 (constructor).
Mobile-first critical path: **044 P1 → 022 ship**.

**Companion artifact (not a spec):** `research/coverage-checklist.md` —
living inventory of every property / item / spell / cooldown of the three
pilot PCs (Каэл, Миряна, Британия), each classified as
text / effect / resource / grants / layer-0. Seeded with this spec, updated
by every content spec.

## Scope

**In (P1) — engine:** module-as-node model; PC↔module attachment with
instance state; resources (declare, spend, restore, rest semantics); layer-0
derivation library with manual overrides; static effect pipeline
(`add`/`set`/`override`/`mult`) with deterministic fold order and per-value
provenance breakdown; canon flag + enforcement; `grants` edge type (relation
+ traversal); read path for existing PC data.

**In (P1) — engine surfaces (E1: UX dictates data):** the **module card** —
universal read surface answering «что делает X» for any module, own or
foreign, canon or homebrew (FR-022); **add/attach flow** — create a text
property or attach an existing module from the phone in seconds (FR-023);
**transparency** — every campaign member reads every sheet and every module
(FR-003, R6); human-readable effect rendering; breakdown → card navigation.

**In (P2, schema reserved in P1):** conditional effects (`when`), timed
effects (`duration` — buffs), `advantage` op; grants auto-materialization.

**Out:** the sheet as a *play* surface — layout, vitals, dice, rest buttons,
xlsx import (spec-022; the sheet embeds 044's card and add flow); content
imports (045/047/049); fork UX (046); effect *authoring* UI (050 —
effect *display* is in scope here); pyramid / level-up UI (048); class
scaling formulas and spell-slot tables (049); encounter runtime integration
(032); full event-sourcing replay (Constitution V); realtime push (E7 —
deliberate deferral).

## User Scenarios & Testing

### User Story 1 — Text-first module attachment (Priority: P1)

Every property on a pilot PC's sheet — умение, атака, заклинание,
факультатив, a hand-written note — can exist as a module node attached to
the PC with a source label («Ильза», «ГМ дал», «Факультатив») and free
text, with zero structure.

**Why this priority**: this is the substrate spec-022 renders; without it
nothing ships.

**Independent Test**: attach «Chronal Shift» to Миряна as a text module with
a source; read the PC's modules grouped by source → present, intact.

**Acceptance Scenarios**:

1. **Given** a PC, **When** a text module (name + text + source,
   `effects: []`) is attached, **Then** it appears in the PC's module list
   with its source and survives round-trip unchanged.
2. **Given** Миряна's paper sheet, **When** every property on it is entered
   as text modules, **Then** nothing is rejected for lack of structure
   (P3: no validation walls).

---

### User Story 2 — Layer-0 derivation with manual overrides (Priority: P1)

The system derives mod / PB / skills / saves / DC / passive perception from
base inputs per the canon formulas; class-dependent values (AC, initiative,
attack, max HP) have default formulas; any derived value accepts a visible,
reversible manual override.

**Why this priority**: the sheet's numbers; parity with the spreadsheet is
the floor (Constitution VII transfer rule).

**Independent Test**: feed the 4 reference xlsx tabs' inputs → derived
outputs match the sheet's computed cells; set DC override 18 on Миряна
(formula says 17) → 18 wins; revert restores 17.

**Acceptance Scenarios**:

1. **Given** base inputs from a reference tab, **When** layer-0 runs,
   **Then** every derivable cell matches the fixture.
2. **Given** a manual override on a derived value, **When** the value is
   read, **Then** the override wins and is flagged, and «вернуть формулу»
   restores derivation.

---

### User Story 3 — Resources with recharge and rest (Priority: P1)

A module declares a resource (max + recharge К/Д/рассвет/manual); the PC's
attachment tracks remaining; spend/restore operations exist; short/long rest
restores per recharge flags and reports what was restored (spec-022's rest
confirm sheet consumes this report).

**Independent Test**: Ци 12 (К): spend 3 → 9; short rest → 12; a Д-resource
is untouched by the short rest.

**Acceptance Scenarios**:

1. **Given** attached modules with К and Д resources, **When** a short rest
   is applied, **Then** К-resources restore to max, Д-resources do not, and
   the operation returns a human-readable summary of what changed.

---

### User Story 4 — Static effects with provenance (Priority: P1)

A module declares effects `{target, op, value}`; derived values fold layer-0
+ effects in a deterministic order; every derived value can report its
breakdown («+9 = +5 Инт +4 БМ +1 Предмет»).

**Why this priority**: this is the engine's reason to exist; canon items are
the first real consumers (smoke test of universality before any content
base).

**Independent Test**: attach an item module with
`{target: "ac", op: "add", value: 1}` to a pilot PC → AC rises by 1,
breakdown names the item; detach → restored.

**Acceptance Scenarios**:

1. **Given** an effect targeting a base stat (ASI-like +2 Str), **When**
   derived values are computed, **Then** the stat effect applies before
   layer-0, so dependent skills/saves shift accordingly.
2. **Given** a manual override on a value that also receives effects,
   **Then** the override is final, and the breakdown still lists the
   eclipsed contributions [C-01].

---

### User Story 5 — Inspect any module: «что делает X» (Priority: P1)

Any campaign member opens any module — their own, another PC's, a canon
item, a homebrew spell — and gets a card that explains it in human terms:
free text, effects rendered readably («+1 к КД», «преимущество на
Скрытность»), resource with current uses, provenance (canon / forked-from /
author / source label). The card is reachable from everywhere a module name
appears: sheet rows, breakdowns, the catalog. (R6 transparency; E5.)

**Why this priority**: Andrey's review (chat 95) — the ability to see what
your or ANY item/spell does is a core reason the engine exists; it also
*defines* the data contract (E1).

**Independent Test**: as a player who does not own Маркус, open a module
attached to Маркус → full card renders; tap a breakdown term «+1 Предмет» on
any derived value → the source module's card opens.

**Acceptance Scenarios**:

1. **Given** any module in the campaign, **When** any campaign member opens
   it, **Then** the card shows text, effects (human-readable), resource
   state and provenance — no edit affordances unless the viewer has edit
   rights.
2. **Given** a derived value's breakdown, **When** a contribution row is
   tapped, **Then** the contributing module's card opens.

---

### User Story 6 — Grants: module grants modules (Priority: P2)

A module can grant other modules (race → trait bundle; факультатив →
trimmed feat fork). Consumers can traverse the grants relation; attaching a
granter makes grantees reachable in the PC's effective module set.

**Independent Test**: a race module grants 3 trait modules; attach the race
to a PC → traits reachable via traversal.

---

### User Story 7 — Conditional & temporary effects (Priority: P2)

Effects may carry `when` (condition) and `duration` (buffs); op `advantage`
exists. P1 stores and surfaces them as text without auto-applying.

**Independent Test**: an effect with `when` present is persisted, shown
verbatim, excluded from the numeric fold, and marked "manual" in the
breakdown.

---

### Edge Cases

- Module attached twice (two identical daggers) → instances independent
  (uses, overrides).
- Detaching a module that granted others → behavior per [C-02].
- Unknown target key in `effects` → validation fails loudly; never silently
  dropped.
- Effects on a value the PC overrode manually → override wins [C-01];
  breakdown still lists suppressed contributions.
- Canon node edit by non-owner → denied; fork (046) is the path.
- PC with zero modules (all 31 today) → layer-0 still derives from existing
  `fields.stats`; a zero-module PC is fully valid.
- Rounding: integer math with floor everywhere, per the canon memory doc.

## Requirements

### Module model

- **FR-001**: Any node MAY act as a module template via uniform optional
  fields: `effects[]`, `resource`, module metadata. A module with empty
  effects and no resource is valid (text-first). No per-category storage
  shapes — spells, feats, items, факультативы and free-text properties share
  one mechanism.
- **FR-002**: Template/instance split: the node holds the shared definition
  (text, effects, resource max + recharge, canon flag); a PC↔module
  attachment holds per-PC state: level acquired, source label,
  `uses_remaining`, instance overrides, display order. Multiple attachments
  of one template to one PC are allowed and independent.
- **FR-003**: Free-text sheet properties are full module nodes (decided
  chat 95) — no inline-row second representation. **Transparency (R6)**:
  every campaign member can read every PC sheet and every module; editing
  stays rights-gated (`canEditNode` / `isPcOwner`). Navigation noise is
  controlled without hiding data: per-PC property nodes stay out of the
  sidebar and global search by default (type-level flag; full visibility
  linza — spec-033) but are always reachable via their PC's sheet and via
  card links; content-base and canon types are globally searchable.
- **FR-004**: Canon flag: canon nodes are read-only for everyone except the
  campaign owner; owner edits are in-place and unversioned (v1 decision,
  chat 95). Server actions enforce this.
- **FR-005**: Fork fields reserved now: `forked_from` provenance on nodes;
  fork semantics = full copy, upstream changes not propagated (decided
  chat 95). Fork UX is spec-046.

### Layer-0 derivation

- **FR-006**: A pure, deterministic derivation library implements the canon
  formulas (memory doc): модификатор = ⌊(стат − 10) / 2⌋;
  БМ = ⌊(ур − 1) / 4⌋ + 2; навык = мод + ⌊БМ × множ⌋, множ ∈ {0, 0.5, 1, 2};
  спас = мод [+ БМ]; спас-DC = 8 + мод + БМ; пассивная внимательность.
  Same results client- and server-side.
- **FR-007**: Class-dependent values (КД, инициатива, попадание, макс. хиты,
  скорость) compute by default formulas and accept manual override (FR-008).
- **FR-008**: Manual override (✎) per derived value: visible, reversible
  («вернуть формулу»), and absolute — final after all effects [C-01].
  Stored as part of the PC's layer-0 state.
- **FR-009**: Base inputs (6 stats, level, skill multipliers, save
  proficiencies, HP current/max/temp) continue to live on the PC node; the
  engine defines the read path from existing `fields.stats` (migrations
  112–113). **No data loss, no flag-day migration for the 31 live PCs.**

### Effect pipeline

- **FR-010**: Effect schema v1:
  `{ target: key, op: "add" | "set" | "override" | "mult", value: number }`.
  Reserved P2 keys: `when`, `duration`; op `advantage`. P1 validates the
  full schema; effects carrying P2 keys are stored and surfaced as text,
  excluded from the numeric fold [C-03].
- **FR-011**: Target dictionary: a fixed, documented system-level registry
  of keys (`stat.*`, `save.*`, `skill.*`, `ac`, `initiative`, `speed`,
  `attack`, `spell_dc`, `hp_max`, `passive_perception`, …) — final list fed
  by the coverage checklist during Clarify/Plan. Unknown targets fail
  validation loudly.
- **FR-012**: Deterministic, documented fold order:
  (1) effects targeting base inputs → (2) layer-0 derivation →
  (3) effects targeting derived values with op precedence
  `set → add → mult → override` → (4) manual ✎ override, absolute [C-01].
- **FR-013**: Provenance: every derived value can produce a breakdown
  listing each contribution (layer-0 terms, each effect with its source
  module, the override) — the data behind design.md's «разложение» (D-09
  long-tap).
- **FR-014**: Op admission ratchet: a new op enters the dictionary only when
  the coverage checklist shows ≥ 3 real properties needing it (tally lives
  in the checklist).

### Resources

- **FR-015**: Resource declaration on the template:
  `{ max: int, recharge: "short" | "long" | "dawn" | "manual" }`; remaining
  lives on the attachment (FR-002). Max scaling by class level is out of
  scope (spec-049); manual max edits cover until then.
- **FR-016**: Operations: spend(n), restore(n), set-remaining,
  rest(short | long). Rest computes and applies restores per recharge flags
  across the PC's modules and returns a summary («Восстановится: Ци 12;
  Ячейки 2-го круга 2») that spec-022's confirm sheet renders. Hit dice and
  spell slots are representable as resources (slot *tables* are 049; manual
  maxima until then, matching design.md §6.7).
- **FR-017**: Inspiration (0/1), death saves and temp HP remain layer-0 PC
  state, not modules — they are sheet state, not acquired properties.

### Relations

- **FR-018**: `grants` edge type (module → module). P1 ships the relation
  and traversal; auto-materialization on attach (and detach cascade) is P2
  [C-02].

### UX surfaces (chat 95 review — E1)

- **FR-022**: **Module card** — one universal read surface for any module.
  Renders: title, source label, free text, effects in human-readable form
  (per-op templates: «+1 к КД», «Скрытность: преимущество»), resource with
  max + remaining, badges (canon / forked-from → link to origin / `✎`
  instance overrides). Reachable from every place a module name appears:
  sheet rows (022 embeds it), breakdown contributions (FR-013), catalog,
  search results. Read-only unless the viewer has edit rights.
- **FR-023**: **Add/attach flow** — from a phone, one continuous action:
  (a) create a text property (name required, text/source optional) attached
  to the PC, or (b) find an existing module (canon item, spell, another
  campaign module) and attach it. No mandatory fields beyond the name, no
  validation walls (E3/E6). Effect *authoring* is out (spec-050); editing
  the text/source of an own module is in.
- **FR-024**: **Single source of truth, always fresh (E7)**: one stored
  state per sheet; any member's read reflects the latest write without
  manual sync; concurrent edits resolve last-write-wins per field with an
  honest rollback toast (no silent merge). Realtime push explicitly
  deferred.

### System qualities

- **FR-019**: Derivation is synchronous, pure and fast (< 1 ms for a full
  PC — design.md §12 budget); no IO inside the fold.
- **FR-020**: Nothing campaign-specific hardcoded (Constitution IX): ops,
  targets and recharge kinds are system-level; all content is data. The
  dictionary is D&D-5e-shaped but lives in data/config, not branching code.
- **FR-021**: All writes go through auth-gated server actions (AGENTS.md
  canon); module reads respect campaign membership.

## Key Entities

- **Module template** (node): title, free text, default source, `effects[]`,
  `resource` definition, canon flag, `forked_from` (reserved). Any content
  type can be one.
- **Attachment** (PC ↔ module): level acquired, source label,
  `uses_remaining`, instance overrides, order. The pyramid is this set
  viewed by level (spec-048 renders it).
- **Layer-0 state** (on the PC node): base inputs + manual overrides;
  today's `fields.stats` is the seed.
- **Derived value + breakdown**: computed on read, never stored as truth
  (snapshots are cache — Constitution V).
- **Target / op dictionaries**: system-level registries documented in this
  spec folder.
- **Coverage checklist**: research artifact,
  `research/coverage-checklist.md`.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of the three pilot PCs' sheet properties are
  representable (text counts) — coverage checklist shows zero
  «cannot represent» rows.
- **SC-002**: Layer-0 output matches the canon fixture
  (`../022-player-mobile-mode/references/stasyan-sheets-2026-06-10.xlsx`,
  4 tabs) on every derivable cell; Миряна's paper override (DC 18 vs ƒ17)
  reproduces via FR-008.
- **SC-003**: Attaching a module with `+1 ac` changes derived AC by exactly
  1 and the breakdown names the module; detaching restores. (First real
  consumers: canon items.)
- **SC-004**: Resource spend → rest round-trip is correct for К, Д and
  manual recharge on a pilot PC.
- **SC-005**: spec-022 v3's Plan references P1 FRs only — no P2 item blocks
  the Phase-1 sheet.
- **SC-006**: All 31 existing PCs render layer-0 values with zero modules
  attached and zero data migration.
- **SC-007**: A campaign member with no edit rights opens a module attached
  to someone else's PC and the card explains it (text + readable effects +
  resource + provenance); a breakdown contribution tap lands on the source
  module's card.
- **SC-008**: Creating and attaching a text property from a phone is one
  continuous flow with no mandatory field beyond the name — faster than
  writing it on paper (target ≤ 15 s; exact budget set in the design pass).

## Assumptions

- D&D 5e shape, data-driven (Constitution IX); other systems out of scope
  but nothing blocks them structurally.
- Module nodes add ≈ +1–2k nodes for 31 PCs; read access for the whole
  campaign (R6); kept out of sidebar/global search by default purely as
  noise control (FR-003), always reachable via sheet and cards; the
  «pagination cap 10k» tail (spec-001) moves closer — tracked, not a
  blocker (~1.6k nodes today).
- Buffs are modules attached with `duration` instance state; runtime ticking
  docks at spec-032, not here.
- Стасян's spreadsheet remains the players' source of truth until spec-022
  ships; the engine must not require the spreadsheet to change.

## Open questions → Clarify

- **C-01**: Confirm the fold chain (FR-012), in particular: manual ✎ is
  absolute and wins over all effects. *Recommendation: as stated.*
- **C-02**: grants resolution — materialize attachments on attach (with
  detach cascade) vs traverse at read time. *Recommendation: read-time
  traversal in P1 — no cascade bugs; materialize later if performance
  demands.*
- **C-03**: Effects carrying P2 keys in P1 — store-inert-and-show-as-text
  vs reject. *Recommendation: store-inert (forward-compatible, no data
  loss).*
- **C-04**: Module node types — one generic `module` type vs per-category
  types sharing the schema vs reuse existing types (`spell`, item) + add
  minimal new ones. *Recommendation: reuse existing + add minimal; the
  schema is uniform either way.*
- **C-05**: Target dictionary extensibility — fixed system-level v1 vs
  per-campaign additions now. *Recommendation: fixed v1.*
- **C-06**: ~~Visibility of a player's private text modules.~~
  **Resolved (chat 95, R6)**: full transparency — every campaign member
  reads every sheet and every module; editing stays rights-gated. Folded
  into FR-003/FR-022.

## Plan handoff notes (not requirements)

- **Design pass before Plan (E1)**: compact design.md for 044's surfaces —
  module card anatomy, add/attach flow, effect rendering templates,
  breakdown → card navigation — same flow as spec-022's design.md, reusing
  its tokens/components (ModChip, PipTrack, badges).
- Attachment representation: edges with `meta jsonb` (graph-visible,
  Constitution III) vs a dedicated table — decide in Plan with RLS and query
  shapes in view.
- Derivation library: one TS module shared by server actions and client;
  fixture tests against the xlsx reference tabs (contract style, like 022's
  parser plan).
- Sandbox caveat: `npm run build` hangs — gate on lint + tsc + vitest
  (AGENTS.md).

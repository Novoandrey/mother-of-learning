# Encounter Tracker v1 — Retrospective & Feature Inventory

> Saved: 2026-04-15. The v1 tracker is being replaced with an Excel-first
> redesign (IDEA-010 → spec-005). This file preserves what worked, what
> didn't, and what to carry forward.

## What Worked

### Data model (KEEP — no schema changes needed)
- `encounters` table: id, campaign_id, title, status, current_round, current_turn_id, details (jsonb), timestamps
- `encounter_participants` table: id, encounter_id, node_id (nullable), display_name, initiative (numeric, null=bench), max_hp, current_hp, temp_hp, role, sort_order, is_active, conditions[], effects[], timestamps
- `encounter_templates` + `encounter_template_participants` (migration 007)
- Indexes on encounter_id, node_id, (encounter_id, initiative DESC NULLS LAST, sort_order)
- Circular FK: encounters.current_turn_id → encounter_participants

### Features that users valued
- **Inline add from catalog**: search catalog nodes, pick quantity, auto-populate HP from node fields
- **Manual add**: quick name + HP entry without catalog
- **Clone**: duplicate participant (useful for "3 trolls")
- **Role coloring**: PC (blue), ally (green), enemy (red), neutral (gray) — instant visual grouping
- **Conditions**: DnD 5e conditions from catalog (15 SRD conditions as nodes)
- **Effects**: campaign-specific effects from catalog
- **Temp HP**: separate field, doesn't count toward max
- **Encounter details**: flexible JSONB card (location, description, map URL, soundtrack, etc.)
- **Link to catalog**: participant name → node detail page
- **Statblock URL**: icon link to external statblock (dnd.su etc.)
- **Save as template**: snapshot participant list for reuse
- **Round counter**: +/- buttons
- **Status**: active / completed, completed = read-only

### Optimistic UI pattern
- All updates: set React state immediately, fire Supabase update in background
- On error: router.refresh() to resync from server
- This pattern should be preserved in v2

## What Didn't Work

### Too many custom controls, not enough "just type"
- HP: required clicking +/- buttons with a delta field. Fixed in BUG-002 but still not Excel-like
- Initiative: had inline edit but felt clunky
- Conditions/effects: custom picker popover, not a simple text field
- Names: required clicking edit icon, then typing
- **Core problem**: every field had a bespoke interaction model instead of "click cell → type → Tab to next"

### Layout problems
- Fixed min-width 900px with horizontal scroll — bad on mobile
- Column widths hardcoded, not flexible
- Too many columns visible at once (role + initiative + name + conditions + effects + HP + temp HP + actions = 8 columns)

### Clone numbering (BUG-003, fixed)
- Always assigned " 1" and " 2" regardless of existing clones

### HP direct edit (BUG-002, fixed)
- No way to set exact HP value, only +/- deltas

## Component Inventory (13 files, ~2125 LOC to replace)

| File | LOC | Purpose |
|------|-----|---------|
| combat-tracker.tsx | 316 | Main layout, all handlers, state management |
| participant-row.tsx | 223 | Single row: name, initiative, HP, conditions, effects, actions |
| hp-control.tsx | 177 | HP display + delta controls + max HP edit + direct edit |
| encounter-list-page.tsx | 220 | List of encounters with create/template buttons |
| effect-picker.tsx | 192 | Popover with search, select effects from catalog |
| encounter-details-card.tsx | 150 | Editable JSONB key-value card |
| condition-picker.tsx | 134 | Popover with DnD conditions from catalog |
| catalog-panel.tsx | 108 | Collapsible panel to add participants from catalog |
| save-as-template-button.tsx | 90 | Save current participants as template |
| role-selector.tsx | 73 | Dropdown: PC/ally/enemy/neutral |
| temp-hp-input.tsx | 73 | Inline editable temp HP |
| initiative-input.tsx | 70 | Inline editable initiative |
| inline-add-row.tsx | 49 | Quick add row at bottom of table |

### Server actions (lib/encounter-actions.ts, 250 LOC)
Functions: updateRound, updateInitiative, updateHp, updateMaxHp,
updateParticipantName, updateConditions, updateEffects, updateRole,
updateTempHp, toggleParticipantActive, deleteParticipant, cloneParticipant,
updateEncounterStatus, addParticipantFromCatalog, addParticipantManual

### Template actions (lib/template-actions.ts)
Functions: saveAsTemplate, loadTemplates, createEncounterFromTemplate

## Database Schema (preserved as-is)

### Migrations to keep
- 002_encounters.sql (base tables)
- 003_conditions.sql (condition nodes + conditions column)
- 004_participant_role_temp_hp.sql (role + temp_hp columns)
- 005_effects_and_encounter_details.sql (effects column + encounter details)
- 006_round_starts_at_1.sql
- 007_encounter_templates.sql

### Current column set on encounter_participants
id, encounter_id, node_id, display_name, initiative, max_hp,
current_hp, temp_hp, role, sort_order, is_active, conditions[],
effects[], created_at

## Ideas for v2 (from backlog)

- IDEA-010: Excel-first — editable table, Tab navigation, minimal custom controls
- IDEA-015: Player→DM model — players propose actions, DM confirms
- IDEA-016: Auto-recaps from combat events
- IDEA-009: Realtime sync via Supabase Realtime

## Key Principle for Rebuild

> "Сначала перенеси систему как есть, потом улучшай точечно."
> — Constitution v3, Principle VII

The Excel metaphor: every cell is an input. Tab moves between cells.
No custom controls unless they're strictly better than typing.

# Backlog

Master backlog for cross-feature ideas, bugs, and improvements.
Feature-specific items live in `.specify/specs/NNN-*/backlog.md`.

Updated: 2026-04-13

---

## Bugs

### BUG-001 [P3] New entity doesn't appear in catalog without page reload
- **Feature**: 001-entity-graph
- **Symptom**: After creating a node via CreateNodeForm, the catalog list is stale
- **Fix**: Add `router.refresh()` or `revalidatePath` after insert

---

## Features

### FEAT-001 [P3] Edge type constraints (allowed source/target types)
- **Feature**: 001-entity-graph
- `edge_types` gets `allowed_source_types` / `allowed_target_types` arrays
- CreateEdgeForm filters target nodes by constraint

### FEAT-002 [P3] Incoming edge creation from target node card
- **Feature**: 001-entity-graph
- Toggle "Outgoing / Incoming" on CreateEdgeForm
- Display format: "[Бенисек] состоит в" for incoming edges

### FEAT-003 [P2] Directory README files for code documentation
- **Feature**: dx
- One README.md per directory (components/, lib/, app/) describing files and relationships
- Decision pending — needs a lightweight approach that won't rot

---

## Ideas

### IDEA-001 Encounter templates (save → clone → modify)
- **Feature**: 002-encounter-tracker
- Save participant list as template, clone into new encounter
- Useful for recurring combat setups (random encounters, arena)

### IDEA-002 Git-style constitution versioning
- **Feature**: dx
- "Original → fork → new original" pattern for constitution
- Track why principles changed, not just what changed

### IDEA-003 Per-file .md documentation with cross-references
- **Feature**: dx
- Short .md file next to each .ts/.tsx describing purpose and dependencies
- Concern: maintenance overhead for solo dev with ADHD
- Status: on hold, exploring alternatives (directory READMEs, inline comments)

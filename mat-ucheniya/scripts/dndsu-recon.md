# dnd.su recon (T001 / spec-018)

**Date**: 2026-04-27 (chat 76)
**Outcome**: Plan A confirmed — single internal endpoint returns full
HTML index. Plan B (sequential ID iteration) is a viable fallback but
unnecessary. Plan C (Playwright) not needed.

---

## Strategy: Plan A — internal index endpoint

`https://dnd.su/piece/items/index-list/` returns one HTML fragment
containing **all official items** as a flat list. Single GET, no
pagination, no auth.

**Why DevTools first-look was empty**: the `/items/` page caches the
fragment in OPFS (origin private filesystem) on first visit and never
re-fetches unless `version` key changes. Direct visit to the endpoint
bypasses the cache and returns the same payload.

**Snapshot**: `mat-ucheniya/scripts/dndsu-recon-snapshot.html`
(719 KB, captured 2026-04-27, 934 item cards). Committed for parser
test fixtures and reproducibility — not gitignored.

### Index card shape

Each item card:

```html
<div class="col list-item__spell for_filter"
     data-search="Адамантиновый доспех,Adamantine armor,"
     data-id="1"
     data-letter="а">
  <a href="https://dnd.su/items/1-adamantine-armor/" class="list-item-wrapper">
    <span class="list-svg__armor" title="Доспех">...</span>
    <div class="list-item-title">Адамантиновый доспех</div>
    <span class="list-icon__quality quality_color-1" title="Необычный">Не</span>
  </a>
</div>
```

Fields available **without** fetching the item page:

- `data-id` → numeric ID (matches URL prefix)
- `data-search` → `title_ru,title_en,` (commas as separators, trailing comma)
- `data-letter` → first Cyrillic letter for sort
- `<a href>` → canonical full URL with slug
- `list-svg__<type>` class + `title` attr → category (Доспех / Оружие /
  Чудесный предмет / Кольцо / Зелье / Свиток / Жезл / Посох /
  Волшебная палочка)
- `list-icon__quality quality_color-N` + `title` attr → rarity word
  (Обычный / Необычный / Редкий / Очень редкий / Легендарный /
  Артефакт / Качество варьируется)

**Implication for T004 `discover_urls()`**: trivial single fetch +
BeautifulSoup `select('.list-item__spell a')`, return ~934 URLs.
Optionally also stash `data-id` / category / rarity from the card to
cross-check the per-item parser.

---

## Item URL format

`https://dnd.su/items/{id}-{slug}/` — confirmed:

- `/items/1/` → 301 → `/items/1-adamantine-armor/` ✓
- Plan B (sequential ID) would work as fallback, but homebrew lives
  under separate `/homebrew/items/...` namespace (e.g. `/items/500/`
  redirected to `/homebrew/items/500-...`), so a guard would be
  needed. Plan A's curated index avoids the homebrew problem entirely.

**Total scope**: 934 official items (5e14 edition only). No 5e24
items appeared in the dropdown filter on this index, so edition gate
is naturally enforced.

---

## Umbrella items — split strategy

Two umbrella patterns surfaced during recon. **Both follow the same
first-bullet shape**, so a single regex handles them:

### Pattern: rarity tier expansion

First bullet matches:

```
<тип>, редкость варьируется (+1 X, +2 Y, +3 Z[, требуется настройка ...])
```

Examples confirmed:

| URL | Title on page | Tier expansion |
|---|---|---|
| `/items/160-weapon-1-2-3/` | «Оружие, +1, +2, +3» | +1 необычный, +2 редкий, +3 очень редкий |
| `/items/2489-bloodwell-vial/` | «Флакон с кровью» | +1 необычный, +2 редкий, +3 очень редкий, требуется настройка чародеем |

**Decision: split into N records, one per tier.**

Rationale: tiers have different rarity → different price → different
in-game availability. Storing as single record with `rarity=null`
loses critical info that the catalog must expose to DM/players.

### Splitting rules

For each detected umbrella:

1. **Base title**: strip trailing `, +N(, +M)*` from page title.
   - «Оружие, +1, +2, +3» → base «Оружие»
   - «Флакон с кровью» → base unchanged
2. **Per-tier emit**: `<base>, +N` (e.g. «Оружие, +1», «Флакон с кровью, +1»)
3. **`rarity`**: from tier mapping in first bullet (необычный/редкий/...)
4. **`requires_attunement`**: shared flag from same bullet — applies
   to all tiers
5. **`srd_slug`**: `dndsu-{id}-{slug}-plus-{N}` (e.g.
   `dndsu-160-weapon-plus-1`)
6. **`dndsu_url`**: shared umbrella URL across tiers
7. **`description_ru`**: shared body (the body itself describes the
   per-tier rule, so duplication is fine)

**Parser shape change**: `parse_item(html) -> list[ItemRecord]`
(returns 1 record for normal items, N records for umbrellas, empty
list for skip).

### Non-umbrella (single record, as planned)

Items with concrete first-bullet rarity stay single-record:

- `/items/161-weapon-of-warning/` — «Необычный» (generic enchant
  applies to any weapon, but rarity is fixed)
- `/items/1-adamantine-armor/` — «Необычный» (generic enchant
  applies to any heavy armor)

These are NOT umbrellas, just items whose description references
arbitrary base equipment.

### Edge case: «Качество варьируется» without explicit tier mapping

Some items list `rarity=Качество варьируется` in the index but have
no `(+1 X, +2 Y, ...)` clause in the body — these stay single-record
with `rarity=null`. Parser falls through to single-record path when
the umbrella regex doesn't match.

---

## Outstanding questions for T002 (fixtures)

5 fixtures to capture, must include:

1. ✓ `1-adamantine-armor.html` — uncommon armor, no attunement, generic
2. ✓ `94-ring-of-protection.html` — rare ring, requires attunement
3. ✓ `160-weapon-1-2-3.html` — **umbrella, must split into 3 records**
4. ✓ `2489-bloodwell-vial.html` — **umbrella with attunement, body-described tiers**
5. ✓ `161-weapon-of-warning.html` — non-umbrella generic enchant (rarity fixed)

Optional 6th: legendary or artefact (e.g. Vorpal Sword) for full
rarity coverage. Pick during T002.

---

## Risks / unknowns

- **Image embedding in description**: index card has SVG icon, item
  page may have inline `<img>`. Strip silently in parser.
- **Source book code variance**: badge in title row reads `DMG14`,
  `TCE`, etc. Mapping table already in plan.md. Unknown codes →
  `_warnings`.
- **5e24 contamination**: not expected (dropdown shows only 5e14 on
  this index), but parser still gates on edition badge per plan.

---

## Net effort estimate post-recon

Plan A bypasses sequential-fetch worry. T011 full scrape: ~15 min net
(934 × 1s polite delay + parse). Cache makes re-runs near-instant.

**No bumps to overall effort estimate.** Phase 1 closes ahead of plan.

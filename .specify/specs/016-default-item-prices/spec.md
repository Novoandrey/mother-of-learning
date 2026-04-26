# Feature Specification: Default item prices — bulk apply & per-item override

**Feature Branch**: `016-default-item-prices`
**Created**: 2026-04-26
**Status**: Clarified (2026-04-26, chat 72)
**Input**: User feedback after spec-015 ship — "вынести в настройки
'стандартную цену' маг предметов и возможность 'Применить' её, а
потом поменять на некоторые предметы цену на кастомную (поставив
галочку 'Не использовать стандарт')".

## Context

Spec-015 (Item Catalog) shipped a partial version of this feature
in chat 71: a 5×2 table of per-rarity default prices in
`/items/settings`, persisted in `campaigns.settings.item_default_prices`,
plus an autofill on the item form — when the user picks a rarity
and the price field is empty, prefill from the matching default.

The user-facing intent was wider than what shipped:

1. **Bulk apply across the existing catalog.** The DM tunes the
   price-per-rarity tables once, clicks one button, and every
   Образец already in the catalog gets re-priced according to its
   rarity (and category bucket — magic vs consumable). Today, the
   defaults only ever touch *new* items at create-time. A campaign
   with 91 SRD items pre-loaded sees zero effect from the
   defaults table unless the DM hand-edits each item.

2. **Per-item override flag.** Some items have story-justified
   prices that diverge from the rarity baseline (a unique legendary
   relic, a quest-rewarded uncommon trinket the DM wants kept
   cheap). The DM should be able to mark those items as
   "не использовать стандарт" once and then re-apply the table
   without those items being clobbered.

This is a follow-up to spec-015, not a new arc. Treat the existing
defaults table and autofill as already-built foundations — the
spec covers what gets layered on top of them.

## User Scenarios & Testing

### US1 — DM applies the table to a fresh-seeded catalog

The DM imported 91 SRD items via the seed migrations. None has a
custom price. The DM opens `/items/settings`, fills in the magic
items and consumables tables (e.g. common = 50 gp, uncommon = 250
gp, rare = 2 500 gp, …), and clicks **«Применить ко всем
предметам»**.

The system updates every Образец's `price_gp` in place, picking
the bucket by category (`consumable` → consumables table,
otherwise → magic items table) and the rarity tier from the item
itself. Items with `rarity = 'artifact'` or `rarity = null` are
left untouched — the table covers only the five common→legendary
tiers.

A toast / inline confirmation reports how many items were updated
("Обновлено 76 из 91 — 15 пропущено").

**Acceptance:**
- After the click, every magic item with a recognised rarity has
  `price_gp` matching the magic-items table for that rarity.
- Every consumable with a recognised rarity has `price_gp` matching
  the consumables table.
- Items with `rarity = artifact` or `rarity = null` are not
  touched; their original `price_gp` is preserved.
- The action is auditable: a single timestamp/actor pair is enough
  ("last applied 2026-04-27 14:33 by @user"), no per-item history.

### US2 — DM marks a story item as opt-out, then re-applies

The DM has a unique legendary item «Меч Праведного Каэлия»
priced at 100 000 gp (way above the 50 000 gp legendary baseline,
because it's a one-of-a-kind plot item). The DM opens the item's
edit page, ticks **«Не использовать стандартную цену»**, saves.

Later, the DM tunes the legendary tier in the table from 50 000
to 75 000 gp and clicks «Применить». Every other legendary
re-prices to 75 000 gp; the Меч Праведного Каэлия keeps its 100
000 gp.

**Acceptance:**
- The checkbox state persists per item across edits.
- Apply-all skips items where the flag is set.
- The skip count surfaces in the confirmation toast.

### US3 — DM unchecks the flag to re-join the standard

The DM decides Меч Праведного Каэлия should follow the standard
after all. They open it, untick the override flag, save. On the
next «Применить», this item is re-priced to the legendary
baseline (75 000 gp).

Alternative: the DM may also want a one-shot "apply to this item
right now" without un-ticking the flag globally. **Out of scope
for v1** — re-tick is the workflow.

### US4 — Bulk apply when the table has nulls

The DM has only filled in magic-items columns; consumables column
is left empty (all `null`). The DM clicks Apply.

**Acceptance:**
- For each rarity tier where the matching cell is `null`, items in
  that tier are **skipped** (not zeroed out).
- The toast distinguishes "Пропущено: 12 (нет стандарта для редкости)"
  from "Пропущено: 3 (галочка 'не использовать стандарт')".

### US5 — Newly created item respects the standard

After spec-015 follow-up, the create form already prefills the
price when rarity is picked and the price field is empty. The
override flag should default to `false` (i.e. "use standard") for
new items. If the DM types a custom price during creation but
leaves the flag unticked, the item shows up in subsequent
apply-all runs and gets clobbered back to the standard. This is
intended — the flag is the only opt-out; manual price entry alone
isn't enough.

> **Open question for /clarify:** is "manual price entry without
> flag = will be clobbered" the right default, or should we
> auto-tick the flag when the user types a price that diverges
> from the standard? The user's framing ("поставив галочку")
> suggests opt-out is explicit and manual.

## Functional Requirements

- **FR-001** New column `item_attributes.use_default_price boolean
  not null default true`. Existing rows get `true` on backfill.
- **FR-002** Item form (create + edit) shows a checkbox **«Не
  использовать стандартную цену»** next to the Цена field.
  Default unchecked (= use standard).
- **FR-003** Server action `applyItemDefaultPrices(slug)` —
  DM/owner-only. For every Образец in the campaign where
  `use_default_price = true`, recompute the standard price from
  `(category, rarity)` and update `price_gp`. Items with
  `use_default_price = false`, or with `rarity ∈ {artifact, null}`,
  or where the matching cell is `null`, are skipped.
- **FR-004** Settings page gets a button **«Применить ко всем
  предметам»** under the price tables. Clicking shows a confirm
  dialog ("Обновить N предметов?"). After confirm, run the
  action, show a toast with breakdown counts (updated / skipped
  by flag / skipped by missing standard / skipped by rarity).
- **FR-005** The bulk apply does NOT auto-run when the DM edits
  the price tables — only on explicit click. Tweaking values in
  the editor stays cheap (debounced save, no side effects on the
  catalog).
- **FR-006** Item form behaviour change: when the user ticks
  «Не использовать стандарт», the autofill on rarity-change is
  suppressed for that item from then on — even if the price field
  is empty.
- **FR-007** When the user unticks the flag, the form does NOT
  auto-prefill on the spot — the user is just opting back into the
  next bulk apply. The currently-typed price stays in the field.
- **FR-008** The override flag is visible from the item card
  (read-only) and the catalog row tooltip — "стандарт" / "ручная
  цена" badge. Optional in v1; nice-to-have.
- **FR-009** Existing autofill on item create (spec-015
  follow-up) keeps working as is — fills empty price field on
  rarity pick.

## Non-functional / Edge cases

- A campaign with 5 000 items: the apply runs as a single SQL
  UPDATE with a CASE expression, not a loop in app code. Should
  complete < 1s for any realistic catalog size.
- RLS: only owner/dm can call the action; the SQL update goes
  through the admin client (categories table follows the same
  pattern in spec-015).
- The action is idempotent — clicking twice in a row produces
  the same end state and a toast saying "0 обновлено".
- Concurrency: if two DMs click Apply simultaneously, last write
  wins per row. Acceptable for v1; bookkeeping arc didn't hit
  this in 3 weeks.
- Spec-013 encounter-loot autogen still writes its own
  `transactions` rows; this spec only touches the Образец's own
  `price_gp`, not historical loot prices.

## Migration

- New: `048_item_use_default_price.sql` (047 taken by spec-017
  Складчина).
  - `alter table item_attributes add column use_default_price
    boolean not null default true;`
  - Comment + idempotent guard.
- No data migration needed — `default true` covers every existing
  row, which matches user intent ("по дефолту везде стандарт").

## Out of scope

- Per-item history of price changes.
- Currency other than gp.
- Default prices for non-rarity-coded categories (weapons,
  armour, mundane gear) — those stay free-form.
- Auto-apply on every settings edit. Explicit click only.
- Bulk-edit UI in the catalog (multi-select rows → set price /
  set override flag). The settings → apply flow + per-item form
  is enough for v1.

## References

- spec-015 / chat 71 — current partial implementation.
- `lib/item-default-prices.ts` — pure module with the price tables.
- `app/c/[slug]/settings/actions.ts:updateItemDefaultPrices` —
  reuse the same membership gate for `applyItemDefaultPrices`.
- `components/default-prices-editor.tsx` — Apply button lives
  alongside this editor.
- `components/item-form-page.tsx` — checkbox lands here.

---

## Clarifications

_Resolved 2026-04-26 in chat 72._

### Q1: Migration filename

**Answer: `048_item_use_default_price.sql`.** 047 уже занят
spec-017 (Складчина, applied или ready to apply). Tail-numbering
по строгому порядку.

### Q2: Manual price entry without flag — clobbered on apply?

**Answer: Yes.** Flag — единственный opt-out. Если DM ввёл
кастомную цену но не поставил галочку «Не использовать стандарт»
— на следующем «Применить» цена откатится к стандарту.

Rationale: пользователь явно сформулировал «поставив галочку»,
т.е. opt-out — конкретное действие, не побочный эффект. Если
auto-tick'ать на divergence — DM теряет контроль (мог опечатать
цену и не понять почему она не клобберится).

UI affordance: при тыке Apply показать confirm-dialog с
breakdown'ом «N будет обновлено, M защищены галочкой» — так DM
сам отловит «упс, забыл галочку». Already in FR-004.

### Q3: FR-008 badge «стандарт / ручная цена» в v1?

**Answer: Skip в v1.** Метка «стандарт / ручная цена» —
nice-to-have, не блокирующий MVP. Если DM не уверен какая цена
у item'а — открывает edit form, видит галочку. Один лишний клик
на edge case стоит дешевле строки UI на каждой карточке.

Если возникнет реальный pain (DM сравнивает 30 предметов через
catalog grid и хочет видеть какие custom) — заводим как
follow-up.

### Q4: FR-006/FR-007 autofill suppression behavior

**Answer: Suppression привязана к flag value на момент
рарити-смены, не к history.** Логика item form:

- Flag = false (стандарт ON), price field empty, rarity changes →
  prefill from default. (FR-009 — same as today.)
- Flag = false, price field NON-empty, rarity changes → leave
  price as is. (Existing behavior; не трогаем.)
- Flag = true (override ON), price field empty, rarity changes →
  **no prefill** (suppress). DM хочет ручную цену — пусть введёт.
- Flag = true, price NON-empty, rarity changes → leave as is.

Если DM расжимает галочку (true → false), prefill **не**
происходит немедленно (FR-007). Но на следующей смене rarity при
empty price — prefill сработает по правилу выше.

### Q5: Bucket mapping — `consumable` vs `magic`

**Answer: Простое pattern matching на `item_attributes.category_slug`.**

```
bucket = (category_slug == 'consumable') ? 'consumable' : 'magic'
```

Mundane items (rarity = null) автоматически отсеиваются guard'ом
«rarity ∈ {artifact, null} → skip». Если кто-то категоризирует
weapon/armor с rarity != null — они получат «magic» цену, что и
ожидается (магическое оружие).

### Q6: Действие при отсутствии `consumable` category в кампании

**Answer: Skip-by-empty-cell guard покрывает.** Если у кампании
нет category_slug == 'consumable', items с не-consumable
категорией просто попадают в magic bucket — что естественно.
Если кампания экзотическая с другим именем для consumable
(скажем, 'potion') — это scope для отдельной спеки (mapping
custom categories to buckets), не v1.

---

### Status: **Clarified**. Next phase: **Plan**.

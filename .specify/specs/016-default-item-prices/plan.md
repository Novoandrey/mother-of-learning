# Implementation Plan: Default Item Prices — Bulk Apply & Override

**Spec**: `.specify/specs/016-default-item-prices/spec.md`
**Created**: 2026-04-26 (chat 72)
**Status**: Draft
**Estimated effort**: ~2 часа. 1 миграция (1 column),
1 pure helper + 10 vitest, 1 server action (single SQL UPDATE
с CASE), 2 UI правки (form checkbox + settings Apply button),
type extension в 4 местах.

---

## Architecture overview

Минимальный delta поверх spec-015 follow-up:

1. **`item_attributes.use_default_price boolean default true`** —
   единственное schema-изменение. `default true` означает
   «по дефолту все existing items участвуют в bulk apply».
2. **`computeApplyPlan(items, defaults)`** — pure helper в
   `lib/apply-default-prices.ts`. Принимает массив items с
   нужными полями + текущую таблицу defaults. Возвращает
   `{ updates: [{itemId, newPrice}], skippedByFlag, skippedByRarity, skippedByMissingCell }`.
   Плеер action делает UPDATE этих rows одним SQL'ом.
3. **`applyItemDefaultPrices(slug)`** — server action в
   `app/c/[slug]/settings/actions.ts`. DM-only. Загружает items,
   считает plan, делает bulk UPDATE через single SQL
   `UPDATE item_attributes SET price_gp = CASE id WHEN ... END`.
   Returns breakdown counts.
4. **UI changes** — два места:
   - `components/item-form-page.tsx`: checkbox «Не использовать
     стандарт» рядом с price field. Suppress autofill когда
     checked.
   - `app/c/[slug]/items/settings/page.tsx`: кнопка «Применить ко
     всем предметам» под price-tables editor + confirm dialog +
     toast с breakdown'ом.

Read-side discipline:
- `lib/items.ts` уже возвращает `ItemNode`; добавить
  `useDefaultPrice: boolean` в shape + IN-fetch.
- Catalog grid не показывает badge в v1 (Q3 clarif — skip).

Write-side discipline:
- `app/actions/items.ts` `createItem` / `updateItem` принимают
  опциональный `useDefaultPrice` в payload, default true для
  create.

---

## Schema (migration 048)

```sql
-- Migration 048: spec-016 — per-item override flag для default prices.
alter table item_attributes
  add column if not exists use_default_price boolean not null default true;

comment on column item_attributes.use_default_price is
  'Spec-016. true (default) — item участвует в bulk apply
   default prices. false — DM явно opt-out, цена защищена от
   clobber на «Применить».';
```

Идемпотентная (`if not exists`). No data backfill — `default true`
покрывает existing rows.

---

## Pure helper — `lib/apply-default-prices.ts`

```ts
export type ApplyPlanItem = {
  itemId: string
  categorySlug: string
  rarity: Rarity | null
  priceGp: number | null
  useDefaultPrice: boolean
}

export type ApplyPlanUpdate = {
  itemId: string
  oldPrice: number | null
  newPrice: number
}

export type ApplyPlan = {
  updates: ApplyPlanUpdate[]
  skippedByFlag: number          // useDefaultPrice = false
  skippedByRarity: number        // rarity ∈ {artifact, null}
  skippedByMissingCell: number   // matching cell в defaults = null
  unchanged: number              // newPrice === oldPrice
}

export function computeApplyPlan(
  items: ApplyPlanItem[],
  defaults: ItemDefaultPrices,
): ApplyPlan
```

Logic:
- For каждого item:
  - flag false → bump skippedByFlag, skip.
  - rarity null OR 'artifact' → bump skippedByRarity, skip.
  - bucket = (categorySlug === 'consumable') ? 'consumable' : 'magic'
  - cell = defaults[bucket][rarity]
  - cell === null → bump skippedByMissingCell, skip.
  - cell === oldPrice → bump unchanged, skip update.
  - else → push to updates with newPrice = cell.

10 vitest cases: empty input, all skipped, mixed buckets, etc.

---

## Server action — `applyItemDefaultPrices(slug)`

Файл: `app/c/[slug]/settings/actions.ts` (рядом с
`updateItemDefaultPrices`).

```ts
export async function applyItemDefaultPrices(
  slug: string,
): Promise<
  | { ok: true; plan: ApplyPlan }
  | { ok: false; error: string }
>
```

1. Auth + DM gate (same pattern как `updateItemDefaultPrices`).
2. Load campaign settings → defaults.
3. Load all items для кампании:
   ```sql
   SELECT id, category_slug, rarity, price_gp, use_default_price
     FROM item_attributes ia
     JOIN nodes n ON n.id = ia.node_id
    WHERE n.campaign_id = $1
   ```
4. `computeApplyPlan(items, defaults)` → plan.
5. Если `plan.updates.length === 0` — return ok с пустым plan
   (idempotent).
6. Bulk UPDATE через CASE:
   ```sql
   UPDATE item_attributes
      SET price_gp = CASE id
        WHEN '<id1>' THEN <price1>
        WHEN '<id2>' THEN <price2>
        ...
      END
    WHERE id IN ('<id1>', '<id2>', ...)
   ```
   Через admin client. Single round-trip, не loop.
7. revalidatePath layouts: `/c/${slug}/items`, `/c/${slug}/items/settings`.
8. Return ok + plan.

---

## UI changes

### 1. `components/item-form-page.tsx`

- Add `useDefaultPrice: boolean` в `ItemPayload` (shared type).
- State: `const [useDefaultPrice, setUseDefaultPrice] = useState(initial.useDefaultPrice ?? true)`.
- Render checkbox рядом с Цена field — labeled «Не использовать
  стандартную цену» (inverted: checkbox checked = flag=false).
  Tooltip объясняет: «Защищает цену от bulk apply на странице
  настроек».
- Suppress autofill in `handleRarityChange` / `handleCategoryChange`
  когда `useDefaultPrice === false`:
  ```ts
  if (useDefaultPrice && priceGp.trim() === '') {
    const def = lookupDefaultPrice(...)
    if (def !== null) setPriceGp(String(def))
  }
  ```
- Pass `useDefaultPrice` в submit payload.

### 2. `app/c/[slug]/items/settings/page.tsx`

- Под `<DefaultPricesEditor>` добавить новый компонент
  `<ApplyDefaultPricesButton campaignSlug={slug} />` (client island).
- Внутри:
  - Кнопка «Применить ко всем предметам» (Primary button).
  - On click → confirm dialog с предзагрузкой счёта items
    кампании: «Обновит до N предметов. Защищены галочкой: M.
    Продолжить?»
  - На confirm → `applyItemDefaultPrices(slug)` → toast с
    breakdown'ом.

Confirm dialog inline (native `confirm()` для MVP — без modal
component'а; toast — alert() или small div с auto-dismiss; в
существующей кодобазе toast pattern минимальный).

### 3. `lib/items.ts` + `app/actions/items.ts`

- Add `useDefaultPrice` в `ItemNode` + `ItemPayload`.
- `lib/items.ts`: SELECT include + map.
- `createItemAction` / `updateItemAction`: payload include + insert /
  update.

---

## Tasks

- [ ] **T001 [P1]** Write migration `048_item_use_default_price.sql`.
  Idempotent ADD COLUMN IF NOT EXISTS + comment.
- [ ] **T002 [P1]** present_files миграции.
- [ ] **T003 [P1] [P]** Extend `ItemNode` + `ItemPayload` в
  `lib/items-types.ts` с `useDefaultPrice: boolean`. Add `ApplyPlan*`
  types в новый `lib/apply-default-prices.ts`.
- [ ] **T004 [P1] [P]** `lib/apply-default-prices.ts`:
  `computeApplyPlan(items, defaults)`. Pure, no I/O.
- [ ] **T005 [P1] [P]** `lib/__tests__/apply-default-prices.test.ts`:
  10 vitest cases (empty, all skipped, mixed, bucket consumable vs
  magic, missing cell, unchanged, opt-out flag, artifact, null
  rarity).
- [ ] **T006 [P1]** Update `lib/items.ts` SELECT/map для
  `use_default_price`. Update `app/actions/items.ts`
  `createItemAction` + `updateItemAction` чтобы пробрасывать
  payload.useDefaultPrice (default true для create).
- [ ] **T007 [P1]** `applyItemDefaultPrices(slug)` action в
  `app/c/[slug]/settings/actions.ts`. Auth + DM gate + load items +
  computeApplyPlan + bulk UPDATE с CASE + revalidatePath.
- [ ] **T008 [P1]** Item form checkbox в `components/item-form-page.tsx`:
  state + UI + autofill suppression + submit payload.
- [ ] **T009 [P1]** `components/apply-default-prices-button.tsx`
  client island + mount в `app/c/[slug]/items/settings/page.tsx` под
  `<DefaultPricesEditor>`.
- [ ] **T010 [P1]** Close-out: NEXT.md, version 0.5.1, chatlog,
  commit, push.

---

## Out of scope (re-asserted)

- Per-item history.
- Currency other than gp.
- Default prices для weapons/armor/mundane (free-form).
- Auto-apply on settings edit (explicit click only — FR-005).
- Bulk-edit UI в catalog grid.
- Badge «стандарт / ручная цена» (clarif Q3 — skip in v1).

---

### Status: **Draft**. Awaiting confirmation → Implement.

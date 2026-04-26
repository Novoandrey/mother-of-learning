# Tasks: Default Item Prices — Bulk Apply & Override

**Spec**: `.specify/specs/016-default-item-prices/spec.md`
**Plan**: `.specify/specs/016-default-item-prices/plan.md`
**Created**: 2026-04-26 (chat 72)
**Status**: Draft

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable. Spec-016
> compact — задач 10, всё P1.

---

- [x] **T001 [P1]** Write migration `048_item_use_default_price.sql`.
  Idempotent ADD COLUMN IF NOT EXISTS, comment, no backfill.
  *(file: `mat-ucheniya/supabase/migrations/048_item_use_default_price.sql`)*

- [x] **T002 [P1]** present_files миграции.

- [x] **T003 [P1] [P]** Extend types:
  - `lib/items-types.ts`: add `useDefaultPrice: boolean` в `ItemNode`
    + `ItemPayload`.
  - New `lib/apply-default-prices.ts`: `ApplyPlanItem`,
    `ApplyPlanUpdate`, `ApplyPlan` types.

- [x] **T004 [P1] [P]** `lib/apply-default-prices.ts`:
  `computeApplyPlan(items, defaults)` pure helper. Returns
  `{ updates, skippedByFlag, skippedByRarity, skippedByMissingCell, unchanged }`.

- [x] **T005 [P1] [P]** `lib/__tests__/apply-default-prices.test.ts`:
  10 кейсов (empty, all skipped, mixed buckets, missing cell,
  unchanged, opt-out, artifact, null rarity, only consumable, only
  magic).

- [x] **T006 [P1]** Update `lib/items.ts` SELECT/map для
  `use_default_price`. Update `app/actions/items.ts` create + update
  чтобы пробрасывать `useDefaultPrice` (default true для create).
  Update `validateItemPayload` (no validation needed для bool, но
  не забыть pass-through).

- [x] **T007 [P1]** `applyItemDefaultPrices(slug)` server action в
  `app/c/[slug]/settings/actions.ts`. Auth + DM gate + load items +
  computeApplyPlan + bulk UPDATE с CASE WHEN + revalidatePath.
  Returns `{ ok, plan }` где plan — full breakdown.

- [x] **T008 [P1]** Item form чекбокс в `components/item-form-page.tsx`:
  state, UI рядом с Цена field («Не использовать стандартную
  цену»), autofill suppression в `handleRarityChange` /
  `handleCategoryChange`, submit payload.

- [x] **T009 [P1]** `components/apply-default-prices-button.tsx`
  client island. Mount в `app/c/[slug]/items/settings/page.tsx` под
  `<DefaultPricesEditor>`. Кнопка → confirm() → server action →
  alert() с breakdown'ом.

- [x] **T010 [P1]** Close-out: NEXT.md, version 0.5.1, chatlog,
  commit, push.

---

### Status: **Draft**. Awaiting Implement.

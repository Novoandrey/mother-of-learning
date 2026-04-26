/**
 * Inventory temporal slicing — spec-015 (pure).
 *
 * The inventory tab renders a `(loop, day)` slice. Per FR-023 / Q8:
 * the day picker is a transparent UI control, not a security gate —
 * the slice is just a SQL filter `loop_number = loop AND day_in_loop ≤ day`.
 *
 * This module provides:
 *   - `sliceLegsAt(legs, loop, day)`: pure filter on already-loaded
 *     legs. Useful when the page loaded a wider range and re-slices
 *     client-side (e.g. day-picker scrub without refetch).
 *   - `defaultDayForInventory(latestDayLogged, frontier)`: picks the
 *     first-render default following the same rule as
 *     `computeDefaultDayForTx` in `lib/transactions.ts` — but pure,
 *     so we can unit-test the rule independently.
 */

import type { ItemLeg } from './inventory-aggregation';

/**
 * Filter legs to those whose `(loopNumber, dayInLoop)` falls inside the
 * `(loop, day)` slice. Per FR-023:
 *   - keep only `loopNumber === loop`
 *   - keep `dayInLoop ≤ day` within that loop
 *
 * Cross-loop legs are ignored (FR-023b — past loops are a separate
 * picker, not a cumulative aggregate).
 */
export function sliceLegsAt(legs: ItemLeg[], loop: number, day: number): ItemLeg[] {
  return legs.filter((leg) => leg.loopNumber === loop && leg.dayInLoop <= day);
}

/**
 * Compute the default day for the inventory tab on first render.
 * Mirrors `computeDefaultDayForTx`'s rule:
 *
 *   1. If the actor logged any tx in this loop → use the latest day.
 *   2. Else if the actor's session frontier ≥ 1 → use the frontier.
 *   3. Else → 1.
 *
 * Pure-function variant. The I/O wrapper that loads `latestDayLogged`
 * + `frontier` from Supabase lives in `lib/transactions.ts` and
 * `lib/loops.ts`; this function is the rule itself.
 */
export function defaultDayForInventory(
  latestDayLogged: number | null,
  frontier: number | null,
): number {
  if (typeof latestDayLogged === 'number' && latestDayLogged > 0) {
    return latestDayLogged;
  }
  if (typeof frontier === 'number' && frontier > 0) {
    return frontier;
  }
  return 1;
}

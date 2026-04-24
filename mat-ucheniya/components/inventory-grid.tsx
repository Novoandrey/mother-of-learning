/**
 * `<InventoryGrid>` — generic, stash-agnostic item grid (spec-011, T020).
 *
 * Designed so the same component powers the stash page now and per-PC
 * inventory later (spec-015). The only shape it cares about:
 *   - `itemName` (display label)
 *   - `qty` (integer; negative → warning flag)
 *   - `latestLoop` / `latestDay` (grid "when" column)
 *   - `instances[]` (expand-row payload)
 *
 * Rendering model (mobile-first with desktop enhancement):
 *   - < md:  stacked cards, one per item. Each card is tappable
 *            (the client `<InventoryGridRow>` handles expand).
 *   - ≥ md:  compact table. Same row component; the table's
 *            columnar layout comes from CSS grid inside each row so
 *            markup stays identical across breakpoints.
 *
 * Everything clickable lives in the client row sibling.
 */

import type { StashItem, StashItemInstance } from '@/lib/stash';
import { InventoryGridRow } from './inventory-grid-row';

export type InventoryGridItem = StashItem;
export type InventoryGridInstance = StashItemInstance;

export type InventoryGridProps = {
  items: InventoryGridItem[];
  emptyMessage?: string;
  /** Unused in the MVP view-only grid; reserved for spec-015 edit UX. */
  canEdit?: boolean;
};

export function InventoryGrid({
  items,
  emptyMessage = 'Пусто',
}: InventoryGridProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Desktop column headers — hidden on mobile, shown at md+. */}
      <div
        className="hidden rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 md:grid md:grid-cols-[1fr_80px_120px_1fr] md:gap-4"
        aria-hidden
      >
        <span>Предмет</span>
        <span className="text-right">Кол-во</span>
        <span>Последний</span>
        <span>Комментарий</span>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.itemName}>
            <InventoryGridRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

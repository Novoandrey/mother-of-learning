/**
 * `<InventoryTab>` — spec-015 (T027).
 *
 * Read-only inventory view for any actor node (PC or stash). Mounted
 * on the PC page (T028) and on the stash page (T029) — same
 * component, same behaviour, different `actorNodeId`.
 *
 * The `(loop, day)` slice is a transparent UI control per FR-023 / Q8:
 * picking day 5 just adds `day_in_loop ≤ 5` to the SQL filter, it does
 * not gate access. The on-screen «Срез: петля N · день M» chip is the
 * trust mechanism — viewers see the slice they're looking at.
 *
 * URL params owned by this tab:
 *   - `loop` — selected loop number (defaults to current)
 *   - `day` — selected day in loop (defaults to 30 = end of loop)
 *   - `group` — group-by axis (`category` / `rarity` / `slot` /
 *     `priceBand` / `source` / `availability`); empty = no grouping
 *
 * Tab-switch URL param (`tab=inventory`) is owned by the host page.
 *
 * Composition:
 *   <InventoryTabControls>  ← client island, writes URL
 *   <InventoryRowsList>     ← inline below, server-rendered list
 */

import {
  groupInventoryRows,
  type InventoryGroup,
} from '@/lib/items-grouping';
import { listCategories } from '@/lib/categories';
import { getInventoryAt } from '@/lib/inventory';
import type { GroupBy, InventoryRow, Rarity } from '@/lib/items-types';

import InventoryTabControls, {
  type InventoryTabLoop,
} from './inventory-tab-controls';

type Props = {
  actorNodeId: string;
  campaignId: string;
  /** Past + current loops only (FR-023b). Sorted by loop number ascending. */
  loops: InventoryTabLoop[];
  /** Selected loop. Caller picks the default (current loop, typically). */
  loopNumber: number;
  /** Selected day. Caller picks the default via `defaultDayForInventory`. */
  dayInLoop: number;
  /** `null` = no grouping. */
  groupBy: GroupBy | null;
  /** Optional message override for the empty state. */
  emptyMessage?: string;
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
};

function formatPriceGp(price: number | null): string | null {
  if (price === null) return null;
  if (price === 0) return '0 gp';
  if (Number.isInteger(price)) return `${price} gp`;
  return `${price.toFixed(2).replace(/\.?0+$/, '')} gp`;
}

function formatWeightLb(weight: number | null): string | null {
  if (weight === null) return null;
  if (weight === 0) return '—';
  return `${weight} lb`;
}

export default async function InventoryTab({
  actorNodeId,
  campaignId,
  loops,
  loopNumber,
  dayInLoop,
  groupBy,
  emptyMessage = 'Нет предметов на этот срез',
}: Props) {
  // Three reads in parallel — none of them depend on each other.
  const [rows, itemCats, slotCats, sourceCats, availCats] = await Promise.all([
    getInventoryAt(actorNodeId, loopNumber, dayInLoop),
    listCategories(campaignId, 'item'),
    listCategories(campaignId, 'item-slot'),
    listCategories(campaignId, 'item-source'),
    listCategories(campaignId, 'item-availability'),
  ]);

  const categoryLabels = Object.fromEntries(itemCats.map((c) => [c.slug, c.label]));
  const slotLabels = Object.fromEntries(slotCats.map((c) => [c.slug, c.label]));
  const sourceLabels = Object.fromEntries(sourceCats.map((c) => [c.slug, c.label]));
  const availabilityLabels = Object.fromEntries(
    availCats.map((c) => [c.slug, c.label]),
  );

  const slugLabels: Partial<Record<GroupBy, Record<string, string>>> = {
    category: categoryLabels,
    slot: slotLabels,
    source: sourceLabels,
    availability: availabilityLabels,
  };

  // qty=0 is filtered upstream by aggregateItemLegs; qty<0 keeps as
  // warning row so the DM can investigate data integrity.
  const totalDistinct = rows.length;

  return (
    <div className="space-y-4">
      <InventoryTabControls
        loops={loops}
        loopNumber={loopNumber}
        dayInLoop={dayInLoop}
        groupBy={groupBy}
      />

      {totalDistinct === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      ) : groupBy === null ? (
        <InventoryFlatList
          rows={rows}
          categoryLabels={categoryLabels}
          slotLabels={slotLabels}
        />
      ) : (
        <InventoryGroupedList
          groups={groupInventoryRows(rows, groupBy, slugLabels)}
          categoryLabels={categoryLabels}
          slotLabels={slotLabels}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Sub-renderers ───────────────────────────

type RowRenderProps = {
  rows: InventoryRow[];
  categoryLabels: Record<string, string>;
  slotLabels: Record<string, string>;
};

function InventoryFlatList({ rows, categoryLabels, slotLabels }: RowRenderProps) {
  return <RowsTable rows={rows} categoryLabels={categoryLabels} slotLabels={slotLabels} />;
}

function InventoryGroupedList({
  groups,
  categoryLabels,
  slotLabels,
}: {
  groups: InventoryGroup[];
  categoryLabels: Record<string, string>;
  slotLabels: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key}>
          <header className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">{g.label}</h3>
            <span className="text-xs text-gray-400">{g.rows.length} поз.</span>
          </header>
          <RowsTable
            rows={g.rows}
            categoryLabels={categoryLabels}
            slotLabels={slotLabels}
          />
        </section>
      ))}
    </div>
  );
}

function RowsTable({ rows, categoryLabels, slotLabels }: RowRenderProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {rows.map((row, idx) => (
          <InventoryRowItem
            key={`${row.itemNodeId ?? 'free'}:${row.itemName}:${idx}`}
            row={row}
            categoryLabels={categoryLabels}
            slotLabels={slotLabels}
          />
        ))}
      </ul>
    </div>
  );
}

function InventoryRowItem({
  row,
  categoryLabels,
  slotLabels,
}: {
  row: InventoryRow;
  categoryLabels: Record<string, string>;
  slotLabels: Record<string, string>;
}) {
  const qtyClass = row.warning
    ? 'text-red-700 font-semibold'
    : 'text-gray-900 font-semibold';
  const attrs = row.attributes;
  const categoryLabel = attrs ? categoryLabels[attrs.categorySlug] ?? attrs.categorySlug : null;
  const rarityLabel =
    attrs && attrs.rarity ? RARITY_LABELS[attrs.rarity] ?? attrs.rarity : null;
  const slotLabel =
    attrs && attrs.slotSlug ? slotLabels[attrs.slotSlug] ?? attrs.slotSlug : null;
  const priceLabel = attrs ? formatPriceGp(attrs.priceGp) : null;
  const weightLabel = attrs ? formatWeightLb(attrs.weightLb) : null;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
      <span className="flex-1 min-w-0 truncate text-gray-900">
        {row.itemName}
        {row.itemNodeId === null && (
          <span
            className="ml-2 rounded border border-gray-200 bg-gray-50 px-1.5 text-[10px] text-gray-500"
            title="Свободный текст — не привязан к Образцу"
          >
            текст
          </span>
        )}
      </span>

      {/* Hot-field chips — only for linked rows. */}
      {attrs && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {categoryLabel && (
            <span className="rounded-full border border-gray-200 px-2 py-0.5">
              {categoryLabel}
            </span>
          )}
          {rarityLabel && rarityChip(attrs.rarity, rarityLabel)}
          {slotLabel && (
            <span className="rounded-full border border-gray-200 px-2 py-0.5">
              {slotLabel}
            </span>
          )}
          {priceLabel && <span className="text-gray-600">{priceLabel}</span>}
          {weightLabel && <span className="text-gray-400">{weightLabel}</span>}
        </span>
      )}

      <span className={`tabular-nums ${qtyClass}`}>×{row.qty}</span>
      <span className="hidden text-xs text-gray-400 sm:inline">
        д.{row.latestDay} · с.{row.latestLoop}
      </span>
    </li>
  );
}

function rarityChip(rarity: Rarity | null, label: string) {
  // Light-theme palette aligned with the catalog's rarity tinting.
  const tone =
    rarity === 'legendary' || rarity === 'artifact'
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : rarity === 'very-rare'
        ? 'border-purple-300 bg-purple-50 text-purple-800'
        : rarity === 'rare'
          ? 'border-blue-300 bg-blue-50 text-blue-800'
          : rarity === 'uncommon'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-gray-300 bg-gray-50 text-gray-700';
  return (
    <span className={`rounded-full border px-2 py-0.5 ${tone}`}>{label}</span>
  );
}

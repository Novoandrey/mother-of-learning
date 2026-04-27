/**
 * Item-domain types — spec-015.
 *
 * Pure types only, no runtime code. Imported by `lib/items.ts`,
 * `lib/inventory.ts`, the catalog UI components, and the typeahead.
 */

/**
 * Standard 5e rarity ladder. NULL is valid for non-magical items;
 * the closed enum is mirrored in the `item_attributes_rarity_check`
 * CHECK from migration 043.
 */
export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very-rare'
  | 'legendary'
  | 'artifact';

/**
 * One catalog item — the Образец (Platonic template). The thing the DM
 * edits via `<ItemEditDialog>`; the thing transactions reference via
 * `item_node_id`. Has no quantity, no location — only attributes.
 */
export type ItemNode = {
  id: string;
  campaignId: string;
  /** `nodes.title` (Russian display by convention). */
  title: string;

  // Hot fields (typed columns on `item_attributes`).
  categorySlug: string;
  rarity: Rarity | null;
  priceGp: number | null;
  weightLb: number | null;
  slotSlug: string | null;
  sourceSlug: string | null;
  availabilitySlug: string | null;

  /**
   * Spec-016. true (default) — item участвует в bulk apply
   * default prices. false — DM opt-out («Не использовать
   * стандарт»), цена защищена от clobber.
   */
  useDefaultPrice: boolean;

  /**
   * 5e «Требует настройки» / attunement. Backfilled at mig 055 from
   * description scan. Magic items only — mundane stays false.
   */
  requiresAttunement: boolean;

  // Cold fields (`nodes.fields` JSONB).
  srdSlug: string | null;
  description: string | null;
  /** Free-form source detail beyond the slug (e.g. "Tasha's, p. 142"). */
  sourceDetail: string | null;
  /**
   * Canonical permalink to the dnd.su page for this item, populated
   * by spec-018 import migrations (056+) and by the «Источник» field
   * in the item edit form. Powers the «Открыть на dnd.su» link on
   * the item detail page. Hand-curated SRD entries leave this `null`.
   */
  dndsuUrl: string | null;
};

/**
 * Catalog filter shape. Mirrors the URL-driven filter bar; every field
 * is independently optional. Empty object = no filters = full catalog.
 */
export type ItemFilters = {
  /** Free-text name search (ILIKE %q%). */
  q?: string;
  category?: string;
  rarity?: Rarity;
  slot?: string;
  source?: string;
  availability?: string;
  /** Price band group key — see `priceBandFor` in `items-grouping.ts`. */
  priceBand?: PriceBand;
};

export type PriceBand = 'free' | 'cheap' | 'mid' | 'expensive' | 'priceless';

/**
 * Catalog group-by axes. Group-by is a UI re-fold, not a URL filter
 * (per FR-008): switching it does not refetch.
 */
export type GroupBy =
  | 'category'
  | 'rarity'
  | 'slot'
  | 'priceBand'
  | 'source'
  | 'availability';

/** Catalog sort axes (FR-010). Default plan choice: `'name'`. */
export type SortKey = 'name' | 'price' | 'weight' | 'rarity';
export type SortDir = 'asc' | 'desc';

/**
 * One row in an inventory view (`<InventoryTab>` / stash inventory).
 * Aggregated from item legs by `aggregateItemLegs`. Linked items merge
 * by `itemNodeId`; free-text rows merge by name. Hot fields are
 * NULL for free-text rows (`itemNodeId === null`) — UI degrades.
 */
export type InventoryRow = {
  /** `null` for free-text rows; otherwise the canonical Образец id. */
  itemNodeId: string | null;
  /** Live-resolved title (catalog title for linked rows; snapshot for free-text). */
  itemName: string;
  /** Net qty (incoming − outgoing). Never 0 (filtered). May be < 0 if data integrity slipped. */
  qty: number;
  /** Most recent leg's `(loop_number, day_in_loop)` — for "когда последний раз менялось". */
  latestLoop: number;
  latestDay: number;
  /** Optional hot-field hydration for linked rows. NULL on free-text. */
  attributes: ItemNodeAttributes | null;
  /** `true` when `qty < 0` (data-integrity flag — UI renders red). */
  warning?: true;
};

/** Slice of `ItemNode` covering only the catalog hot fields. */
export type ItemNodeAttributes = {
  categorySlug: string;
  rarity: Rarity | null;
  priceGp: number | null;
  weightLb: number | null;
  slotSlug: string | null;
  sourceSlug: string | null;
  availabilitySlug: string | null;
};

/** Validation error shape for `validateItemPayload`. */
export type ItemValidationError = {
  field: keyof ItemPayload;
  message: string;
};

/** Payload accepted by `createItem` / `updateItem` — the editable Образец shape. */
export type ItemPayload = {
  title: string;
  categorySlug: string;
  rarity: Rarity | null;
  priceGp: number | null;
  weightLb: number | null;
  slotSlug: string | null;
  sourceSlug: string | null;
  availabilitySlug: string | null;
  srdSlug: string | null;
  description: string | null;
  sourceDetail: string | null;
  /**
   * Canonical https://dnd.su/items/... permalink. Free-form string;
   * we do not enforce URL syntax server-side so DMs can paste any
   * ссылка including future moves to next.dnd.su or homebrew pages.
   */
  dndsuUrl: string | null;
  /**
   * 5e «Требует настройки». Set by DM via form checkbox. Independent
   * of price autoflag (different concept).
   */
  requiresAttunement: boolean;
};

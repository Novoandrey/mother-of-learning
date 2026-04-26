/**
 * Item payload validation — spec-015 (pure).
 *
 * Hand-rolled validators per codebase convention (no zod). Used by
 * `<ItemCreateDialog>` / `<ItemEditDialog>` for form-level errors and
 * by `app/actions/items.ts` as defence-in-depth before the DB write.
 *
 * Returns `ItemValidationError[]` — empty array means "valid".
 *
 * Slot / source / availability slugs are validated against the
 * campaign's value lists (passed in as `availableSlugs`). Category
 * slug must be present in the available set; the field itself is
 * required (non-NULL).
 */

import type { ItemPayload, ItemValidationError, Rarity } from './items-types';

const VALID_RARITIES: ReadonlySet<Rarity> = new Set([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
]);

const TITLE_MAX = 200;
const SRD_SLUG_MAX = 80;
const DESCRIPTION_MAX = 4000;
const SOURCE_DETAIL_MAX = 200;

export type AvailableSlugs = {
  /** Required — every item MUST have a category. */
  categories: ReadonlySet<string>;
  slots: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  availabilities: ReadonlySet<string>;
};

/**
 * Validate `payload` against the campaign's available slug sets.
 * Returns `[]` on success, otherwise an array of field-level errors.
 *
 * Rules:
 *  - title: required, trimmed length 1..200.
 *  - categorySlug: required, must be in `availableSlugs.categories`.
 *  - rarity: NULL allowed; otherwise must be in the closed enum.
 *  - priceGp: NULL allowed; otherwise must be ≥ 0.
 *  - weightLb: NULL allowed; otherwise must be ≥ 0.
 *  - slotSlug: NULL allowed; otherwise must be in `availableSlugs.slots`.
 *  - sourceSlug: NULL allowed; otherwise must be in `availableSlugs.sources`.
 *  - availabilitySlug: NULL allowed; otherwise must be in `availableSlugs.availabilities`.
 *  - srdSlug: NULL allowed; max 80 chars; must be lowercase-kebab if provided.
 *  - description: NULL allowed; max 4000 chars.
 *  - sourceDetail: NULL allowed; max 200 chars.
 */
export function validateItemPayload(
  payload: ItemPayload,
  availableSlugs: AvailableSlugs,
): ItemValidationError[] {
  const errors: ItemValidationError[] = [];

  // title
  const title = payload.title?.trim() ?? '';
  if (title.length === 0) {
    errors.push({ field: 'title', message: 'Название не может быть пустым' });
  } else if (title.length > TITLE_MAX) {
    errors.push({ field: 'title', message: `Название не длиннее ${TITLE_MAX} символов` });
  }

  // categorySlug
  if (!payload.categorySlug || payload.categorySlug.trim().length === 0) {
    errors.push({ field: 'categorySlug', message: 'Категория обязательна' });
  } else if (!availableSlugs.categories.has(payload.categorySlug)) {
    errors.push({
      field: 'categorySlug',
      message: 'Категория не найдена в этой кампании',
    });
  }

  // rarity
  if (payload.rarity !== null && !VALID_RARITIES.has(payload.rarity)) {
    errors.push({ field: 'rarity', message: 'Недопустимое значение редкости' });
  }

  // priceGp
  if (payload.priceGp !== null) {
    if (typeof payload.priceGp !== 'number' || Number.isNaN(payload.priceGp)) {
      errors.push({ field: 'priceGp', message: 'Цена должна быть числом' });
    } else if (payload.priceGp < 0) {
      errors.push({ field: 'priceGp', message: 'Цена не может быть отрицательной' });
    }
  }

  // weightLb
  if (payload.weightLb !== null) {
    if (typeof payload.weightLb !== 'number' || Number.isNaN(payload.weightLb)) {
      errors.push({ field: 'weightLb', message: 'Вес должен быть числом' });
    } else if (payload.weightLb < 0) {
      errors.push({ field: 'weightLb', message: 'Вес не может быть отрицательным' });
    }
  }

  // slotSlug
  if (payload.slotSlug !== null) {
    if (!availableSlugs.slots.has(payload.slotSlug)) {
      errors.push({ field: 'slotSlug', message: 'Слот не найден в этой кампании' });
    }
  }

  // sourceSlug
  if (payload.sourceSlug !== null) {
    if (!availableSlugs.sources.has(payload.sourceSlug)) {
      errors.push({ field: 'sourceSlug', message: 'Источник не найден в этой кампании' });
    }
  }

  // availabilitySlug
  if (payload.availabilitySlug !== null) {
    if (!availableSlugs.availabilities.has(payload.availabilitySlug)) {
      errors.push({
        field: 'availabilitySlug',
        message: 'Доступность не найдена в этой кампании',
      });
    }
  }

  // srdSlug
  if (payload.srdSlug !== null) {
    const slug = payload.srdSlug.trim();
    if (slug.length === 0) {
      // Treat as null — let the action normalise.
    } else if (slug.length > SRD_SLUG_MAX) {
      errors.push({ field: 'srdSlug', message: `SRD slug не длиннее ${SRD_SLUG_MAX} символов` });
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      errors.push({
        field: 'srdSlug',
        message: 'SRD slug должен быть в формате lowercase-kebab',
      });
    }
  }

  // description
  if (
    payload.description !== null &&
    payload.description.length > DESCRIPTION_MAX
  ) {
    errors.push({
      field: 'description',
      message: `Описание не длиннее ${DESCRIPTION_MAX} символов`,
    });
  }

  // sourceDetail
  if (
    payload.sourceDetail !== null &&
    payload.sourceDetail.length > SOURCE_DETAIL_MAX
  ) {
    errors.push({
      field: 'sourceDetail',
      message: `Детали источника не длиннее ${SOURCE_DETAIL_MAX} символов`,
    });
  }

  return errors;
}

/**
 * Convenience: returns true when the payload is valid (i.e. empty
 * error array). Useful for early returns in form `onSubmit`.
 */
export function isValidItemPayload(
  payload: ItemPayload,
  availableSlugs: AvailableSlugs,
): boolean {
  return validateItemPayload(payload, availableSlugs).length === 0;
}

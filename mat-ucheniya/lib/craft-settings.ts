/**
 * Craft settings (spec-056) — types, defaults and parser for the
 * `craft_settings` block of `campaigns.settings`.
 *
 * Modeled EXACTLY on `lib/item-purchase-policy.ts`: a pure, client-safe
 * module with (1) types, (2) default constants, (3) a key-by-key
 * `parseCraftSettings(raw)` that silently falls back to defaults, and
 * (4) pure business helpers. No exceptions, no schema library.
 *
 * Per Andrey's rule (AGENTS.md «Game-mechanic numbers are DM settings»):
 * every number below is a DEFAULT the DM can override via
 * `campaigns.settings.craft_settings` — nothing here is wired into
 * business logic as a constant.
 *
 * The numbers come from Andrey's craft tables (spec-056 §1–§4):
 *   • gp/hour a crafter invests, by proficiency bonus (PB);
 *   • per-rarity costs: full (справочная) / working (рабочая = applied)
 *     + min party level;
 *   • custom-rarity row (вплетённые и прочие кастомные схемы);
 *   • shop markup ×1.2 (catalog price_gp includes it, craft costs don't);
 *   • weave (вплетение): surcharge factor by MAX spell level + the
 *     5-level cell cap (limits both the woven list and the daily pool).
 */

import type { RarityKey } from './item-default-prices'

// ============================================================================
// Types
// ============================================================================

/** PB values the rate table covers (levels 1–20). */
export type PbKey = '2' | '3' | '4' | '5' | '6'

export type CraftRarityRow = {
  /** Полная цена (колонка B — справочная: со схемой, без факультатива). */
  fullCostGp: number
  /** Рабочая цена (колонка C — применяется всегда: факультатив у всех). */
  workCostGp: number
  /** Минимальный уровень партии для крафта этой редкости. */
  minPartyLevel: number
}

export type CraftSettings = {
  /** зм/час вложения одним крафтером, по бонусу мастерства. */
  ratePerPbGpHour: Record<PbKey, number>
  /** Цены и гейты по редкостям (канонические 5 ключей каталога). */
  rarity: Record<RarityKey, CraftRarityRow>
  /** «Кастомная» строка таблицы Andrey (вплетённые и др.). minPartyLevel
   *  null = гейта нет (в скрине обрезан — хвост №3 спеки). */
  custom: { fullCostGp: number; workCostGp: number; minPartyLevel: number | null }
  /** Магазинная наценка каталога (price_gp = цена_без_наценки × markup). */
  shopMarkup: number
  weave: {
    /** Надбавка к цене крафта = perLevelStepGp × (макс_уровень + 1).
     *  Формула-кандидат по двум датапоинтам Andrey (спека §4, хвост №5). */
    perLevelStepGp: number
    /** Потолок ячеек: и суммарные уровни вплетаемого списка, и дневной
     *  пул использования (симметрия 5/5, решения Andrey 2026-07-09). */
    cellCap: number
  }
}

// ============================================================================
// Defaults (Andrey's tables, spec-056)
// ============================================================================

const DEFAULT_RATE: Record<PbKey, number> = {
  '2': 3.125,
  '3': 10,
  '4': 50,
  '5': 75,
  '6': 100,
}

const DEFAULT_RARITY: Record<RarityKey, CraftRarityRow> = {
  common: { fullCostGp: 100, workCostGp: 50, minPartyLevel: 3 },
  uncommon: { fullCostGp: 150, workCostGp: 75, minPartyLevel: 3 },
  rare: { fullCostGp: 500, workCostGp: 250, minPartyLevel: 6 },
  'very-rare': { fullCostGp: 5000, workCostGp: 2500, minPartyLevel: 11 },
  legendary: { fullCostGp: 50000, workCostGp: 25000, minPartyLevel: 17 },
}

const DEFAULT_CUSTOM: CraftSettings['custom'] = {
  fullCostGp: 500,
  workCostGp: 250,
  minPartyLevel: null,
}

export const DEFAULT_CRAFT_SETTINGS: CraftSettings = {
  ratePerPbGpHour: { ...DEFAULT_RATE },
  rarity: {
    common: { ...DEFAULT_RARITY.common },
    uncommon: { ...DEFAULT_RARITY.uncommon },
    rare: { ...DEFAULT_RARITY.rare },
    'very-rare': { ...DEFAULT_RARITY['very-rare'] },
    legendary: { ...DEFAULT_RARITY.legendary },
  },
  custom: { ...DEFAULT_CUSTOM },
  shopMarkup: 1.2,
  weave: { perLevelStepGp: 37.5, cellCap: 5 },
}

const PB_KEYS: readonly PbKey[] = ['2', '3', '4', '5', '6']
const RARITY_KEYS_LOCAL: readonly RarityKey[] = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
]

// ============================================================================
// Parser (key-by-key, silent fallback — parseItemPurchasePolicy pattern)
// ============================================================================

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function posNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function parseRate(raw: unknown): Record<PbKey, number> {
  const out = { ...DEFAULT_RATE }
  if (!isObj(raw)) return out
  for (const k of PB_KEYS) {
    const v = posNum(raw[k])
    if (v !== null) out[k] = v
  }
  return out
}

function parseRarityRow(raw: unknown, dflt: CraftRarityRow): CraftRarityRow {
  const out = { ...dflt }
  if (!isObj(raw)) return out
  const full = posNum(raw.fullCostGp)
  const work = posNum(raw.workCostGp)
  const min = posNum(raw.minPartyLevel)
  if (full !== null) out.fullCostGp = full
  if (work !== null) out.workCostGp = work
  if (min !== null) out.minPartyLevel = Math.trunc(min)
  return out
}

function parseRarityTable(raw: unknown): Record<RarityKey, CraftRarityRow> {
  const out = {
    common: { ...DEFAULT_RARITY.common },
    uncommon: { ...DEFAULT_RARITY.uncommon },
    rare: { ...DEFAULT_RARITY.rare },
    'very-rare': { ...DEFAULT_RARITY['very-rare'] },
    legendary: { ...DEFAULT_RARITY.legendary },
  }
  if (!isObj(raw)) return out
  for (const k of RARITY_KEYS_LOCAL) {
    out[k] = parseRarityRow(raw[k], out[k])
  }
  return out
}

function parseCustom(raw: unknown): CraftSettings['custom'] {
  const out = { ...DEFAULT_CUSTOM }
  if (!isObj(raw)) return out
  const full = posNum(raw.fullCostGp)
  const work = posNum(raw.workCostGp)
  if (full !== null) out.fullCostGp = full
  if (work !== null) out.workCostGp = work
  if (raw.minPartyLevel === null) out.minPartyLevel = null
  else {
    const min = posNum(raw.minPartyLevel)
    if (min !== null) out.minPartyLevel = Math.trunc(min)
  }
  return out
}

function parseWeave(raw: unknown): CraftSettings['weave'] {
  const out = { ...DEFAULT_CRAFT_SETTINGS.weave }
  if (!isObj(raw)) return out
  const step = posNum(raw.perLevelStepGp)
  const cap = posNum(raw.cellCap)
  if (step !== null) out.perLevelStepGp = step
  if (cap !== null) out.cellCap = Math.trunc(cap)
  return out
}

/** Parse the `craft_settings` block; any invalid/missing key → default. */
export function parseCraftSettings(raw: unknown): CraftSettings {
  if (!isObj(raw)) {
    return {
      ...DEFAULT_CRAFT_SETTINGS,
      ratePerPbGpHour: { ...DEFAULT_RATE },
      rarity: parseRarityTable(undefined),
      custom: { ...DEFAULT_CUSTOM },
      weave: { ...DEFAULT_CRAFT_SETTINGS.weave },
    }
  }
  const markup = posNum(raw.shopMarkup)
  return {
    ratePerPbGpHour: parseRate(raw.ratePerPbGpHour),
    rarity: parseRarityTable(raw.rarity),
    custom: parseCustom(raw.custom),
    shopMarkup: markup !== null && markup > 0 ? markup : DEFAULT_CRAFT_SETTINGS.shopMarkup,
    weave: parseWeave(raw.weave),
  }
}

// ============================================================================
// Pure business helpers
// ============================================================================

/** зм/час для данного БМ; БМ вне таблицы клампится в её диапазон (2..6). */
export function rateForPb(s: CraftSettings, pb: number): number {
  const clamped = Math.min(6, Math.max(2, Math.trunc(pb)))
  return s.ratePerPbGpHour[String(clamped) as PbKey]
}

/**
 * Строка цены для редкости; `null` редкость = «Кастомная» строка таблицы.
 * (rarity CHECK каталога не знает 'custom' — кастомные схемы хранят
 * rarity NULL; см. plan.md.)
 */
export function craftRowFor(
  s: CraftSettings,
  rarity: RarityKey | null,
): { fullCostGp: number; workCostGp: number; minPartyLevel: number | null } {
  if (rarity === null) return s.custom
  return s.rarity[rarity]
}

/** Надбавка за вплетение по максимальному уровню заклинания в списке. */
export function weaveSurchargeGp(s: CraftSettings, maxSpellLevel: number): number {
  if (!Number.isFinite(maxSpellLevel) || maxSpellLevel <= 0) return 0
  return s.weave.perLevelStepGp * (Math.trunc(maxSpellLevel) + 1)
}

/**
 * Сколько «ставко-часов» надо вложить: cost / rate. Время колонки E из
 * таблицы Andrey — ровно это число при текущем БМ (50/50=1ч, 75/50=1.5ч).
 */
export function requiredRateHours(workCostGp: number, ratePerHour: number): number {
  if (!(ratePerHour > 0)) return Infinity
  return workCostGp / ratePerHour
}

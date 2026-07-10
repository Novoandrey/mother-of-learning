/**
 * Scribe settings (spec-059) — types, defaults and parser for the
 * `scribe_settings` block of `campaigns.settings` (написание свитков).
 *
 * Зеркало `lib/craft-settings.ts`: чистый client-safe модуль — (1) типы,
 * (2) дефолт-константы, (3) key-by-key `parseScribeSettings(raw)` с тихим
 * фолбэком, (4) чистые хелперы. Без исключений и schema-библиотек.
 *
 * Правило AGENTS.md: каждое число — ДЕФОЛТ, который ДМ переопределяет через
 * `campaigns.settings.scribe_settings`. Таблица — канон Andrey (spec-059):
 * уровень заклинания → {норма часов, фикс-цена зм}. Отличие от крафта:
 * ЧАСЫ — это ПОРОГ (Σ часов писцов ≥ норма), а ДЕНЬГИ — ФИКС-цена из таблицы
 * (не часы×ставка). hoursPerDay/Week — для отображения дней/недель (лог, не гейт).
 */

// ============================================================================
// Types
// ============================================================================

/** Уровни заклинаний, которые покрывает таблица (0=заговор … 9). */
export type SpellLevelKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export type ScribeRow = {
  /** Норма часов записи (Σ часов писцов должна её достигнуть). */
  hours: number
  /** Фиксированная цена записи в зм (списывается с общака). */
  costGp: number
}

export type ScribeSettings = {
  /** Таблица: уровень заклинания → {норма часов, цена}. */
  table: Record<SpellLevelKey, ScribeRow>
  /** Часов в рабочем дне (для отображения дней; лог, не гейт). */
  hoursPerDay: number
  /** Часов в рабочей неделе (для отображения недель). */
  hoursPerWeek: number
}

// ============================================================================
// Defaults (таблица Andrey, spec-059 §«Таблица написания»)
// ============================================================================

const DEFAULT_TABLE: Record<SpellLevelKey, ScribeRow> = {
  '0': { hours: 8, costGp: 15 }, // Заговор — 1 день
  '1': { hours: 8, costGp: 25 }, // 1 день
  '2': { hours: 24, costGp: 250 }, // 3 дня
  '3': { hours: 40, costGp: 500 }, // 1 рабочая неделя
  '4': { hours: 80, costGp: 2500 }, // 2 недели
  '5': { hours: 160, costGp: 5000 }, // 4 недели
  '6': { hours: 320, costGp: 15000 }, // 8 недель
  '7': { hours: 640, costGp: 25000 }, // 16 недель
  '8': { hours: 1280, costGp: 50000 }, // 32 недели
  '9': { hours: 1920, costGp: 250000 }, // 48 недель
}

export const SPELL_LEVEL_KEYS: readonly SpellLevelKey[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]

function cloneTable(
  t: Record<SpellLevelKey, ScribeRow>,
): Record<SpellLevelKey, ScribeRow> {
  const out = {} as Record<SpellLevelKey, ScribeRow>
  for (const k of SPELL_LEVEL_KEYS) out[k] = { ...t[k] }
  return out
}

export const DEFAULT_SCRIBE_SETTINGS: ScribeSettings = {
  table: cloneTable(DEFAULT_TABLE),
  hoursPerDay: 8,
  hoursPerWeek: 40,
}

// ============================================================================
// Parser (key-by-key, silent fallback — parseCraftSettings pattern)
// ============================================================================

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function posNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function parseTable(raw: unknown): Record<SpellLevelKey, ScribeRow> {
  const out = cloneTable(DEFAULT_TABLE)
  if (!isObj(raw)) return out
  for (const k of SPELL_LEVEL_KEYS) {
    const row = raw[k]
    if (!isObj(row)) continue
    const h = posNum(row.hours)
    const c = posNum(row.costGp)
    if (h !== null) out[k].hours = h
    if (c !== null) out[k].costGp = c
  }
  return out
}

/** Parse the `scribe_settings` block; any invalid/missing key → default. */
export function parseScribeSettings(raw: unknown): ScribeSettings {
  if (!isObj(raw)) {
    return {
      table: cloneTable(DEFAULT_TABLE),
      hoursPerDay: DEFAULT_SCRIBE_SETTINGS.hoursPerDay,
      hoursPerWeek: DEFAULT_SCRIBE_SETTINGS.hoursPerWeek,
    }
  }
  const hpd = posNum(raw.hoursPerDay)
  const hpw = posNum(raw.hoursPerWeek)
  return {
    table: parseTable(raw.table),
    hoursPerDay: hpd !== null && hpd > 0 ? hpd : DEFAULT_SCRIBE_SETTINGS.hoursPerDay,
    hoursPerWeek: hpw !== null && hpw > 0 ? hpw : DEFAULT_SCRIBE_SETTINGS.hoursPerWeek,
  }
}

// ============================================================================
// Pure business helpers
// ============================================================================

/** Строка таблицы для уровня заклинания; уровень клампится в 0..9. */
export function scribeRowFor(s: ScribeSettings, spellLevel: number): ScribeRow {
  const clamped = Math.min(9, Math.max(0, Math.trunc(spellLevel)))
  return s.table[String(clamped) as SpellLevelKey]
}

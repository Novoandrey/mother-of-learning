/**
 * Spell settings (spec-059) — types, defaults and parser for the
 * `spell_settings` block of `campaigns.settings`. Числа глаголов
 * ПЕРЕПОДГОТОВКА (house-механика) и КОПИРОВАНИЕ в книгу (RAW волшебника).
 *
 * Зеркало `lib/craft-settings.ts` (pure client-safe, silent-fallback parser).
 * Правило AGENTS.md: числа — ДЕФОЛТЫ, ДМ переопределяет через
 * campaigns.settings.spell_settings. Дефолты:
 *   • переподготовка = 50 зм × уровень НОВОГО заклинания (заговор ур.0 → 0);
 *   • копирование = 50 зм × уровень (PHB/DMG RAW) + 2 ч × уровень (лог, не гейт).
 */

// ============================================================================
// Types
// ============================================================================

export type SpellSettings = {
  /** Переподготовка: зм × уровень нового заклинания (house). */
  reprepGpPerLevel: number
  /** Копирование в книгу: зм × уровень (RAW). */
  copyGpPerLevel: number
  /** Копирование в книгу: часов × уровень (лог/нарратив, не гейт). */
  copyHoursPerLevel: number
}

export const DEFAULT_SPELL_SETTINGS: SpellSettings = {
  reprepGpPerLevel: 50,
  copyGpPerLevel: 50,
  copyHoursPerLevel: 2,
}

// ============================================================================
// Parser (key-by-key, silent fallback)
// ============================================================================

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function posNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/** Parse the `spell_settings` block; any invalid/missing key → default. */
export function parseSpellSettings(raw: unknown): SpellSettings {
  if (!isObj(raw)) return { ...DEFAULT_SPELL_SETTINGS }
  const rep = posNum(raw.reprepGpPerLevel)
  const cg = posNum(raw.copyGpPerLevel)
  const ch = posNum(raw.copyHoursPerLevel)
  return {
    reprepGpPerLevel: rep !== null ? rep : DEFAULT_SPELL_SETTINGS.reprepGpPerLevel,
    copyGpPerLevel: cg !== null ? cg : DEFAULT_SPELL_SETTINGS.copyGpPerLevel,
    copyHoursPerLevel:
      ch !== null ? ch : DEFAULT_SPELL_SETTINGS.copyHoursPerLevel,
  }
}

// ============================================================================
// Pure business helpers
// ============================================================================

/** Цена переподготовки: зм × уровень (заговор ур.0 → 0 = бесплатно). */
export function reprepCostGp(s: SpellSettings, spellLevel: number): number {
  return s.reprepGpPerLevel * Math.max(0, Math.trunc(spellLevel))
}

/** Цена копирования в книгу: зм × уровень (заговор ур.0 → 0). */
export function copyCostGp(s: SpellSettings, spellLevel: number): number {
  return s.copyGpPerLevel * Math.max(0, Math.trunc(spellLevel))
}

/** Часы копирования (лог/нарратив): часов × уровень. */
export function copyHours(s: SpellSettings, spellLevel: number): number {
  return s.copyHoursPerLevel * Math.max(0, Math.trunc(spellLevel))
}

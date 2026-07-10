/**
 * Pure helpers for the loop's party level (spec-056 Крафт). Modeled on
 * `lib/loop-length.ts`: loop nodes keep scalar config in `nodes.fields`,
 * and a client-safe module parses it with a forgiving fallback.
 *
 * `party_level` is the campaign party's character level for that loop
 * (spec-056: «петля 7 → уровень 9»). Unlike length_days there is NO
 * default: crafting is gated on the level being set, so absence must be
 * visible (null), not silently patched.
 *
 * Safe to import from client components, server components, server
 * actions, and plain utility modules. No side effects.
 */

/**
 * Parse party_level from loop fields. Returns a positive integer or null
 * when missing/empty/non-numeric — null means "not set", and craft flows
 * must refuse to run until the DM sets it on the loop node.
 */
export function parsePartyLevel(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  return i >= 1 ? i : null
}

/**
 * Standard D&D proficiency bonus for a character level:
 * 2 + floor((level − 1) / 4) → 1–4→2, 5–8→3, 9–12→4, 13–16→5, 17–20→6.
 * This is a rules identity, not a tunable number — the tunable part
 * (gp/hour per PB) lives in craft_settings (lib/craft-settings.ts).
 */
export function pbForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4)
}

/**
 * Максимальный уровень заклинания, доступный партии на данном уровне
 * персонажей (spec-059): full-caster прогрессия min(9, ceil(level / 2)) —
 * ур. 9 → 5-й круг, 17 → 9-й. Заговоры (0) доступны всегда. Как pbForLevel —
 * это правило D&D, НЕ настройка (spec §Производные: настраивается таблица
 * часов/цены, но не формула гейта). Свитки и переподготовка гейтятся этим.
 */
export function maxSpellLevel(partyLevel: number): number {
  return Math.min(9, Math.ceil(Math.max(1, partyLevel) / 2))
}

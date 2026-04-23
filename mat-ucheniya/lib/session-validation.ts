/**
 * Day-range validation for session nodes (spec-009).
 *
 * Shape rules:
 *   - Both empty ⇒ OK (undated session).
 *   - Exactly one set ⇒ error.
 *   - Both set ⇒ must be integers with `1 ≤ day_from ≤ day_to ≤ loopLength`.
 *
 * Accepts loose inputs (number, numeric string, empty string, null,
 * undefined) because form fields and jsonb-parsed values travel as
 * whatever HTML / PostgREST hands us. Callers don't have to normalize.
 *
 * Returns `null` when valid, or a user-facing Russian error string.
 */
export function validateDayRange(
  day_from: unknown,
  day_to: unknown,
  loopLength: number,
): string | null {
  const from = parseDay(day_from)
  const to = parseDay(day_to)

  const fromBlank = isBlank(day_from)
  const toBlank = isBlank(day_to)

  // Both empty ⇒ undated, OK.
  if (fromBlank && toBlank) return null

  // Exactly one filled ⇒ error.
  if (fromBlank !== toBlank) {
    return 'Укажи оба дня или оставь оба поля пустыми.'
  }

  // Both filled but not parseable as integers.
  if (from == null || to == null) {
    return 'День должен быть целым числом.'
  }

  // Positive integers.
  if (from < 1 || to < 1) {
    return 'День должен быть не меньше 1.'
  }

  // Within loop length.
  const bound =
    Number.isFinite(loopLength) && loopLength > 0 ? Math.trunc(loopLength) : 30
  if (from > bound || to > bound) {
    return `День не должен превышать длину петли (${bound}).`
  }

  // Ordering.
  if (from > to) {
    return 'День «от» не может быть позже дня «до».'
  }

  return null
}

function isBlank(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string' && v.trim() === '') return true
  return false
}

function parseDay(v: unknown): number | null {
  if (isBlank(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return null
  // Reject non-integer inputs (e.g. 3.5) explicitly.
  if (!Number.isInteger(n)) return null
  return n
}

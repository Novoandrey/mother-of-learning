/**
 * Expedition calendar (spec-055 «Вылазки» — слой времени). PURE, no I/O, no
 * server-only imports → unit-testable and safe to import anywhere (server
 * action, /tg UI).
 *
 * ── Time model (Andrey, strict) ─────────────────────────────────────────────
 * The loop is a «месяц странствий» — a 30-day month. It does NOT start at
 * midnight: it opens at 02:00 on day 1 and closes at 02:00 on day 31 (= 02:00
 * of the month of рдение), i.e. exactly 30×24h later. A player places a вылазка
 * as: day 1–30 + a start clock time HH:MM + a duration HH:MM.
 *
 * Minutes live on one absolute axis measured from midnight of day 1 (day 1
 * 00:00 = 0). On that axis the playable window is
 * [LOOP_START_ABS_MIN, LOOP_END_ABS_MIN] = [120, 43320]. `startMinute` is the
 * minute WITHIN a day (0..1439 = час*60+мин); the `day` carries the rest.
 *
 * ⚠️ These constants are GLOBAL for now. They will move to a per-campaign
 * calendar config in spec-057 (campaigns may run different loop lengths / start
 * hours). Keep ALL loop-shape knowledge in this file so that migration is a
 * single-file change.
 */

/** Days in one loop («месяц странствий»). */
export const LOOP_DAYS = 30

/** Clock hour the loop opens and closes on (02:00). */
export const LOOP_START_HOUR = 2

/** Absolute minute of the loop start: 02:00 of day 1 = 2×60. */
export const LOOP_START_ABS_MIN = LOOP_START_HOUR * 60 // 120

/**
 * Absolute minute of the loop end: 02:00 of day 31 — LOOP_DAYS full days after
 * day-1 midnight, plus the 02:00 offset. 30×1440 + 120 = 43320.
 */
export const LOOP_END_ABS_MIN = LOOP_DAYS * 1440 + LOOP_START_ABS_MIN // 43320

/** Minutes in a day — local shorthand. */
const DAY_MIN = 1440

/**
 * Absolute minute (from day-1 midnight) of `startMinute` on `day`.
 * `startMinute` is the minute within the day (0..1439 = час*60+мин).
 */
export function startAbsMin(day: number, startMinute: number): number {
  return (day - 1) * DAY_MIN + startMinute
}

/** Result of the strict window gate. */
export type WindowCheck = { ok: true } | { ok: false; error: string }

/**
 * STRICT gate for a вылазка's window. Rejects, with a Russian message:
 *   • `day` outside 1..LOOP_DAYS,
 *   • `startMinute` outside 0..1439,
 *   • negative `durationMinute`,
 *   • a start before the loop opens (02:00 day 1),
 *   • an end past the loop close (02:00 day 31).
 * The end check is INCLUSIVE — a вылазка may finish exactly at 02:00 day 31.
 */
export function validateExpeditionWindow(input: {
  day: number
  startMinute: number
  durationMinute: number
}): WindowCheck {
  const { day, startMinute, durationMinute } = input

  if (!Number.isInteger(day) || day < 1 || day > LOOP_DAYS) {
    return { ok: false, error: `День должен быть в пределах 1–${LOOP_DAYS}` }
  }
  if (
    !Number.isInteger(startMinute) ||
    startMinute < 0 ||
    startMinute > DAY_MIN - 1
  ) {
    return { ok: false, error: 'Время старта должно быть в пределах 00:00–23:59' }
  }
  if (!Number.isInteger(durationMinute) || durationMinute < 0) {
    return { ok: false, error: 'Длительность не может быть отрицательной' }
  }

  const startAbs = startAbsMin(day, startMinute)
  if (startAbs < LOOP_START_ABS_MIN) {
    return { ok: false, error: 'Петля начинается в 02:00 дня 1' }
  }
  if (startAbs + durationMinute > LOOP_END_ABS_MIN) {
    return { ok: false, error: 'Вылазка выходит за конец петли (02:00 дня 31)' }
  }
  return { ok: true }
}

/** Minute-of-day (0..1439) → clock string «HH:MM». Wraps at 24h; clamps junk to 00:00. */
export function minuteToHHMM(min: number): string {
  const safe = Number.isFinite(min) ? Math.max(0, Math.trunc(min)) : 0
  const h = Math.floor(safe / 60) % 24
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Clock (h, m) → minute-of-day. Inverse of {@link minuteToHHMM} for 0..23 / 0..59. */
export function hhmmToMinute(h: number, m: number): number {
  return h * 60 + m
}

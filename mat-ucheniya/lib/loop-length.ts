/**
 * Pure helpers for loop length (spec-009). Separated from `lib/loops.ts`
 * because that file pulls in the server Supabase client (which imports
 * `next/headers`), making it unusable from `'use client'` code.
 *
 * Safe to import from client components, server components, server
 * actions, and plain utility modules. No side effects.
 */

/**
 * Default loop length in days when a loop node doesn't specify one.
 * Two in-game "weeks" per month (the campaign's calendar convention).
 */
export const DEFAULT_LOOP_LENGTH_DAYS = 30

/**
 * Parse length_days from loop fields. Always returns a positive number;
 * falls back to DEFAULT_LOOP_LENGTH_DAYS when missing, empty, or
 * non-numeric.
 */
export function parseLengthDays(v: unknown): number {
  if (v == null || v === '') return DEFAULT_LOOP_LENGTH_DAYS
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_LOOP_LENGTH_DAYS
}

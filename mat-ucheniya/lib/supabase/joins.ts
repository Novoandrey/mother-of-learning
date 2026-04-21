/**
 * Supabase join-shape utilities.
 *
 * Problem: the Supabase TS generator cannot tell whether a nested `select()`
 * like `type:node_types(slug)` returns a single related row or an array. It
 * often widens the type to `T | T[] | null`, which makes call-sites resort to
 * `(x as any).type[0]?.slug` juggling.
 *
 * Solution: use `Joined<T>` as the canonical shape and `unwrapOne()` to
 * normalize it into `T | null` without the `any` cast.
 */

export type Joined<T> = T | T[] | null | undefined

/**
 * Collapse a Supabase joined relation into a single value.
 *
 * Handles the three shapes that can come back from a nested `select()`:
 *   - a single object (1:1 or 1:N picked as one)
 *   - an array of objects (N:M, or when the TS generator guesses wrong)
 *   - null/undefined
 */
export function unwrapOne<T>(joined: Joined<T>): T | null {
  if (joined == null) return null
  return Array.isArray(joined) ? (joined[0] ?? null) : joined
}

/**
 * Collapse a Supabase joined relation into an array.
 *
 * Mirror of `unwrapOne` — if the generator accidentally narrowed a list to a
 * single object, wrap it back. Always returns an array (possibly empty).
 */
export function unwrapMany<T>(joined: Joined<T>): T[] {
  if (joined == null) return []
  return Array.isArray(joined) ? joined : [joined]
}

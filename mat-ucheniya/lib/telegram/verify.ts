/**
 * Verify a minted Supabase JWT (spec-044, PL-1 — auth adapter "path B").
 *
 * Counterpart to `mintSupabaseJwt` (spec-046). The Telegram Mini App
 * authenticates server actions with the minted token instead of a GoTrue
 * cookie session. This verifies the token (HS256 against the Supabase stack's
 * JWT secret, `aud: 'authenticated'`, `role: 'authenticated'`) and returns the
 * `sub` claim as the user id.
 *
 * Pure: the secret is passed in (callers read it from env), so this is
 * unit-testable and carries no secret of its own. Returns `null` on any
 * failure (bad signature, expired, wrong audience/role, missing sub) —
 * callers treat `null` as "not authenticated".
 */
import { jwtVerify } from 'jose'

export async function verifySupabaseJwt(
  token: string,
  jwtSecret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ userId: string } | null> {
  if (!token || !jwtSecret) return null
  try {
    const key = new TextEncoder().encode(jwtSecret)
    const { payload } = await jwtVerify(token, key, {
      audience: 'authenticated',
      currentDate: new Date(now * 1000),
    })
    if (payload.role !== 'authenticated') return null
    const sub = typeof payload.sub === 'string' ? payload.sub : ''
    if (!sub) return null
    return { userId: sub }
  } catch {
    return null
  }
}

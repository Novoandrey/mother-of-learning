/**
 * Mint a Supabase-compatible JWT for a linked account (spec-046, FR-002).
 *
 * Claims make PostgREST treat the request as authenticated and `auth.uid()`
 * return `sub`, so the existing RLS (024 + policy migrations) keeps working
 * unchanged. Signed HS256 with the Supabase stack's JWT secret.
 *
 * Pure: the secret is passed in (the route handler reads it from env), so this
 * is unit-testable and carries no secret of its own. The minted token is used
 * client-side via supabase-js's `accessToken` option — no GoTrue session.
 */
import { SignJWT } from 'jose'

export async function mintSupabaseJwt(
  userId: string,
  jwtSecret: string,
  ttlSeconds = 3600,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!userId) throw new Error('mintSupabaseJwt: missing userId')
  if (!jwtSecret) throw new Error('mintSupabaseJwt: missing jwtSecret')

  const key = new TextEncoder().encode(jwtSecret)
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key)
}

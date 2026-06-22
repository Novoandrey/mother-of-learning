import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { mintSupabaseJwt } from '../telegram/mint'
import { verifySupabaseJwt } from '../telegram/verify'

const SECRET = 'super-secret-jwt-key-at-least-32-bytes-long!!'
const KEY = new TextEncoder().encode(SECRET)
const NOW = 1_700_000_000

describe('verifySupabaseJwt', () => {
  it('accepts a freshly minted token and returns the sub as userId', async () => {
    const jwt = await mintSupabaseJwt('user-uuid-123', SECRET, 3600, NOW)
    const res = await verifySupabaseJwt(jwt, SECRET, NOW)
    expect(res).toEqual({ userId: 'user-uuid-123' })
  })

  it('rejects an expired token', async () => {
    const jwt = await mintSupabaseJwt('user-uuid-123', SECRET, 3600, NOW)
    // verify "now" is 2h after issue → past exp
    const res = await verifySupabaseJwt(jwt, SECRET, NOW + 7200)
    expect(res).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const jwt = await mintSupabaseJwt('user-uuid-123', 'a-totally-different-secret-key-32!!', 3600, NOW)
    const res = await verifySupabaseJwt(jwt, SECRET, NOW)
    expect(res).toBeNull()
  })

  it('rejects a token with the wrong audience', async () => {
    const jwt = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-uuid-123')
      .setAudience('something-else')
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 3600)
      .sign(KEY)
    const res = await verifySupabaseJwt(jwt, SECRET, NOW)
    expect(res).toBeNull()
  })

  it('rejects a token whose role is not authenticated', async () => {
    const jwt = await new SignJWT({ role: 'anon' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-uuid-123')
      .setAudience('authenticated')
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 3600)
      .sign(KEY)
    const res = await verifySupabaseJwt(jwt, SECRET, NOW)
    expect(res).toBeNull()
  })

  it('rejects a token with no subject', async () => {
    const jwt = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience('authenticated')
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 3600)
      .sign(KEY)
    const res = await verifySupabaseJwt(jwt, SECRET, NOW)
    expect(res).toBeNull()
  })

  it('rejects a tampered token', async () => {
    const jwt = await mintSupabaseJwt('user-uuid-123', SECRET, 3600, NOW)
    const tampered = jwt.slice(0, -3) + (jwt.endsWith('aaa') ? 'bbb' : 'aaa')
    const res = await verifySupabaseJwt(tampered, SECRET, NOW)
    expect(res).toBeNull()
  })

  it('returns null on empty inputs', async () => {
    expect(await verifySupabaseJwt('', SECRET)).toBeNull()
    expect(await verifySupabaseJwt('x.y.z', '')).toBeNull()
  })
})

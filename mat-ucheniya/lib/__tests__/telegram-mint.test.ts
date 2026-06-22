import { describe, it, expect } from 'vitest'
import { jwtVerify } from 'jose'
import { mintSupabaseJwt } from '../telegram/mint'

const SECRET = 'super-secret-jwt-key-at-least-32-bytes-long!!'
const KEY = new TextEncoder().encode(SECRET)

describe('mintSupabaseJwt', () => {
  it('produces a JWT verifiable with the secret and the right claims', async () => {
    const now = 1_700_000_000
    const jwt = await mintSupabaseJwt('user-uuid-123', SECRET, 3600, now)
    const { payload } = await jwtVerify(jwt, KEY, {
      audience: 'authenticated',
      currentDate: new Date(now * 1000),
    })
    expect(payload.sub).toBe('user-uuid-123')
    expect(payload.role).toBe('authenticated')
    expect(payload.aud).toBe('authenticated')
    expect(payload.iat).toBe(now)
    expect(payload.exp).toBe(now + 3600)
  })

  it('fails verification with a different secret', async () => {
    const jwt = await mintSupabaseJwt('user-uuid-123', SECRET)
    const wrong = new TextEncoder().encode('a-totally-different-secret-key-32!!')
    await expect(jwtVerify(jwt, wrong)).rejects.toBeTruthy()
  })

  it('throws on missing inputs', async () => {
    await expect(mintSupabaseJwt('', SECRET)).rejects.toThrow()
    await expect(mintSupabaseJwt('u', '')).rejects.toThrow()
  })
})

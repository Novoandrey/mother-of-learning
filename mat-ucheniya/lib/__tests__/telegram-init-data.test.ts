import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { validateInitData } from '../telegram/init-data'

const BOT_TOKEN = '123456:TEST-bot-token'
const NOW = 1_700_000_000
const USER = JSON.stringify({ id: 42, username: 'tester', first_name: 'T' })

/** Build a correctly-signed initData query string for the given fields. */
function signInitData(fields: Record<string, string>, botToken: string): string {
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(dcs).digest('hex')
  const usp = new URLSearchParams(fields)
  usp.set('hash', hash)
  return usp.toString()
}

describe('validateInitData', () => {
  it('accepts a correctly signed payload', () => {
    const initData = signInitData({ user: USER, auth_date: String(NOW) }, BOT_TOKEN)
    const r = validateInitData(initData, BOT_TOKEN, 3600, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.user.id).toBe(42)
      expect(r.user.username).toBe('tester')
      expect(r.authDate).toBe(NOW)
    }
  })

  it('rejects a tampered hash', () => {
    const initData = signInitData({ user: USER, auth_date: String(NOW) }, BOT_TOKEN)
    const usp = new URLSearchParams(initData)
    usp.set('hash', 'deadbeef')
    const r = validateInitData(usp.toString(), BOT_TOKEN, 3600, NOW)
    expect(r.ok).toBe(false)
  })

  it('rejects the wrong bot token', () => {
    const initData = signInitData({ user: USER, auth_date: String(NOW) }, BOT_TOKEN)
    const r = validateInitData(initData, 'WRONG:token', 3600, NOW)
    expect(r.ok).toBe(false)
  })

  it('rejects a stale auth_date', () => {
    const initData = signInitData({ user: USER, auth_date: String(NOW - 7200) }, BOT_TOKEN)
    const r = validateInitData(initData, BOT_TOKEN, 3600, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('stale auth_date')
  })

  it('rejects missing hash', () => {
    const r = validateInitData(
      `user=${encodeURIComponent(USER)}&auth_date=${NOW}`,
      BOT_TOKEN,
      3600,
      NOW,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('missing hash')
  })
})

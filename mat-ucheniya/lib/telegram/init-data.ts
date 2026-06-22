/**
 * Telegram Mini App `initData` validation (spec-046, FR-001).
 *
 * Pure: the bot token is passed in (the route handler reads it from env), so
 * this is unit-testable and carries no secret of its own.
 *
 * Algorithm (Telegram WebApp):
 *   data_check_string = "key=value" for every field except `hash`,
 *                       sorted by key, joined by "\n"
 *   secret_key        = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   expected_hash     = HMAC_SHA256(key=secret_key, message=data_check_string)
 *   valid             <=> expected_hash === hash  AND  auth_date is fresh
 */
import { createHmac } from 'node:crypto'

export type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; error: string }

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600,
  now: number = Math.floor(Date.now() / 1000),
): InitDataResult {
  if (!initData) return { ok: false, error: 'empty initData' }
  if (!botToken) return { ok: false, error: 'missing bot token' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, error: 'missing hash' }

  const pairs: string[] = []
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue
    pairs.push(`${key}=${value}`)
  }
  pairs.sort()
  const dataCheckString = pairs.join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expected !== hash) return { ok: false, error: 'bad hash' }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate)) return { ok: false, error: 'missing auth_date' }
  if (now - authDate > maxAgeSeconds) return { ok: false, error: 'stale auth_date' }

  const userRaw = params.get('user')
  if (!userRaw) return { ok: false, error: 'missing user' }
  let user: TelegramUser
  try {
    user = JSON.parse(userRaw) as TelegramUser
  } catch {
    return { ok: false, error: 'bad user json' }
  }
  if (typeof user.id !== 'number') return { ok: false, error: 'bad user id' }

  return { ok: true, user, authDate }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateInitData } from '@/lib/telegram/init-data'
import { mintSupabaseJwt } from '@/lib/telegram/mint'

/**
 * POST /api/tg/auth  — body: { initData: string }
 *
 * Telegram Mini App identity (spec-046). Validates the Telegram WebApp
 * initData (HMAC over the bot token), looks up the linked account, and mints a
 * Supabase-compatible JWT for it. The minted token is used client-side via
 * supabase-js's `accessToken` option — no GoTrue session.
 *
 * initData IS the authentication here, so this is treated like a login
 * endpoint. The lookup uses the service role (the request is otherwise
 * unauthenticated). No write happens here.
 *
 * Responses:
 *   200 { jwt, userId }                          — linked, signed in
 *   200 { unlinked: true, telegramId, username } — valid Telegram user, no
 *                                                  linked account yet (C-01 б)
 *   400 { error }                                — bad body
 *   401 { error }                                — bad/forged/stale initData
 *   500 { error }                                — server misconfigured / lookup
 */
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!botToken || !jwtSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured: TELEGRAM_BOT_TOKEN / SUPABASE_JWT_SECRET missing' },
      { status: 500 },
    )
  }

  let initData = ''
  try {
    const body = (await request.json()) as { initData?: unknown }
    initData = typeof body.initData === 'string' ? body.initData : ''
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const v = validateInitData(initData, botToken)
  if (!v.ok) {
    return NextResponse.json({ error: `Invalid initData: ${v.error}` }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('user_profiles')
    .select('user_id')
    .eq('telegram_id', v.user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  if (!profile) {
    // Valid Telegram user, but no linked account yet — the DM links it (C-01 б).
    return NextResponse.json({
      unlinked: true,
      telegramId: v.user.id,
      username: v.user.username ?? null,
    })
  }

  const userId = (profile as { user_id: string }).user_id
  const jwt = await mintSupabaseJwt(userId, jwtSecret)
  return NextResponse.json({ jwt, userId })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateInitData } from '@/lib/telegram/init-data'

/**
 * POST /api/tg/auth  — body: { initData: string }
 *
 * Telegram Mini App sign-in (spec-044/046). Validates the Telegram WebApp
 * initData (HMAC over the bot token), finds the linked account, and then
 * establishes a REAL passwordless GoTrue session for that user (admin
 * generateLink → verifyOtp), writing the session cookies on the response.
 *
 * From that point the Mini App is signed in exactly like the desktop app:
 * every server action authorises through the normal cookie session
 * (`resolveAuth` → `getCurrentUser`), with no per-call token handling. initData
 * is the credential here, so this is treated as a login endpoint and the lookup
 * runs under the service role.
 *
 * Responses:
 *   200 { ok: true, userId }                      — linked, session established
 *   200 { unlinked: true, telegramId, username }  — valid TG user, not linked (C-01 б)
 *   400 { error }                                 — bad body
 *   401 { error }                                 — bad/forged/stale initData
 *   500 { error }                                 — server misconfigured / lookup / session
 */
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json(
      { error: 'Server misconfigured: TELEGRAM_BOT_TOKEN missing' },
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

  // Need the account's email to mint a session for it.
  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(userId)
  const email = userRes?.user?.email
  if (getErr || !email) {
    return NextResponse.json({ error: 'Account lookup failed' }, { status: 500 })
  }

  // Synthetic emails ({login}@mol.local) may be unconfirmed; confirm so the
  // magic-link OTP can mint a session on the self-hosted stack.
  if (!userRes.user.email_confirmed_at) {
    await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  }

  // Passwordless session: admin generates a magic-link token (no email sent),
  // we verify it server-side, which writes the session cookies on the response.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: 'Could not start session' }, { status: 500 })
  }

  const supabase = await createClient()
  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (otpErr) {
    return NextResponse.json({ error: `Session failed: ${otpErr.message}` }, { status: 500 })
  }

  // Session cookies are now set on the response — the Mini App is signed in.
  return NextResponse.json({ ok: true, userId })
}

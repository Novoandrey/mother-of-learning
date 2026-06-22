'use client'

import { createClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client for the Telegram Mini App (spec-046).
 *
 * Uses supabase-js's `accessToken` option with the JWT minted from Telegram
 * initData — the official custom-JWT path. No GoTrue session, no cookies; RLS
 * sees auth.uid() = the linked account, so the existing policies apply.
 *
 * `getAccessToken` returns the current minted JWT (held in the page's state and
 * re-minted on open / expiry). Do not also pass `auth` options — supabase-js
 * rejects combining `accessToken` with `auth`.
 */
export function createTgClient(getAccessToken: () => string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => getAccessToken() ?? '',
    },
  )
}

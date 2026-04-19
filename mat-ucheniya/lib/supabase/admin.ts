import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client with the SERVICE ROLE key. Bypasses RLS.
 * MUST be used only in Server Actions, API routes, or other server-only
 * contexts. Never import this into a Client Component.
 *
 * The `server-only` import causes Next.js to fail the build if this module
 * ends up in a client bundle.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

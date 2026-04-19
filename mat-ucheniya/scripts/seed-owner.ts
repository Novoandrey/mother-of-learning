/**
 * scripts/seed-owner.ts
 *
 * CLI для создания первого owner-аккаунта в кампании. Запускается один
 * раз ПОСЛЕ применения миграции 024. Использует service role key для
 * обхода RLS и создания auth-юзера с пропущенной email-верификацией.
 *
 * Usage:
 *   npm run seed-owner -- --login admin --password YOUR_PASSWORD --campaign mat-ucheniya
 *
 * Обязательно: SUPABASE_SERVICE_ROLE_KEY и NEXT_PUBLIC_SUPABASE_URL
 * должны быть в .env.local (или переданы в окружение перед запуском).
 *
 * Идемпотентный: повторный запуск с тем же логином не создаёт дублей,
 * а обновляет пароль и роль (полезно для "забыл пароль owner'а").
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EMAIL_SUFFIX = '@mol.local'

// Simple arg parser: --key value pairs.
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (!val || val.startsWith('--')) {
        throw new Error(`Missing value for --${key}`)
      }
      out[key] = val
      i++
    }
  }
  return out
}

// Load .env.local if SUPABASE vars are not already in environment.
function loadEnvLocal() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return
  }
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      // Strip surrounding quotes.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // No .env.local — assume the vars are injected by the shell.
  }
}

async function main() {
  loadEnvLocal()

  const args = parseArgs(process.argv.slice(2))

  const login = args.login
  const password = args.password
  const campaignSlug = args.campaign ?? 'mat-ucheniya'

  if (!login || !password) {
    console.error('Usage: npm run seed-owner -- --login <login> --password <password> [--campaign <slug>]')
    process.exit(1)
  }

  if (!/^[a-z0-9_-]{3,32}$/.test(login)) {
    console.error(`Invalid login: ${login}. Must match ^[a-z0-9_-]{3,32}$`)
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = `${login}${EMAIL_SUFFIX}`

  // Look up the campaign first so we fail fast if misspelled.
  const { data: campaign, error: campaignErr } = await admin
    .from('campaigns')
    .select('id, name, slug')
    .eq('slug', campaignSlug)
    .single()

  if (campaignErr || !campaign) {
    console.error(`Campaign not found: ${campaignSlug}`)
    process.exit(1)
  }

  console.log(`→ Target campaign: ${campaign.name} (${campaign.slug}, ${campaign.id})`)

  // Check whether this auth-user already exists.
  // Supabase's admin API doesn't have get-by-email yet, so list and filter.
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listErr) {
    console.error('Failed to list users:', listErr.message)
    process.exit(1)
  }

  const existing = listData.users.find((u) => u.email === email)

  let userId: string

  if (existing) {
    console.log(`→ User already exists: ${email} (${existing.id}). Updating password.`)
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, { password })
    if (updErr) {
      console.error('Failed to update password:', updErr.message)
      process.exit(1)
    }
    userId = existing.id
  } else {
    console.log(`→ Creating user: ${email}`)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      console.error('Failed to create user:', createErr?.message ?? 'unknown')
      process.exit(1)
    }
    userId = created.user.id
  }

  // Upsert the profile. Owner seeded this way typed the password themselves,
  // so must_change_password stays false.
  const { error: profileErr } = await admin.from('user_profiles').upsert(
    {
      user_id: userId,
      login,
      display_name: login,
      must_change_password: false,
    },
    { onConflict: 'user_id' },
  )
  if (profileErr) {
    console.error('Failed to upsert user_profiles:', profileErr.message)
    process.exit(1)
  }
  console.log(`→ user_profiles upserted (login=${login})`)

  // Upsert campaign membership with role=owner.
  const { error: memberErr } = await admin.from('campaign_members').upsert(
    {
      campaign_id: campaign.id,
      user_id: userId,
      role: 'owner',
    },
    { onConflict: 'campaign_id,user_id' },
  )
  if (memberErr) {
    console.error('Failed to upsert campaign_members:', memberErr.message)
    process.exit(1)
  }
  console.log(`→ campaign_members upserted (role=owner)`)

  console.log('')
  console.log('✅ Done.')
  console.log(`   Login:    ${login}`)
  console.log(`   Email:    ${email}  (synthetic, never shown in UI)`)
  console.log(`   Campaign: ${campaign.slug}`)
  console.log(`   Role:     owner`)
  console.log('')
  console.log('Next: open https://mother-of-learning.vercel.app/login and sign in.')
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})

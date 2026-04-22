/**
 * scripts/seed-srd.ts
 *
 * Backfill SRD data (conditions, exhaustion levels, effect type) into an
 * existing campaign. Idempotent — safe to re-run.
 *
 * Usage:
 *   npm run seed-srd -- --campaign <slug>
 *   npm run seed-srd -- --campaign <slug> --dry-run
 *
 * For a brand-new campaign created via UI, the server action
 * `initializeCampaignFromTemplate` does this automatically. This CLI is for
 * legacy campaigns that pre-date the action, and for the open-source
 * developer flow (apply migrations → create campaign in SQL → seed SRD).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env or
 * .env.local — same as `seed-owner`.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedCampaignSrd } from '../lib/seeds/dnd5e-srd'
import { invalidateSidebarRemote } from './lib/invalidate-sidebar-remote'

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

function loadEnvLocal() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // No .env.local — assume env is injected by the shell.
  }
}

async function main() {
  loadEnvLocal()

  const args = parseArgs(process.argv.slice(2))
  const campaignSlug = typeof args.campaign === 'string' ? args.campaign : undefined
  const dryRun = args['dry-run'] === true

  if (!campaignSlug) {
    console.error('Usage: npm run seed-srd -- --campaign <slug> [--dry-run]')
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

  if (dryRun) {
    console.log('→ Dry-run mode: no rows will be written. Doing a real seed against a temp table is not currently supported; exiting.')
    process.exit(0)
  }

  const result = await seedCampaignSrd(admin, campaign.id)

  console.log('')
  console.log('✅ Seed complete.')
  console.log(`   node_types inserted: ${result.node_types_inserted}`)
  console.log(`   nodes inserted:      ${result.nodes_inserted}`)
  console.log(`   nodes already there: ${result.nodes_skipped_existing}`)

  await invalidateSidebarRemote(campaignSlug)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})

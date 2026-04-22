/**
 * scripts/dedupe-srd.ts
 *
 * Find and remove duplicate SRD nodes (conditions/effects) in a campaign,
 * grouped by `fields->>'name_en'`. Within each duplicate group we keep the
 * row with the EARLIEST `created_at` — the assumption is that the earlier
 * row is the DM-edited canonical one (e.g. renamed to a gender-neutral
 * Russian title), and the later row is the duplicate that the seeder
 * naively re-inserted before we switched the idempotency key from `title`
 * to `name_en`.
 *
 * Defaults to dry-run. Pass --apply to actually delete.
 *
 * Usage:
 *   npm run dedupe-srd -- --campaign <slug>            # dry-run, prints plan
 *   npm run dedupe-srd -- --campaign <slug> --apply    # really deletes
 *
 * Safety:
 *   • Only touches nodes whose type slug is `condition` or `effect`.
 *   • Only touches nodes that have a non-empty `fields.name_en`.
 *   • Only touches groups that contain >= 2 such rows.
 *   • Skips groups whose name_en isn't in our shipped SRD set (paranoid:
 *     don't dedupe DM-authored homebrew that happens to share a name_en).
 *   • encounter_participants.conditions stores names as STRINGS, not node
 *     IDs (see migration 016), so deleting a node row does NOT cascade-
 *     break existing encounters — the string label survives.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
    /* assume env injected by shell */
  }
}

// English names of every SRD node we ship in lib/seeds/dnd5e-srd.ts.
// Hardcoded here (instead of imported) so this script remains a self-
// contained ops tool — no risk of accidentally importing server-only code.
const SRD_NAME_EN = new Set<string>([
  // 14 base conditions
  'Unconscious',
  'Frightened',
  'Invisible',
  'Incapacitated',
  'Deafened',
  'Petrified',
  'Restrained',
  'Blinded',
  'Poisoned',
  'Charmed',
  'Stunned',
  'Paralyzed',
  'Prone',
  'Grappled',
  // 6 exhaustion levels
  'Exhaustion 1',
  'Exhaustion 2',
  'Exhaustion 3',
  'Exhaustion 4',
  'Exhaustion 5',
  'Exhaustion 6',
])

type NodeRow = {
  id: string
  title: string
  type_id: string
  fields: { name_en?: unknown } | null
  created_at: string
}

async function main() {
  loadEnvLocal()

  const args = parseArgs(process.argv.slice(2))
  const campaignSlug = typeof args.campaign === 'string' ? args.campaign : undefined
  const apply = args.apply === true

  if (!campaignSlug) {
    console.error('Usage: npm run dedupe-srd -- --campaign <slug> [--apply]')
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
  console.log(`→ Mode: ${apply ? 'APPLY (will delete)' : 'dry-run (no changes)'}`)
  console.log('')

  // Fetch the relevant node_type ids (condition + effect) for this campaign.
  const { data: nodeTypes, error: ntErr } = await admin
    .from('node_types')
    .select('id, slug')
    .eq('campaign_id', campaign.id)
    .in('slug', ['condition', 'effect'])

  if (ntErr) {
    console.error('Failed to read node_types:', ntErr.message)
    process.exit(1)
  }

  const typeIds = (nodeTypes ?? []).map((t) => (t as { id: string }).id)
  if (typeIds.length === 0) {
    console.log('No condition/effect node_types found — nothing to do.')
    return
  }

  // Pull all nodes of those types, oldest first (so the first occurrence
  // we see in each group is the one we keep).
  const { data: nodes, error: nodesErr } = await admin
    .from('nodes')
    .select('id, title, type_id, fields, created_at')
    .eq('campaign_id', campaign.id)
    .in('type_id', typeIds)
    .order('created_at', { ascending: true })

  if (nodesErr) {
    console.error('Failed to read nodes:', nodesErr.message)
    process.exit(1)
  }

  // Group by (type_id|name_en).
  const groups = new Map<string, NodeRow[]>()
  for (const raw of (nodes ?? []) as NodeRow[]) {
    const fields = raw.fields ?? {}
    const nameEn = typeof fields.name_en === 'string' ? fields.name_en : ''
    if (!nameEn) continue
    if (!SRD_NAME_EN.has(nameEn)) continue // homebrew with same name_en — skip
    const key = `${raw.type_id}|${nameEn}`
    const arr = groups.get(key) ?? []
    arr.push(raw)
    groups.set(key, arr)
  }

  const dupeGroups = Array.from(groups.entries()).filter(([, rows]) => rows.length > 1)

  if (dupeGroups.length === 0) {
    console.log('✅ No duplicates found.')
    return
  }

  console.log(`Found ${dupeGroups.length} duplicate group(s):`)
  console.log('')

  const idsToDelete: string[] = []

  for (const [key, rows] of dupeGroups) {
    const [keep, ...drop] = rows // earliest created_at wins (ascending order)
    const nameEn = key.split('|')[1]
    console.log(`  [${nameEn}]`)
    console.log(`    KEEP   ${keep.id}  "${keep.title}"  (${keep.created_at})`)
    for (const d of drop) {
      console.log(`    DELETE ${d.id}  "${d.title}"  (${d.created_at})`)
      idsToDelete.push(d.id)
    }
    console.log('')
  }

  console.log(`Total rows to delete: ${idsToDelete.length}`)

  if (!apply) {
    console.log('')
    console.log('Dry-run only. Re-run with --apply to delete.')
    return
  }

  console.log('')
  console.log('→ Deleting...')

  // Delete in chunks just in case there are a lot. Supabase has no hard
  // limit on .in(), but we keep payloads small for resilience.
  const CHUNK = 100
  for (let i = 0; i < idsToDelete.length; i += CHUNK) {
    const slice = idsToDelete.slice(i, i + CHUNK)
    const { error: delErr } = await admin
      .from('nodes')
      .delete()
      .eq('campaign_id', campaign.id)
      .in('id', slice)
    if (delErr) {
      console.error(`Delete failed at chunk ${i / CHUNK}:`, delErr.message)
      process.exit(1)
    }
  }

  console.log(`✅ Deleted ${idsToDelete.length} duplicate node(s).`)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})

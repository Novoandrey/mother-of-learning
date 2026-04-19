/**
 * scripts/seed-players.ts
 *
 * Bulk-создание игроков-пользователей и привязка их к PC через
 * node_pc_owners (many-to-many).
 *
 * Вход — JSON-файл формата:
 *   [
 *     { "player": "Катя",  "surname": "Петрова", "pcs": ["Янка"] },
 *     { "player": "Миша",  "surname": "Иванов",  "pcs": ["Зак", "Локи"] },
 *     { "player": "Варя",  "pcs": ["Зак"] }
 *   ]
 *
 * Логин генерируется как translit(player).toLowerCase() + '_' +
 *   (surname ? translit(surname[0]) : '') + '_player'
 *
 *   Катя → katya_p_player           (если surname="Петрова")
 *   Варя → varya__player            (если surname не дан) — лучше дать
 *
 * Для PC:
 *   - PC ищется по title (case-insensitive). Если не найден — пропускается с warning.
 *   - Одно и то же имя PC у разных игроков → oba становятся co-owner через node_pc_owners.
 *
 * Дефолтный пароль: changeme123. Флаг must_change_password=true.
 *
 * Идемпотентный: повторный запуск по тому же файлу ничего не ломает.
 *   - auth-user существует → переиспользуем (пароль не меняем)
 *   - campaign_members уже есть → skip
 *   - node_pc_owners уже есть → skip (ON CONFLICT)
 *
 * Usage:
 *   npm run seed-players -- --file ./players.json --campaign mat-ucheniya
 *   npm run seed-players -- --file ./players.json --password mySecret
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EMAIL_SUFFIX = '@mol.local'
const DEFAULT_PASSWORD = 'changeme123'

// ─────────────────────────── Transliteration ───────────────────────────

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function translit(input: string): string {
  const s = input.trim().toLowerCase()
  let out = ''
  for (const ch of s) {
    if (ch in TRANSLIT) out += TRANSLIT[ch]
    else if (/[a-z0-9_-]/.test(ch)) out += ch
    else if (/\s/.test(ch)) out += '_'
    // else: drop (punctuation, emoji, etc.)
  }
  // Collapse repeated _ and strip leading/trailing
  return out.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

function makeLogin(player: string, surname: string | undefined): string {
  const p = translit(player)
  const s = surname ? translit(surname).slice(0, 1) : ''
  return `${p}_${s}_player`
}

// ─────────────────────────── Arg/env parsing (same as other scripts) ───────────────────────────

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
  } catch {}
}

// ─────────────────────────── Types ───────────────────────────

type PlayerEntry = {
  player: string
  surname?: string
  pcs: string[]
}

// ─────────────────────────── Main ───────────────────────────

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  const filePath = args.file
  const campaignSlug = args.campaign ?? 'mat-ucheniya'
  const password = args.password ?? DEFAULT_PASSWORD

  if (!filePath) {
    console.error('Usage: npm run seed-players -- --file <players.json> [--campaign <slug>] [--password <pw>]')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Parse JSON
  const raw = readFileSync(resolve(filePath), 'utf-8')
  const entries = JSON.parse(raw) as PlayerEntry[]
  if (!Array.isArray(entries)) {
    console.error('JSON must be an array of {player, surname?, pcs[]}.')
    process.exit(1)
  }

  // Resolve campaign
  const { data: campaign } = await admin
    .from('campaigns')
    .select('id, name, slug')
    .eq('slug', campaignSlug)
    .single()
  if (!campaign) {
    console.error(`Campaign not found: ${campaignSlug}`)
    process.exit(1)
  }
  console.log(`→ Campaign: ${campaign.name}`)

  // Resolve character node_type + load all PCs by title
  const { data: characterType } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'character')
    .maybeSingle()
  if (!characterType) {
    console.error("node_type 'character' not found.")
    process.exit(1)
  }
  const { data: pcRows } = await admin
    .from('nodes')
    .select('id, title')
    .eq('campaign_id', campaign.id)
    .eq('type_id', characterType.id)
  const pcByName = new Map<string, { id: string; title: string }>()
  for (const p of pcRows ?? []) {
    pcByName.set(p.title.trim().toLowerCase(), p as { id: string; title: string })
  }

  // ─── Detect login collisions upfront ───
  const loginsSoFar = new Map<string, string>() // login → player
  const collisions: Array<{ player: string; login: string; other: string }> = []
  for (const e of entries) {
    const login = makeLogin(e.player, e.surname)
    if (loginsSoFar.has(login)) {
      collisions.push({ player: e.player, login, other: loginsSoFar.get(login)! })
    } else {
      loginsSoFar.set(login, e.player)
    }
  }
  if (collisions.length) {
    console.error('\n✗ Login collisions detected. Add "surname" to disambiguate:')
    for (const c of collisions) {
      console.error(`  "${c.player}" and "${c.other}" both produce login "${c.login}"`)
    }
    process.exit(1)
  }

  // ─── Process each player ───
  let playersCreated = 0
  let playersReused = 0
  let membershipsAdded = 0
  let membershipsSkipped = 0
  let ownersAdded = 0
  let ownersSkipped = 0
  const pcsNotFound = new Set<string>()

  for (const entry of entries) {
    const login = makeLogin(entry.player, entry.surname)
    if (!/^[a-z0-9_-]{3,32}$/.test(login)) {
      console.error(`✗ Invalid login "${login}" for player "${entry.player}". Skipping.`)
      continue
    }
    const email = `${login}${EMAIL_SUFFIX}`

    // 1. Find or create auth-user
    const { data: existingProfile } = await admin
      .from('user_profiles')
      .select('user_id, login')
      .eq('login', login)
      .maybeSingle()

    let userId: string
    if (existingProfile) {
      userId = existingProfile.user_id
      playersReused++
      console.log(`  ~ reuse ${login}`)
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createErr || !created.user) {
        console.error(`✗ Failed to create user ${login}:`, createErr?.message)
        continue
      }
      userId = created.user.id
      const { error: profErr } = await admin.from('user_profiles').insert({
        user_id: userId,
        login,
        display_name: entry.player,
        must_change_password: true,
      })
      if (profErr) {
        await admin.auth.admin.deleteUser(userId).catch(() => {})
        console.error(`✗ Failed to create profile for ${login}:`, profErr.message)
        continue
      }
      playersCreated++
      console.log(`  + created ${login} (${entry.player})`)
    }

    // 2. Add to campaign_members as 'player'
    const { data: existingMember } = await admin
      .from('campaign_members')
      .select('user_id')
      .eq('campaign_id', campaign.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (existingMember) {
      membershipsSkipped++
    } else {
      const { error: memErr } = await admin.from('campaign_members').insert({
        campaign_id: campaign.id,
        user_id: userId,
        role: 'player',
      })
      if (memErr) {
        console.error(`  ✗ membership failed for ${login}:`, memErr.message)
      } else {
        membershipsAdded++
      }
    }

    // 3. Link PCs via node_pc_owners (many-to-many)
    for (const pcName of entry.pcs) {
      const pc = pcByName.get(pcName.trim().toLowerCase())
      if (!pc) {
        pcsNotFound.add(pcName)
        console.warn(`    ⚠ PC "${pcName}" not found`)
        continue
      }
      const { error: ownErr, count } = await admin
        .from('node_pc_owners')
        .upsert(
          { node_id: pc.id, user_id: userId },
          { onConflict: 'node_id,user_id', ignoreDuplicates: true, count: 'exact' },
        )
      if (ownErr) {
        console.error(`    ✗ owner link failed for ${login}→${pcName}:`, ownErr.message)
      } else if (count && count > 0) {
        ownersAdded++
        console.log(`    → ${login} owns "${pc.title}"`)
      } else {
        ownersSkipped++
      }
    }
  }

  console.log('\n✓ Done:')
  console.log(`  Players created:     ${playersCreated}`)
  console.log(`  Players reused:      ${playersReused}`)
  console.log(`  Memberships added:   ${membershipsAdded}  (skipped: ${membershipsSkipped})`)
  console.log(`  PC ownerships added: ${ownersAdded}  (skipped: ${ownersSkipped})`)
  if (pcsNotFound.size) {
    console.log(`  ⚠ PCs not found (create them first):`)
    for (const n of pcsNotFound) console.log(`    - ${n}`)
  }
  console.log(`\n  Default password: ${password}`)
  console.log(`  Each player will be forced to change it on first login.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

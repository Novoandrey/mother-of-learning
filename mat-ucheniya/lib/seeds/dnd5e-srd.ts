/**
 * DnD 5e SRD seed: universal node types + content for any new campaign.
 *
 * Background — DEBT-003 (open source blocker):
 *   Migrations 003 (conditions), 005 (effects) and 022 (exhaustion levels)
 *   inserted SRD data with `WHERE c.slug = 'mat-ucheniya'`. Any campaign
 *   created later would have an empty `condition` type, zero conditions,
 *   zero effects — so the encounter tracker would be broken out of the box.
 *
 * Fix:
 *   This module is the single source of truth for SRD seed data. It exposes
 *   `seedCampaignSrd(supabase, campaignId)` which idempotently ensures every
 *   condition/effect node type and SRD node exists. Safe to re-run any
 *   number of times — only missing rows are inserted.
 *
 *   Idempotency key for nodes is `fields->>'name_en'`, NOT `title`. Russian
 *   titles are user-facing and DMs DO rename them (e.g. to gender-neutral
 *   forms — "Бессознательный" → "Без сознания"). The English name is the
 *   stable cross-language identifier that we own and never mutate.
 *
 *   Call sites:
 *     • `initializeCampaignFromTemplate` server action (on campaign create)
 *     • `npm run seed-srd -- --campaign <slug>` CLI (for backfill)
 *
 * Adding new SRD content:
 *   Edit the data arrays below and re-run the seeder. New rows get inserted,
 *   existing rows are left alone (we intentionally do NOT overwrite — DMs
 *   may have edited descriptions for their world).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

type SrdNodeTypeSpec = {
  slug: string
  label: string
  icon: string
  default_fields: Record<string, unknown>
  sort_order: number
}

type SrdNodeSpec = {
  type_slug: string
  title: string
  fields: Record<string, unknown>
}

export type SeedResult = {
  node_types_inserted: number
  nodes_inserted: number
  nodes_skipped_existing: number
}

// Loose Supabase client type — accepts both server (anon) and admin (service)
// clients without forcing the caller to import generated DB types. The rest
// of the codebase doesn't generate or use a typed Database schema, so we
// match that and keep things simple.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

// ============================================================================
// SRD data
// ============================================================================

const NODE_TYPES: SrdNodeTypeSpec[] = [
  {
    slug: 'condition',
    label: 'Состояние',
    icon: '🔴',
    default_fields: { description: '', name_en: '' },
    sort_order: 11,
  },
  {
    slug: 'effect',
    label: 'Эффект',
    icon: '✨',
    default_fields: { description: '', name_en: '' },
    sort_order: 12,
  },
  // spec-015: item nodes. Migration 043 already seeded this for existing
  // campaigns; this entry catches future ones via initializeCampaignFromTemplate.
  // default_fields stays {} — item form is a custom dialog, not the
  // generic node form.
  {
    slug: 'item',
    label: 'Предметы',
    icon: 'package',
    default_fields: {},
    sort_order: 60,
  },
]

// 14 base SRD conditions. The historical "Истощённый" node was replaced by
// six per-level nodes in migration 022; we mirror that here and seed the
// six exhaustion levels separately below.
const CONDITIONS: SrdNodeSpec[] = [
  {
    type_slug: 'condition',
    title: 'Бессознательный',
    fields: {
      name_en: 'Unconscious',
      description:
        'Существо недееспособно, не способно перемещаться и говорить, не осознаёт окружение. Роняет всё, что держит, падает ничком. Автоматически проваливает спасброски Силы и Ловкости. Броски атаки по существу с преимуществом. Атака в пределах 5 фт — автокрит.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Испуганный',
    fields: {
      name_en: 'Frightened',
      description:
        'Помеха на проверки характеристик и броски атаки, пока источник страха в линии обзора. Не может добровольно приблизиться к источнику страха.',
      tags: ['негативное', 'ментальное'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Невидимый',
    fields: {
      name_en: 'Invisible',
      description:
        'Невозможно увидеть без магии. Считается сильно заслонённым. Местонахождение определяется по шуму или следам. Атаки по существу с помехой, его атаки — с преимуществом.',
      tags: ['позитивное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Недееспособный',
    fields: {
      name_en: 'Incapacitated',
      description:
        'Не может совершать действия и реакции. Автоматически проваливает сопротивление захвату/толчку. Теряет концентрацию на заклинании.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Оглохший',
    fields: {
      name_en: 'Deafened',
      description:
        'Ничего не слышит. Автоматически проваливает все проверки, связанные со слухом.',
      tags: ['негативное'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Окаменевший',
    fields: {
      name_en: 'Petrified',
      description:
        'Трансформируется в камень, вес ×10, не стареет. Недееспособен, не двигается, не говорит. Атаки по нему с преимуществом. Проваливает спасброски Силы и Ловкости. Сопротивление всем видам урона. Иммунитет к ядам и болезням.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Опутанный',
    fields: {
      name_en: 'Restrained',
      description:
        'Скорость 0. Атаки по существу с преимуществом, его атаки — с помехой. Помеха на спасброски Ловкости.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Ослеплённый',
    fields: {
      name_en: 'Blinded',
      description:
        'Ничего не видит, проваливает проверки зрения. Атаки по существу с преимуществом, его атаки — с помехой.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Отравленный',
    fields: {
      name_en: 'Poisoned',
      description: 'Помеха на броски атаки и проверки характеристик.',
      tags: ['негативное'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Очарованный',
    fields: {
      name_en: 'Charmed',
      description:
        'Не может атаковать очарователя или делать его целью вредоносных эффектов. Очарователь совершает с преимуществом проверки при социальном взаимодействии.',
      tags: ['негативное', 'ментальное'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Ошеломлённый',
    fields: {
      name_en: 'Stunned',
      description:
        'Недееспособен, не перемещается, говорит запинаясь. Проваливает спасброски Силы и Ловкости. Атаки по существу с преимуществом.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Парализованный',
    fields: {
      name_en: 'Paralyzed',
      description:
        'Недееспособен, не перемещается, не говорит. Проваливает спасброски Силы и Ловкости. Атаки с преимуществом. Атака в пределах 5 фт — автокрит.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Сбитый с ног',
    fields: {
      name_en: 'Prone',
      description:
        'Перемещается только ползком. Помеха на атаки. Атаки в пределах 5 фт — с преимуществом, дальше — с помехой. Встать = ½ перемещения.',
      tags: ['негативное', 'боевое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Схваченный',
    fields: {
      name_en: 'Grappled',
      description:
        'Скорость 0. Оканчивается если схвативший недееспособен или эффект выводит из зоны досягаемости.',
      tags: ['негативное', 'боевое'],
    },
  },
]

// Exhaustion levels 1–6. In 5e (2014) exhaustion is the only condition with
// stacking levels, so we model each level as its own condition node — the
// encounter tracker UI already handles arbitrary condition strings.
const EXHAUSTION: SrdNodeSpec[] = [
  {
    type_slug: 'condition',
    title: 'Истощение 1',
    fields: {
      name_en: 'Exhaustion 1',
      description: 'Помеха на проверки характеристик.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Истощение 2',
    fields: {
      name_en: 'Exhaustion 2',
      description: '+ Скорость уменьшена вдвое.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Истощение 3',
    fields: {
      name_en: 'Exhaustion 3',
      description: '+ Помеха на броски атаки и спасброски.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Истощение 4',
    fields: {
      name_en: 'Exhaustion 4',
      description: '+ Максимальные ХП уменьшены вдвое.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Истощение 5',
    fields: {
      name_en: 'Exhaustion 5',
      description: '+ Скорость уменьшена до 0.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
  {
    type_slug: 'condition',
    title: 'Истощение 6',
    fields: {
      name_en: 'Exhaustion 6',
      description: 'Смерть.',
      tags: ['негативное', 'накапливаемое'],
    },
  },
]

// Effects type currently has no SRD nodes — only the type itself is seeded.
// DMs add their own (homebrew spells, environmental effects, etc.). When/if
// we want to ship a starter set of generic 5e effects, append them here.
const EFFECTS: SrdNodeSpec[] = []

const ALL_NODES: SrdNodeSpec[] = [...CONDITIONS, ...EXHAUSTION, ...EFFECTS]

// ============================================================================
// Seeder
// ============================================================================

/**
 * Idempotently seeds SRD node types and SRD content into a campaign.
 *
 * Strategy:
 *   1. Upsert node types on (campaign_id, slug) — that pair is UNIQUE in
 *      the schema, so this is a true upsert.
 *   2. For each node spec, look up existing nodes by (campaign_id, type_id,
 *      title) in one query, then bulk-insert only the missing ones. We do
 *      NOT update existing nodes — DMs may have edited descriptions and we
 *      respect that. Re-seed = additive only.
 *
 * @returns counts of inserts/skips for logging by the caller.
 */
export async function seedCampaignSrd(
  supabase: AnySupabase,
  campaignId: string,
): Promise<SeedResult> {
  const result: SeedResult = {
    node_types_inserted: 0,
    nodes_inserted: 0,
    nodes_skipped_existing: 0,
  }

  // -- 1. Upsert node types -------------------------------------------------
  //
  // We upsert (don't update) — `ignoreDuplicates: true` matches the original
  // migrations' `ON CONFLICT DO NOTHING` behaviour. We can't tell from
  // Supabase's response how many were *actually* new vs ignored, so we count
  // by re-selecting after the upsert and diffing against existing rows.
  const { data: existingTypes, error: existingTypesErr } = await supabase
    .from('node_types')
    .select('slug')
    .eq('campaign_id', campaignId)
    .in(
      'slug',
      NODE_TYPES.map((t) => t.slug),
    )

  if (existingTypesErr) {
    throw new Error(`seedCampaignSrd: failed to read node_types: ${existingTypesErr.message}`)
  }

  const existingTypeSlugs = new Set(
    (existingTypes ?? []).map((r) => (r as { slug: string }).slug),
  )
  const missingTypes = NODE_TYPES.filter((t) => !existingTypeSlugs.has(t.slug))

  if (missingTypes.length > 0) {
    const { error: insertTypesErr } = await supabase.from('node_types').insert(
      missingTypes.map((t) => ({
        campaign_id: campaignId,
        slug: t.slug,
        label: t.label,
        icon: t.icon,
        default_fields: t.default_fields,
        sort_order: t.sort_order,
      })),
    )
    if (insertTypesErr) {
      throw new Error(`seedCampaignSrd: failed to insert node_types: ${insertTypesErr.message}`)
    }
    result.node_types_inserted = missingTypes.length
  }

  // -- 2. Resolve type slugs to ids ----------------------------------------
  const { data: typeRows, error: typeRowsErr } = await supabase
    .from('node_types')
    .select('id, slug')
    .eq('campaign_id', campaignId)
    .in(
      'slug',
      NODE_TYPES.map((t) => t.slug),
    )

  if (typeRowsErr) {
    throw new Error(`seedCampaignSrd: failed to resolve node_type ids: ${typeRowsErr.message}`)
  }

  const typeIdBySlug = new Map<string, string>()
  for (const row of (typeRows ?? []) as { id: string; slug: string }[]) {
    typeIdBySlug.set(row.slug, row.id)
  }

  // -- 3. Insert missing nodes ---------------------------------------------
  if (ALL_NODES.length === 0) return result

  const requiredTypeIds = Array.from(
    new Set(ALL_NODES.map((n) => typeIdBySlug.get(n.type_slug)).filter(Boolean) as string[]),
  )

  // Read existing nodes' English names. We use `name_en` (not `title`) as
  // the idempotency key because Russian titles are user-editable — DMs
  // rename them (gender-neutral forms, world-specific flavor) and we must
  // not duplicate-seed under the original Russian title.
  const { data: existingNodes, error: existingNodesErr } = await supabase
    .from('nodes')
    .select('type_id, fields')
    .eq('campaign_id', campaignId)
    .in('type_id', requiredTypeIds)

  if (existingNodesErr) {
    throw new Error(`seedCampaignSrd: failed to read existing nodes: ${existingNodesErr.message}`)
  }

  // Compose a (type_id|name_en) lookup key. name_en alone is not
  // unique across node types — a future "effect" called "Bless" and a
  // hypothetical "condition" called "Bless" must coexist.
  const existingKey = new Set<string>()
  for (const row of (existingNodes ?? []) as { type_id: string; fields: unknown }[]) {
    const fields = (row.fields ?? {}) as { name_en?: unknown }
    const nameEn = typeof fields.name_en === 'string' ? fields.name_en : ''
    if (nameEn) existingKey.add(`${row.type_id}|${nameEn}`)
  }

  const toInsert: { campaign_id: string; type_id: string; title: string; fields: unknown }[] = []
  for (const node of ALL_NODES) {
    const typeId = typeIdBySlug.get(node.type_slug)
    if (!typeId) {
      // Defensive: shouldn't happen — we just inserted the type above.
      throw new Error(`seedCampaignSrd: node_type slug not found: ${node.type_slug}`)
    }
    const nameEn = typeof node.fields.name_en === 'string' ? node.fields.name_en : ''
    if (!nameEn) {
      // Every SRD node must have a stable name_en — refuse to seed without one,
      // otherwise re-runs would duplicate.
      throw new Error(`seedCampaignSrd: SRD node "${node.title}" missing name_en`)
    }
    const key = `${typeId}|${nameEn}`
    if (existingKey.has(key)) {
      result.nodes_skipped_existing += 1
      continue
    }
    toInsert.push({
      campaign_id: campaignId,
      type_id: typeId,
      title: node.title,
      fields: node.fields,
    })
  }

  if (toInsert.length > 0) {
    const { error: insertNodesErr } = await supabase.from('nodes').insert(toInsert)
    if (insertNodesErr) {
      throw new Error(`seedCampaignSrd: failed to insert nodes: ${insertNodesErr.message}`)
    }
    result.nodes_inserted = toInsert.length
  }

  return result
}

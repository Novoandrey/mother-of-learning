export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { parseSpellLevel, spellLevelLabel } from '@/lib/spell'
import { unwrapOne } from '@/lib/supabase/joins'
import { SpellEditionView } from '@/components/spell-edition-view'

// ─────────────────────────── row → view model ───────────────────────────

type SpellRow = {
  id: string
  title: string
  content: string | null
  fields: Record<string, unknown> | null
  type: { slug: string } | { slug: string }[] | null
}

type SpellView = {
  id: string
  title: string
  content: string
  content2024: string
  level: number | null
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  concentration: boolean
  ritual: boolean
  classes: string
  source: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Fetch a single spell node, verifying `node_type='spell'`. Null otherwise. */
async function getSpell(campaignId: string, id: string): Promise<SpellView | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, content, fields, type:node_types(slug)')
    .eq('id', id)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error) throw new Error(`getSpell: ${error.message}`)
  if (!data) return null

  const row = data as SpellRow
  const type = unwrapOne(row.type)
  if (!type || type.slug !== 'spell') return null

  const f = row.fields ?? {}
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    content2024: str(f.content_2024),
    level: parseSpellLevel(f.level),
    school: str(f.school),
    castingTime: str(f.casting_time),
    range: str(f.range),
    components: str(f.components),
    duration: str(f.duration),
    concentration: f.concentration === true,
    ritual: f.ritual === true,
    classes: str(f.classes),
    source: str(f.source),
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { title: 'Не найдено' }
  const spell = await getSpell(campaign.id, id)
  return { title: spell ? `${spell.title} — ${campaign.name}` : 'Не найдено' }
}

export default async function SpellPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  await requireAuth()

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const spell = await getSpell(campaign.id, id)
  if (!spell) notFound()

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <Link
          href={`/c/${slug}/spells`}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          ← Все заклинания
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{spell.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {spell.level !== null && <Chip>{spellLevelLabel(spell.level)}</Chip>}
          {spell.school && <Chip>{spell.school}</Chip>}
          {spell.concentration && <Chip>Концентрация</Chip>}
          {spell.ritual && <Chip>Ритуал</Chip>}
        </div>
      </header>

      {/* Structured fields panel */}
      <section className="grid gap-3 rounded border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Время накладывания" value={spell.castingTime || '—'} />
        <Stat label="Дистанция" value={spell.range || '—'} />
        <Stat label="Компоненты" value={spell.components || '—'} />
        <Stat label="Длительность" value={spell.duration || '—'} />
        <Stat label="Классы" value={spell.classes || '—'} />
        <Stat label="Источник" value={spell.source || '—'} />
      </section>

      {/* Body — edition switcher (2014/2024) */}
      <SpellEditionView
        nodeId={spell.id}
        campaignSlug={slug}
        content2014={spell.content}
        content2024={spell.content2024}
      />
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
      {children}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

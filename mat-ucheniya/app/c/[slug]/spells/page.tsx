export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { parseSpellLevel } from '@/lib/spell'

type SpellListItem = { id: string; title: string; level: number | null }

// Section heading for a level group. Заговоры (0) отдельно; null-уровень в
// хвост под «Прочее».
function levelHeading(level: number | null): string {
  if (level === null) return 'Прочее'
  return level === 0 ? 'Заговоры' : `${level} уровень`
}

/**
 * Все spell-ноды кампании. Не полагаемся на limit-200: заклинаний могут быть
 * сотни. Тянем страницами (PostgREST клампит ответ до db_max_rows ≈ 1000
 * серверно, поэтому крутим до недобора страницы). Фильтр по названию (?q)
 * применяем в SQL; уровень — в памяти (он в jsonb, толерантный parseSpellLevel).
 */
async function getSpells(campaignId: string, q: string): Promise<SpellListItem[]> {
  const supabase = await createClient()

  const PAGE_SIZE = 1000
  const MAX_PAGES = 10
  type Row = { id: string; title: string; fields: Record<string, unknown> | null }
  const rows: Row[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('nodes')
      .select('id, title, fields, node_types!inner(slug)')
      .eq('campaign_id', campaignId)
      .eq('node_types.slug', 'spell')
      .order('title')
      .range(from, to)
    if (q) query = query.ilike('title', `%${q}%`)

    const { data, error } = await query
    if (error) throw new Error(`getSpells: ${error.message}`)
    const chunk = (data ?? []) as Row[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
  }

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      level: parseSpellLevel((r.fields ?? {}).level),
    }))
    .sort((a, b) => {
      const la = a.level ?? 99
      const lb = b.level ?? 99
      if (la !== lb) return la - lb
      return a.title.localeCompare(b.title, 'ru')
    })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Заклинания — ${campaign.name}` : 'Не найдено' }
}

export default async function SpellsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  const qRaw = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const q = (qRaw ?? '').trim()
  const levelRaw = Array.isArray(sp.level) ? sp.level[0] : sp.level
  const levelFilter = parseSpellLevel(levelRaw)

  await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const all = await getSpells(campaign.id, q)
  const spells =
    levelFilter !== null ? all.filter((s) => s.level === levelFilter) : all

  // Уровни, которые реально есть — для чипов-фильтров.
  const presentLevels = Array.from(
    new Set(all.map((s) => s.level).filter((l): l is number => l !== null)),
  ).sort((a, b) => a - b)

  // Группировка по уровню (в порядке уже отсортированного массива).
  const groups: { level: number | null; items: SpellListItem[] }[] = []
  for (const s of spells) {
    const last = groups[groups.length - 1]
    if (last && last.level === s.level) last.items.push(s)
    else groups.push({ level: s.level, items: [s] })
  }

  const base = `/c/${slug}/spells`
  const chipHref = (level: number | null) => {
    const parts: string[] = []
    if (q) parts.push(`q=${encodeURIComponent(q)}`)
    if (level !== null) parts.push(`level=${level}`)
    return parts.length ? `${base}?${parts.join('&')}` : base
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Заклинания</h1>
        <p className="text-sm text-gray-500">
          Справочник заклинаний кампании — редакции 2014 и 2024.
        </p>
      </header>

      {/* Поиск по названию */}
      <form action={base} method="get">
        <div className="relative max-w-md">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Найти заклинание…"
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {levelFilter !== null && (
            <input type="hidden" name="level" value={levelFilter} />
          )}
        </div>
      </form>

      {/* Чипы уровней */}
      {presentLevels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <LevelChip href={chipHref(null)} active={levelFilter === null}>
            Все
          </LevelChip>
          {presentLevels.map((lvl) => (
            <LevelChip key={lvl} href={chipHref(lvl)} active={levelFilter === lvl}>
              {lvl === 0 ? 'Заговоры' : lvl}
            </LevelChip>
          ))}
        </div>
      )}

      {spells.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <p className="text-gray-400">
            {q || levelFilter !== null ? 'Ничего не найдено' : 'Заклинаний пока нет'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.level ?? 'other'}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {levelHeading(g.level)}
                <span className="ml-2 font-normal text-gray-300">{g.items.length}</span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((s) => (
                  <Link
                    key={s.id}
                    href={`${base}/${s.id}`}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    {s.title}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function LevelChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
    >
      {children}
    </Link>
  )
}

export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Сессии — ${campaign.name}` : 'Сессии' }
}

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ loop?: string; q?: string }>
}) {
  const { slug } = await params
  const { loop: loopParam, q } = await searchParams
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  // All loops for filter tabs
  const { data: loops } = await supabase
    .from('loops')
    .select('id, number, title, status')
    .eq('campaign_id', campaign.id)
    .order('number', { ascending: true })

  // Sessions query
  let query = supabase
    .from('sessions')
    .select('id, session_number, title, played_at, loop_number, recap')
    .eq('campaign_id', campaign.id)
    .order('session_number', { ascending: false })

  if (loopParam) {
    query = query.eq('loop_number', parseInt(loopParam))
  }

  const { data: sessions } = await query

  const filteredSessions = sessions?.filter((s) => {
    if (!q) return true
    const text = `${s.title ?? ''} ${s.recap ?? ''}`.toLowerCase()
    return text.includes(q.toLowerCase())
  }) ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Сессии</h1>
        <Link
          href={`/c/${slug}/sessions/new${loopParam ? `?loop=${loopParam}` : ''}`}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + Сессия
        </Link>
      </div>

      {/* Loop filter tabs */}
      {loops && loops.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Link
            href={`/c/${slug}/sessions`}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              !loopParam
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Все
          </Link>
          {loops.map((l) => (
            <Link
              key={l.id}
              href={`/c/${slug}/sessions?loop=${l.number}`}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                loopParam === String(l.number)
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {l.status === 'current' ? '🔄 ' : ''}Петля {l.number}
              {l.title ? ` — ${l.title}` : ''}
            </Link>
          ))}
        </div>
      )}

      {/* Search */}
      <form method="get">
        {loopParam && <input type="hidden" name="loop" value={loopParam} />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Поиск по названию и рекапу…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </form>

      {/* Session list */}
      {filteredSessions.length > 0 ? (
        <div className="space-y-2">
          {filteredSessions.map((s) => (
            <Link
              key={s.id}
              href={`/c/${slug}/sessions/${s.id}`}
              className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex flex-col items-center pt-0.5 shrink-0">
                <span className="text-xs font-mono text-gray-400">#{s.session_number}</span>
                {s.loop_number != null && (
                  <span className="mt-1 text-xs text-gray-400">П{s.loop_number}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {s.title ?? `Сессия ${s.session_number}`}
                </p>
                {s.recap && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{s.recap}</p>
                )}
              </div>
              {s.played_at && (
                <span className="text-xs text-gray-400 shrink-0 pt-0.5">
                  {new Date(s.played_at).toLocaleDateString('ru-RU', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <p className="text-gray-500">
            {q ? 'Ничего не найдено' : 'Нет сессий'}
          </p>
          <Link
            href={`/c/${slug}/sessions/new`}
            className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800"
          >
            Добавить первую →
          </Link>
        </div>
      )}
    </div>
  )
}
